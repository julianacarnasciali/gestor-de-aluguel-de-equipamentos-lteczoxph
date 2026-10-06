// Hook: envia e-mail do serviço avulso ao cliente (cópia p/ Juliana+Luiz)
// logo após a criação (boleto + Pix + NF já gravados pelo servico_avulso.js).
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

    const valor = Number(rec.getFloat('valor') || 0)
    const brl =
      'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const venc = String(rec.getString('data_vencimento') || '')
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/')
    const boletoUrl = String(rec.getString('asaas_boleto_url') || '')
    const nfUrl = String(rec.getString('asaas_invoice_url') || '')

    const assunto = `Serviço prestado — ${empresa.getString('nome')} (${brl})`
    let corpo =
      '<p>Olá,</p>' +
      `<p>Segue a cobrança do serviço prestado pela <strong>LCCA Tecnologia</strong>.</p>` +
      `<p><strong>Serviço:</strong> ${rec.getString('descricao')}</p>` +
      `<p><strong>Valor: ${brl}</strong> · Vencimento: <strong>${venc}</strong></p>`
    if (boletoUrl) {
      corpo += `<p><a href="${boletoUrl}" style="background:#0d9488;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">📄 Visualizar boleto</a></p>`
    }
    if (rec.getString('asaas_pix_payload')) {
      corpo += `<p>⚡ <strong>Pix:</strong> o código copia e cola está no anexo/relatório ou pode ser solicitado por aqui.</p>`
    }
    if (nfUrl) {
      corpo += `<p><a href="${nfUrl}">🧾 Nota fiscal de serviço (PDF)</a></p>`
    }
    corpo +=
      '<p style="color:#64748b;font-size:12px">Qualquer dúvida, responda este e-mail ou fale conosco.</p>' +
      '<p style="color:#64748b;font-size:12px">LCCA Tecnologia · Locação e suporte de TI</p>'

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
