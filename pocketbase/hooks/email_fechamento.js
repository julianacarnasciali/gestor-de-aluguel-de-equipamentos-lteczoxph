// Hook: envia e-mail do fechamento ao cliente (cópia p/ Juliana+Luiz) quando
// a NFS-e é autorizada — ou imediatamente se a empresa não emite nota.
// Dispara no UPDATE do fechamento (status/asaas_invoice_* mudam via webhook).
onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    const status = rec.getString('status')
    if (status !== 'emitido' && status !== 'enviado') {
      e.next()
      return
    }
    // já enviado antes? não reenvia
    if (rec.getString('status') === 'enviado') {
      e.next()
      return
    }
    const nfStatus = String(rec.getString('asaas_invoice_status') || '')
    const emiteNF = (() => {
      try {
        const emp = $app.findRecordById('empresas', rec.getString('empresa'))
        return emp.getBool('emite_nf')
      } catch (_) {
        return false
      }
    })()
    // se emite NF, só envia quando a nota estiver AUTORIZADA (ou erro — aí manda sem a nota)
    if (emiteNF && !nfStatus) {
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
      console.warn('[email-fechamento] sem BREVO_API_KEY')
      e.next()
      return
    }

    // destinatários: contatos da empresa (JSON contatos + responsavel_email)
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
    try {
      const contatos = JSON.parse(empresa.getString('contatos') || '[]')
      for (const c of contatos) addDest(c.email, c.nome)
    } catch (_) {}
    addDest(empresa.getString('responsavel_email'), empresa.getString('responsavel_nome'))
    addDest(empresa.getString('email'), empresa.getString('nome'))
    if (dests.length === 0) {
      console.warn('[email-fechamento] sem destinatarios p/ empresa', empresa.getString('nome'))
      e.next()
      return
    }

    const competencia = rec.getString('competencia')
    // JSVM (goja) não suporta toLocaleString com opções — formata na mão
    const valor = Number(rec.getFloat('valor_final') || rec.getFloat('total') || 0)
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

    const assunto = `Fechamento ${competencia} — ${empresa.getString('nome')} (${brl})`
    let corpo =
      '<p>Olá,</p>' +
      `<p>Segue o fechamento da competência <strong>${competencia}</strong> de locação e serviços de TI.</p>` +
      `<p><strong>Valor: ${brl}</strong> · Vencimento: <strong>${venc}</strong></p>`
    if (boletoUrl) {
      corpo += `<p><a href="${boletoUrl}" style="background:#0d9488;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">📄 Visualizar boleto</a></p>`
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
      rec.set('status', 'enviado')
      $app.save(rec)
      console.log(
        '[email-fechamento] enviado p/ empresa',
        empresa.getString('nome'),
        '| messageId:',
        r.json.messageId,
      )
    } else {
      console.warn('[email-fechamento] falhou', r.statusCode, JSON.stringify(r.json).slice(0, 300))
    }
  } catch (err) {
    console.warn('[email-fechamento] erro geral', err)
  }
  e.next()
}, 'fechamentos')
