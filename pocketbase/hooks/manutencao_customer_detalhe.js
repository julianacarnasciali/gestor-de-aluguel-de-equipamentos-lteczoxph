// DIAGNÓSTICO (05/11/2026): lista os pagamentos e as notas de um cliente do
// Asaas com o DETALHE de cada um (valor, vencimento, status, data de criação).
// Existe porque a contagem de pagamentos/notas da Maxi subiu de 0 para 1 entre
// duas conferências e é preciso saber se algo foi criado por engano.
// LEITURA PURA: só GET.
routerAdd('POST', '/backend/v1/manutencao/asaas-customer-detalhe', (e) => {
  let autorizado = false
  try {
    if (e.auth && e.auth.id) autorizado = true
  } catch (_) {}
  if (!autorizado) {
    const secret = $secrets.get('MAESTRO_TOKEN') || ''
    const got = String(e.request.header.get('x-maestro-token') || '')
    if (secret && got === secret) autorizado = true
  }
  if (!autorizado) return e.unauthorizedError('login necessario')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const customerId = String((body && body.customerId) || '')
  if (!customerId) return e.badRequestError('customerId obrigatorio')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  const out = { customerId: customerId }

  try {
    const rp = $http.send({
      url: base + '/payments?customer=' + customerId,
      method: 'GET',
      headers,
      timeout: 40,
    })
    out.payments_total = rp.json ? Number(rp.json.totalCount || 0) : 'erro ' + rp.statusCode
    out.payments = (rp.json && rp.json.data ? rp.json.data : []).map((p) => ({
      id: p.id,
      value: p.value,
      dueDate: p.dueDate,
      status: p.status,
      dateCreated: p.dateCreated,
      description: p.description,
      externalReference: p.externalReference,
      billingType: p.billingType,
      invoiceUrl: p.invoiceUrl,
      deleted: p.deleted,
      customer: p.customer,
    }))
  } catch (err) {
    out.erro_payments = String(err)
  }

  try {
    const rn = $http.send({
      url: base + '/invoices?customer=' + customerId,
      method: 'GET',
      headers,
      timeout: 40,
    })
    out.invoices_total = rn.json ? Number(rn.json.totalCount || 0) : 'erro ' + rn.statusCode
    out.invoices = (rn.json && rn.json.data ? rn.json.data : []).map((n) => ({
      id: n.id,
      status: n.status,
      value: n.value,
      effectiveDate: n.effectiveDate,
      payment: n.payment,
      serviceDescription: n.serviceDescription,
      externalReference: n.externalReference,
      customer: n.customer,
    }))
  } catch (err) {
    out.erro_invoices = String(err)
  }

  return e.json(200, out)
})
