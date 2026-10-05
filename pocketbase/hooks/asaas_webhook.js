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
  if (!paymentId) return e.json(200, { ok: true, ignorado: 'sem payment.id' })
  if (
    evento === 'PAYMENT_CONFIRMED' ||
    evento === 'PAYMENT_RECEIVED' ||
    evento === 'PAYMENT_RECEIVED_IN_CASH'
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
  }
  return e.json(200, { ok: true })
})
