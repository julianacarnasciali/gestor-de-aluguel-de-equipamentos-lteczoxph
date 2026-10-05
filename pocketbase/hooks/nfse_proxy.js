// TEMPORÁRIO: proxy de diagnóstico NFS-e. REMOVER depois.
routerAdd('POST', '/backend/v1/asaas-proxy', (e) => {
  const esperado = $secrets.get('ASAAS_WEBHOOK_TOKEN')
  const recebido = e.request.header.get('asaas-access-token') || ''
  if (!esperado || recebido !== esperado) return e.unauthorizedError('token invalido')
  const body = e.requestInfo().body
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'
  const headers = {
    access_token: $secrets.get('ASAAS_API_KEY'),
    'Content-Type': 'application/json',
  }
  const path = String((body && body.path) || '/invoices')
  const method = String((body && body.method) || 'POST')
  const opts = { url: base + path, method, headers }
  if (method !== 'GET') opts.body = JSON.stringify((body && body.payload) || {})
  const res = $http.send(opts)
  return e.json(res.statusCode || 500, res.json)
})
