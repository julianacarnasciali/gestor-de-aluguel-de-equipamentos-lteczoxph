// Hook: envia e-mail do serviço avulso ao cliente (cópia p/ Juliana+Luiz)
// logo após a criação (boleto + Pix + NF já gravados pelo servico_avulso.js).
// 26/10 (pedido dela): (1) descrição passa por correção ortográfica IA antes de
// ir ao cliente (Luiz escreve sem maiúscula/acento); (2) relatório do serviço é
// ARQUIVADO (campo relatorio_html) e o e-mail inclui link p/ visualizar —
// histórico navegável por 6+ meses (fica no banco, sem expiração).
// TUDO inline no callback (JSVM não compartilha funções top-level).
onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    // dispara quando o Pix é gravado (último passo do hook de cobrança)
    if (!rec.getString('asaas_pix_payload')) {
      e.next()
      return
    }
    if (rec.getString('email_enviado') === 'sim') {
      e.next()
      return
    }
    // JANELA DE SEGURANÇA (02/11): só manda depois que a fila gerou de fato.
    // Evita e-mail de teste/erro se alguém mexer no registro dentro da janela.
    if (String(rec.getString('cobranca_status') || '') !== 'gerada') {
      e.next()
      return
    }

    const apiKey = $secrets.get('BREVO_API_KEY')
    const senderEmail = $secrets.get('BREVO_SENDER_EMAIL') || 'julianacrc@icloud.com'
    const senderName = $secrets.get('BREVO_SENDER_NAME') || 'LCCA Tecnologia'
    const copias = String($secrets.get('BREVO_COPIA_EMAILS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!apiKey) {
      console.warn('[email-servico] sem BREVO_API_KEY')
      e.next()
      return
    }

    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', rec.getString('empresa'))
    } catch (_) {}
    if (!empresa) {
      e.next()
      return
    }
    const dests = []
    const vistos = new Set()
    const addDest = (email, nome) => {
      const mail = String(email || '')
        .trim()
        .toLowerCase()
      if (!mail || !mail.includes('@') || vistos.has(mail)) return
      vistos.add(mail)
      dests.push({ email: mail, name: String(nome || empresa.getString('nome') || '') })
    }
    addDest(empresa.getString('email'), empresa.getString('nome'))
    addDest(empresa.getString('responsavel_email'), empresa.getString('responsavel_nome'))
    if (dests.length === 0) {
      console.warn('[email-servico] sem destinatarios p/ empresa', empresa.getString('nome'))
      e.next()
      return
    }

    // ---- 1. CORREÇÃO ORTOGRÁFICA da descrição (pedido 26/10) ----
    const descricaoOriginal = String(rec.getString('descricao') || '')
    let descricaoCorrigida = descricaoOriginal
    try {
      const prompt =
        'Você é revisor de textos da LCCA Tech. Corrija APENAS ortografia, acentuação, ' +
        'maiúscula/minúscula e gramática da descrição de um serviço técnico prestado. ' +
        'NÃO mude o sentido, NÃO acrescente nada, NÃO invente termos técnicos. ' +
        'Mantenha números, medidas e nomes próprios exatamente como estão. ' +
        'Responda APENAS com JSON válido: {"texto_corrigido": "..."} ' +
        'Descrição: ' +
        JSON.stringify(descricaoOriginal)
      const respAI = $ai.chat({
        model: 'fast',
        messages: [{ role: 'user', content: prompt }],
      })
      const textoAI = String(
        (respAI.choices && respAI.choices[0] && respAI.choices[0].message.content) || '',
      ).trim()
      const m = textoAI.match(/\{[\s\S]*\}/)
      if (m) {
        const j = JSON.parse(m[0])
        const t = String(j.texto_corrigido || '').trim()
        if (t) descricaoCorrigida = t
      }
    } catch (err) {
      console.warn('[email-servico] correção IA falhou — usando texto original', err)
    }
    if (descricaoCorrigida !== descricaoOriginal) {
      rec.set('descricao_original', descricaoOriginal)
      rec.set('descricao', descricaoCorrigida)
      $app.save(rec)
      console.log('[email-servico] descrição corrigida pela IA p/ serviço', rec.id)
    }

    // JSVM (goja) não suporta toLocaleString com opções — formata na mão
    const valor = Number(rec.getFloat('valor') || 0)
    const inteiro = Math.floor(valor)
    const centavos = Math.round((valor - inteiro) * 100)
    const milhar = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const brl = 'R$ ' + milhar + ',' + String(centavos).padStart(2, '0')
    const venc = String(rec.getString('data_vencimento') || '')
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/')
    const boletoUrl = String(rec.getString('asaas_boleto_url') || '')
    const nfUrl = String(rec.getString('asaas_invoice_url') || '')

    // ---- 2. ARQUIVA o relatório (pedido 26/10: visualizar depois) ----
    const esc = (s) =>
      String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    const dataBR = (iso) => {
      const d = String(iso || '').slice(0, 10)
      const p = d.split('-')
      return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso || '—'
    }
    const logo =
      'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/ib0smsxri8sw6q2/full_branco_y8024354gz.png'
    let pagos = ''
    if (boletoUrl) {
      pagos += '<a href="' + boletoUrl + '" style="color:#0d9488">📄 Visualizar boleto</a> · '
    }
    if (rec.getString('asaas_pix_payload')) {
      pagos +=
        '<span style="color:#64748b">Pix copia e cola disponível no boleto/relatório</span> · '
    }
    if (nfUrl) {
      pagos += '<a href="' + nfUrl + '" style="color:#0d9488">🧾 Nota fiscal (PDF)</a>'
    }
    const relHtml =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>Relatório de serviço — ' +
      esc(empresa.getString('nome')) +
      '</title>' +
      '<style>body{font-family:Arial,Helvetica,sans-serif;color:#1F2937;margin:0;background:#f1f5f9}' +
      '.wrap{max-width:720px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}' +
      '.top{background:#0F2A43;padding:18px 24px}' +
      '.top img{width:150px;display:block}' +
      '.body{padding:24px}' +
      'h1{font-size:20px;color:#0F2A43;margin:0 0 4px}' +
      '.kicker{color:#0d9488;font-weight:bold;font-size:11px;letter-spacing:2px;text-transform:uppercase}' +
      'table{width:100%;border-collapse:collapse;margin-top:16px}' +
      'td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;vertical-align:top}' +
      'td.l{color:#64748b;width:170px}' +
      '.desc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-top:14px;font-size:14px;white-space:pre-wrap}' +
      '.foot{padding:14px 24px;color:#8FA6B8;font-size:11px;border-top:1px solid #e2e8f0}' +
      '@media print{body{background:#fff}.wrap{border:none;margin:0}}</style></head><body>' +
      '<div class="wrap"><div class="top"><img src="' +
      logo +
      '" alt="LCCA Tech" /></div>' +
      '<div class="body"><div class="kicker">Relatório de serviço</div>' +
      '<h1>Ordem de serviço ' +
      esc(rec.id) +
      '</h1>' +
      '<table>' +
      '<tr><td class="l">Cliente</td><td><b>' +
      esc(empresa.getString('nome')) +
      '</b>' +
      (empresa.getString('cnpj_cpf') ? ' · ' + esc(empresa.getString('cnpj_cpf')) : '') +
      '</td></tr>' +
      '<tr><td class="l">Data do serviço</td><td>' +
      esc(dataBR(rec.getString('data_servico'))) +
      '</td></tr>' +
      '<tr><td class="l">Vencimento</td><td>' +
      esc(dataBR(rec.getString('data_vencimento'))) +
      '</td></tr>' +
      '<tr><td class="l">Valor</td><td><b>' +
      brl +
      '</b></td></tr>' +
      '<tr><td class="l">Pagamento</td><td>' +
      (pagos || '—') +
      '</td></tr>' +
      '</table>' +
      '<div class="kicker" style="margin-top:18px">Serviço prestado</div>' +
      '<div class="desc">' +
      esc(rec.getString('descricao')) +
      '</div>' +
      '</div>' +
      '<div class="foot">LCCA Tecnologia Ltda · CNPJ 07.667.971/0001-39 · Curitiba/PR · ' +
      'Suporte: (41) 98406-4557 · Documento gerado pelo sistema LCCA Tech — não substitui a nota fiscal de serviço.</div>' +
      '</div></body></html>'
    rec.set('relatorio_html', relHtml)
    $app.save(rec)

    // link público do relatório (rota backend/v1/servico/relatorio?id=...&t=token)
    const relUrl =
      'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/backend/v1/servico/relatorio?id=' +
      rec.id +
      '&t=' +
      encodeURIComponent($secrets.get('MAESTRO_TOKEN') || '')

    const assunto = `Serviço prestado — ${empresa.getString('nome')} (${brl})`
    let corpo =
      '<p>Olá,</p>' +
      `<p>Segue a cobrança do serviço prestado pela <strong>LCCA Tecnologia</strong>.</p>` +
      `<p><strong>Serviço:</strong> ${rec.getString('descricao')}</p>` +
      `<p><strong>Valor: ${brl}</strong> · Vencimento: <strong>${venc}</strong></p>`
    if (boletoUrl) {
      corpo += `<p><a href="${boletoUrl}" style="background:#0d9488;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">📄 Visualizar boleto</a></p>`
    }
    // link do relatório arquivado (sempre disponível, mesmo sem NF)
    corpo += `<p><a href="${relUrl}" style="background:#0F2A43;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">📋 Relatório do serviço</a></p>`
    if (rec.getString('asaas_pix_payload')) {
      corpo += `<p>⚡ <strong>Pix:</strong> o código copia e cola está no anexo/relatório ou pode ser solicitado por aqui.</p>`
    }
    if (nfUrl) {
      corpo += `<p><a href="${nfUrl}">🧾 Nota fiscal de serviço (PDF)</a></p>`
    }
    corpo +=
      '<p style="color:#64748b;font-size:12px">Qualquer dúvida, responda este e-mail ou fale conosco.</p>' +
      // assinatura — LOGO LCCA TECH (aprovada 12/10) + contato do Luiz
      '<div style="margin-top:20px;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="background:#0F2A43;color:#ffffff;padding:14px 16px;border-radius:8px 8px 0 0">' +
      '<img src="https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/ib0smsxri8sw6q2/full_branco_y8024354gz.png" alt="LCCA Tech" width="150" style="display:block;border:0" />' +
      '</div>' +
      '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#f8fafc;padding:12px 16px">' +
      '<div style="font-size:13px;font-weight:bold;color:#0F2A43">Luiz Carlos Carnasciali</div>' +
      '<div style="font-size:12px;color:#64748b">Proprietário &amp; Técnico Responsável</div>' +
      '<div style="font-size:12px;color:#0D9488;margin-top:4px"><strong>📱 (41) 98406-4557</strong> · WhatsApp</div>' +
      '</div>' +
      '</div>'

    const payload = {
      sender: { email: senderEmail, name: senderName },
      to: dests,
      subject: assunto,
      htmlContent: corpo,
    }
    if (copias.length > 0) payload.bcc = copias.map((m) => ({ email: m }))

    const r = $http.send({
      url: 'https://api.brevo.com/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (r.statusCode === 200 || r.statusCode === 201) {
      rec.set('email_enviado', 'sim')
      $app.save(rec)
      console.log(
        '[email-servico] enviado p/ empresa',
        empresa.getString('nome'),
        '| messageId:',
        r.json.messageId,
      )
    } else {
      console.warn('[email-servico] falhou', r.statusCode, JSON.stringify(r.json).slice(0, 300))
    }
  } catch (err) {
    console.warn('[email-servico] erro geral', err)
  }
  e.next()
}, 'servicos')
