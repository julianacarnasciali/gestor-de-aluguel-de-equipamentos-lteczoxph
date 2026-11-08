// Webhook do Asaas: quando o boleto é pago, atualiza o fechamento para "pago".
// Rota pública — validação pelo header asaas-access-token (token próprio do Asaas).
routerAdd('POST', '/backend/v1/webhooks/asaas', (e) => {
  const esperado = $secrets.get('ASAAS_WEBHOOK_TOKEN')
  const recebido = e.request.header.get('asaas-access-token') || ''
  if (!esperado || recebido !== esperado) {
    return e.unauthorizedError('token invalido')
  }
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {
    return e.badRequestError('corpo invalido')
  }
  const evento = (body && body.event) || ''
  const pagamento = (body && body.payment) || {}
  const paymentId = pagamento.id || ''
  console.log('[asaas-webhook] evento:', evento, 'payment:', paymentId)
  if (
    paymentId &&
    (evento === 'PAYMENT_CONFIRMED' ||
      evento === 'PAYMENT_RECEIVED' ||
      evento === 'PAYMENT_RECEIVED_IN_CASH')
  ) {
    try {
      const f = $app.findFirstRecordByFilter(
        'fechamentos',
        "asaas_payment_id = '" + paymentId + "'",
      )
      if (f && f.getString('status') !== 'pago') {
        f.set('status', 'pago')
        $app.save(f)
        console.log('[asaas-webhook] fechamento pago:', f.id)
      }
    } catch (_) {
      console.warn('[asaas-webhook] fechamento nao encontrado p/ payment', paymentId)
    }
    try {
      const s = $app.findFirstRecordByFilter('servicos', "asaas_payment_id = '" + paymentId + "'")
      if (s && s.getString('status') !== 'pago') {
        s.set('status', 'pago')
        s.set('data_pagamento', new Date().toISOString().slice(0, 10))
        $app.save(s)
        console.log('[asaas-webhook] servico avulso pago:', s.id)
      }
    } catch (_) {
      console.warn('[asaas-webhook] servico nao encontrado p/ payment', paymentId)
    }
  }

  // NFS-e: INVOICE_AUTHORIZED confirma emissão; INVOICE_ERROR registra falha
  // (o Asaas manda invoice em body.invoice OU payment em body.payment com invoice)
  if (evento === 'INVOICE_AUTHORIZED' || evento === 'INVOICE_ERROR') {
    const nf = (body && (body.invoice || body.payment)) || {}
    let invoiceId = nf.id || ''
    // fallback: o Asaas às vezes envia o payment e a NF vem por GET /payments/{id}
    if (!invoiceId && paymentId) {
      try {
        const apiKey = $secrets.get('ASAAS_API_KEY')
        const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
        const rp = $http.send({
          url: base + '/payments/' + paymentId,
          method: 'GET',
          headers: { access_token: apiKey },
        })
        invoiceId = String(rp.json.invoice || rp.json.invoiceNumber || '')
      } catch (errF) {
        console.warn('[asaas-webhook] falha ao buscar invoice do payment', paymentId, errF)
      }
    }
    if (invoiceId) {
      try {
        const f = $app.findFirstRecordByFilter(
          'fechamentos',
          "asaas_invoice_id = '" + invoiceId + "'",
        )
        if (f) {
          f.set('asaas_invoice_status', evento === 'INVOICE_AUTHORIZED' ? 'AUTHORIZED' : 'ERROR')
          const url = nf.externalPdfUrl || nf.pdfUrl || ''
          if (url) f.set('asaas_invoice_url', url)
          $app.save(f)
          console.log('[asaas-webhook] NFS-e', evento, 'fechamento:', f.id)
        }
      } catch (_) {
        console.warn('[asaas-webhook] fechamento nao encontrado p/ invoice', invoiceId)
      }
      try {
        const s = $app.findFirstRecordByFilter('servicos', "asaas_invoice_id = '" + invoiceId + "'")
        if (s) {
          s.set('asaas_invoice_status', evento === 'INVOICE_AUTHORIZED' ? 'AUTHORIZED' : 'ERROR')
          const url = nf.externalPdfUrl || nf.pdfUrl || ''
          if (url) s.set('asaas_invoice_url', url)
          $app.save(s)
          console.log('[asaas-webhook] NFS-e', evento, 'servico:', s.id)
          // O e-mail estava bloqueado esperando esta nota? O save acima dispara
          // o email_servico.js, que agora consulta a trava e libera sozinho.
        }
      } catch (_) {
        console.warn('[asaas-webhook] servico nao encontrado p/ invoice', invoiceId)
      }
    }
  }

  return e.json(200, { ok: true })
})
