// CONFERIR um cliente no Asaas — LEITURA PURA (05/11/2026).
// Existe só para verificar o que ficou gravado depois de um cadastro.
// Faz GET /customers?cpfCnpj=... e GET /customers/{id}. Não escreve nada.
routerAdd('POST', '/backend/v1/manutencao/asaas-customer-ver', (e) => {
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
  const empresaId = String((body && body.empresaId) || '')
  if (!empresaId) return e.badRequestError('empresaId obrigatorio')

  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', empresaId)
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  if (!apiKey) return e.badRequestError('sem ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  const customerId = String(empresa.getString('asaas_customer_id') || '')
  const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')

  const saida = {
    empresa: { id: empresaId, nome: empresa.getString('nome'), asaas_customer_id: customerId },
  }

  // quantos cadastros existem com esse CNPJ (1 = correto, 2+ = duplicidade)
  try {
    const r0 = $http.send({
      url: base + '/customers?cpfCnpj=' + doc,
      method: 'GET',
      headers,
      timeout: 40,
    })
    if (r0.statusCode === 200) {
      saida.total_com_este_cnpj = Number(r0.json.totalCount || 0)
      saida.clientes = (r0.json.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        cpfCnpj: c.cpfCnpj,
        phone: c.phone,
        mobilePhone: c.mobilePhone,
        address: c.address,
        addressNumber: c.addressNumber,
        province: c.province,
        cityName: c.cityName,
        state: c.state,
        postalCode: c.postalCode,
        deleted: c.deleted,
      }))
    } else {
      saida.erro_lista = { status: r0.statusCode, corpo: String(r0.body || '').slice(0, 200) }
    }
  } catch (err) {
    saida.erro_lista = String(err)
  }

  // o cliente vinculado, direto pelo id
  if (customerId) {
    try {
      const r1 = $http.send({
        url: base + '/customers/' + customerId,
        method: 'GET',
        headers,
        timeout: 40,
      })
      saida.cliente_vinculado = r1.statusCode === 200 ? r1.json : { status: r1.statusCode }
    } catch (err) {
      saida.erro_cliente = String(err)
    }
  }

  // quantos pagamentos e notas existem para esse cliente (tem de ser ZERO)
  if (customerId) {
    try {
      const rp = $http.send({
        url: base + '/payments?customer=' + customerId,
        method: 'GET',
        headers,
        timeout: 40,
      })
      saida.pagamentos =
        rp.statusCode === 200 ? Number(rp.json.totalCount || 0) : 'erro ' + rp.statusCode
    } catch (_) {}
    try {
      const rn = $http.send({
        url: base + '/invoices?customer=' + customerId,
        method: 'GET',
        headers,
        timeout: 40,
      })
      saida.notas_fiscais =
        rn.statusCode === 200 ? Number(rn.json.totalCount || 0) : 'erro ' + rn.statusCode
    } catch (_) {}
  }

  return e.json(200, saida)
})
