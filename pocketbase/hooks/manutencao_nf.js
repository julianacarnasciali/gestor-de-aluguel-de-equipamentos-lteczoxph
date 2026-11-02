// Rota de manutenção: cancela NFS-e com erro e reagenda a emissão.
// Uso (via curl, por mim — o token vem do cofre do projeto):
//   POST /backend/v1/manutencao/nf-cancelar { "invoiceId": "inv_..." }
//   POST /backend/v1/manutencao/nf-reemitir { "invoiceId": "inv_...", "colecao": "fechamentos|servicos" }
// Autenticação: header x-maestro-token com o valor do secret MAESTRO_TOKEN.
// Sem token -> 401. Nada aqui expõe dados de clientes.
// NOTA JSVM: toda a lógica INLINE nos callbacks (funções de topo não existem no pool).

// Consulta de CNPJ na Receita (para o cadastro de empresas preencher sozinho).
// Fonte 1: BrasilAPI (sem limite, mas instavel) -> Fonte 2: ReceitaWS (3 req/min).
// Rota PUBLICA (sem auth): so devolve dados de cadastro publicos da Receita.
routerAdd('GET', '/backend/v1/cnpj', (e) => {
  const cnpj = String(e.request.url.query().get('cnpj') || '').replace(/\D/g, '')
  if (cnpj.length !== 14) return e.badRequestError('CNPJ precisa ter 14 digitos')

  const tentar = (url) => {
    try {
      const r = $http.send({ url, method: 'GET', headers: { 'User-Agent': 'LCCA-Tech/1.0' } })
      if (r.statusCode === 200) return r.json
      return null
    } catch (_) {
      return null
    }
  }

  // 1) BrasilAPI
  let d = tentar('https://brasilapi.com.br/api/cnpj/v1/' + cnpj)
  if (d && d.razao_social) {
    return e.json(200, {
      fonte: 'brasilapi',
      razao_social: d.razao_social || '',
      nome_fantasia: d.nome_fantasia || '',
      logradouro: d.logradouro || '',
      numero: d.numero || '',
      complemento: d.complemento || '',
      bairro: d.bairro || '',
      municipio: d.municipio || '',
      uf: d.uf || '',
      cep: String(d.cep || '').replace(/\D/g, ''),
      telefone_1: d.ddd_telefone_1 || '',
      email: d.email || '',
    })
  }

  // 2) ReceitaWS
  d = tentar('https://receitaws.com.br/v1/cnpj/' + cnpj)
  if (d && d.nome) {
    return e.json(200, {
      fonte: 'receitaws',
      razao_social: d.nome || '',
      fantasia: d.fantasia || '',
      logradouro: d.logradouro || '',
      numero: d.numero || '',
      complemento: d.complemento || '',
      bairro: d.bairro || '',
      municipio: d.municipio || '',
      uf: d.uf || '',
      cep: String(d.cep || '').replace(/\D/g, ''),
      telefone_1: d.telefone || '',
      email: d.email || '',
    })
  }

  return e.json(502, { erro: 'Consulta indisponivel agora — tente de novo em instantes.' })
})

routerAdd('POST', '/backend/v1/manutencao/ver', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const filtro = String((body && body.filtro) || '')
  if (!colecao || !filtro) return e.badRequestError('colecao e filtro obrigatorios')
  try {
    const items = $app.findRecordsByFilter(colecao, filtro, '', 200, 0)
    return e.json(200, { ok: true, total: items.length, items: items.map((r) => r.publicExport()) })
  } catch (err) {
    return e.badRequestError('erro: ' + String(err))
  }
})

routerAdd('POST', '/backend/v1/manutencao/criar-registro', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const dados = (body && body.dados) || null
  if (!colecao || !dados) return e.badRequestError('colecao e dados obrigatorios')
  try {
    const col = $app.findCollectionByNameOrId(colecao)
    const rec = new Record(col)
    for (const k of Object.keys(dados)) rec.set(k, dados[k])
    $app.save(rec)
    return e.json(200, { ok: true, id: rec.id })
  } catch (err) {
    return e.badRequestError('erro: ' + String(err))
  }
})

routerAdd('POST', '/backend/v1/manutencao/registro-patch', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const id = String((body && body.id) || '')
  const dados = (body && body.dados) || null
  if (!colecao || !id || !dados) return e.badRequestError('colecao, id e dados obrigatorios')
  try {
    const rec = $app.findRecordById(colecao, id)
    for (const k of Object.keys(dados)) rec.set(k, dados[k])
    $app.save(rec)
    return e.json(200, { ok: true, id: rec.id })
  } catch (err) {
    return e.badRequestError('erro: ' + String(err))
  }
})

routerAdd('POST', '/backend/v1/manutencao/empresa-patch', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const empresaId = String((body && body.empresaId) || '')
  const dados = (body && body.dados) || null
  if (!empresaId || !dados) return e.badRequestError('empresaId e dados obrigatorios')
  try {
    const rec = $app.findRecordById('empresas', empresaId)
    for (const k of Object.keys(dados)) rec.set(k, dados[k])
    $app.save(rec)
    return e.json(200, { ok: true, id: rec.id })
  } catch (err) {
    return e.badRequestError('erro: ' + String(err))
  }
})

routerAdd('POST', '/backend/v1/manutencao/apagar-registros', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const ids = (body && body.ids) || []
  if (!colecao || !ids.length) return e.badRequestError('colecao e ids obrigatorios')
  const apagados = []
  for (const id of ids) {
    try {
      $app.delete($app.findRecordById(colecao, String(id)))
      apagados.push(String(id))
    } catch (_) {}
  }
  return e.json(200, { ok: true, apagados: apagados })
})

routerAdd('POST', '/backend/v1/manutencao/nf-cancelar', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const invoiceId = String((body && body.invoiceId) || '')
  if (!invoiceId) return e.badRequestError('invoiceId obrigatorio')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  // Curitiba exige cancelamento REAL: sem o atributo cancelOnlyOnAsaas
  const r = $http.send({
    url: base + '/invoices/' + invoiceId + '/cancel',
    method: 'POST',
    headers,
  })
  console.log(
    '[manutencao] cancelar NF',
    invoiceId,
    r.statusCode,
    JSON.stringify(r.json || {}).slice(0, 300),
  )
  if (r.statusCode !== 200) {
    return e.badRequestError('Asaas: ' + JSON.stringify(r.json).slice(0, 250))
  }
  return e.json(200, { ok: true, cancelled: invoiceId })
})

routerAdd('POST', '/backend/v1/manutencao/nf-reemitir', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const invoiceId = String((body && body.invoiceId) || '')
  const diretoId = String((body && body.id) || '')
  const colecao = String((body && body.colecao) || 'fechamentos')
  if (!invoiceId && !diretoId) return e.badRequestError('invoiceId ou id obrigatorio')
  if (colecao !== 'fechamentos' && colecao !== 'servicos')
    return e.badRequestError('colecao invalida')

  // acha o lancamento pela NF gravada nele OU pelo id direto (caso sem nota ainda)
  let rec = null
  try {
    if (invoiceId) {
      const lista = $app.findRecordsByFilter(colecao, 'asaas_invoice_id = {:iid}', '', 1, 0, {
        iid: invoiceId,
      })
      if (lista.length > 0) rec = lista[0]
    } else if (diretoId) {
      rec = $app.findRecordById(colecao, diretoId)
    }
  } catch (_) {}
  if (!rec) return e.badRequestError('lancamento nao encontrado')

  const empresaId = rec.getString('empresa')
  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', empresaId)
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  // 1) cliente: reutiliza/cria e ATUALIZA com dados atuais da empresa
  let customerId = String(empresa.getString('asaas_customer_id') || '')
  const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')
  const email = String(empresa.getString('email') || empresa.getString('responsavel_email') || '')
  const enderecoTxt = String(empresa.getString('endereco') || '')
  try {
    if (!customerId && doc) {
      const r1 = $http.send({ url: base + '/customers?cpfCnpj=' + doc, method: 'GET', headers })
      if (r1.statusCode === 200 && r1.json.totalCount > 0) customerId = r1.json.data[0].id
    }
    const partes = enderecoTxt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const corpoUpd = { name: empresa.getString('nome') }
    if (email) corpoUpd.email = email
    let rua = '',
      numero = '',
      bairro = '',
      cidUf = '',
      cep = ''
    if (partes.length >= 5) {
      rua = partes[0]
      numero = partes[1]
      bairro = partes[2]
      cidUf = partes[3]
      cep = partes[4]
    } else if (partes.length === 4) {
      rua = partes[0]
      numero = partes[1]
      cidUf = partes[2]
      cep = partes[3]
    }
    if (rua) corpoUpd.address = rua
    if (numero) corpoUpd.addressNumber = numero
    if (bairro) corpoUpd.province = bairro
    const cidadeUf = cidUf.split('-').map((s) => s.trim())
    if (cidadeUf[0]) corpoUpd.cityName = cidadeUf[0]
    if (cidadeUf[1]) corpoUpd.state = cidadeUf[1]
    const cepLimpo = cep.replace(/\D/g, '')
    if (cepLimpo.length === 8) corpoUpd.postalCode = cepLimpo
    if (!customerId) {
      corpoUpd.externalReference = empresaId
      if (doc) corpoUpd.cpfCnpj = doc
      const r2 = $http.send({
        url: base + '/customers',
        method: 'POST',
        headers,
        body: JSON.stringify(corpoUpd),
      })
      if (r2.statusCode === 200) {
        customerId = r2.json.id
        empresa.set('asaas_customer_id', customerId)
        $app.save(empresa)
      }
    } else {
      $http.send({
        url: base + '/customers/' + customerId,
        method: 'PUT',
        headers,
        body: JSON.stringify(corpoUpd),
      })
    }
  } catch (err) {
    console.warn('[manutencao] erro customer na reemissao', err)
  }
  if (!customerId) return e.badRequestError('sem customer no Asaas')

  const valor = Number(rec.get('valor_final') || rec.get('valor') || 0)
  const venc = String(
    rec.get('data_vencimento') || rec.get('data_emissao') || rec.get('data_servico') || '',
  ).slice(0, 10)
  const descricao = String(rec.get('descricao') || '')
  const competencia = String(rec.get('competencia') || '')

  // 2) novo pagamento (o antigo pode estar cancelado/vencido)
  const corpoPag = {
    customer: customerId,
    billingType: 'BOLETO',
    value: valor,
    dueDate: venc,
    description: descricao || 'Locação de equipamentos — competência ' + competencia,
    externalReference: rec.id,
  }
  const rPag = $http.send({
    url: base + '/payments',
    method: 'POST',
    headers,
    body: JSON.stringify(corpoPag),
  })
  if (rPag.statusCode !== 200)
    return e.badRequestError('Asaas payment: ' + JSON.stringify(rPag.json).slice(0, 250))
  const pagamento = rPag.json
  rec.set('asaas_payment_id', pagamento.id || '')
  rec.set('asaas_boleto_url', pagamento.bankSlipUrl || '')
  rec.set('asaas_linha_digitavel', pagamento.identificationField || '')
  rec.set('asaas_customer_id', customerId)
  $app.save(rec)

  // 3) NFS-e nova, vinculada ao pagamento novo
  const rNF = $http.send({
    url: base + '/invoices',
    method: 'POST',
    headers,
    body: JSON.stringify({
      customer: customerId,
      payment: pagamento.id,
      value: valor,
      effectiveDate: venc,
      serviceDescription: descricao || 'Locação de equipamentos — competência ' + competencia,
      observations: 'Ref. contrato de locação de bens móveis — LCCA Tecnologia',
      externalReference: rec.id,
      taxes: { retainIss: false, iss: 2.01, pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0 },
      municipalServiceCode: '14.02.01',
      municipalServiceName: 'Assistência técnica',
    }),
  })
  if (rNF.statusCode === 200) {
    rec.set('asaas_invoice_id', rNF.json.id || '')
    rec.set('asaas_invoice_status', rNF.json.status || '')
    rec.set('asaas_invoice_url', rNF.json.pdfUrl || rNF.json.externalPdfUrl || '')
    $app.save(rec)
  } else {
    console.warn(
      '[manutencao] nova NF falhou',
      rNF.statusCode,
      JSON.stringify(rNF.json).slice(0, 300),
    )
  }

  return e.json(200, {
    ok: true,
    paymentId: pagamento.id,
    invoiceId: rNF.statusCode === 200 ? rNF.json.id : '',
    invoiceStatus: rNF.statusCode === 200 ? rNF.json.status : 'ERRO',
  })
})

// Traduz telefone do cadastro para os campos do Asaas: fixo -> phone, celular -> mobilePhone.
routerAdd('POST', '/backend/v1/manutencao/asaas-telefone', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const empresaId = String((body && body.empresaId) || '')
  const acao = String((body && body.acao) || 'ver')
  if (!empresaId) return e.badRequestError('empresaId obrigatorio')

  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', empresaId)
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
  let customerId = String(empresa.getString('asaas_customer_id') || '')
  if (!customerId) return e.badRequestError('empresa sem asaas_customer_id')

  const fone = String(empresa.getString('telefone') || '').replace(/\D/g, '')
  const fixo = fone.length === 10 ? fone : ''
  const cel = fone.length === 11 ? fone : ''

  if (acao === 'ver') {
    const r = $http.send({ url: base + '/customers/' + customerId, method: 'GET', headers })
    if (r.statusCode !== 200)
      return e.badRequestError('Asaas: ' + JSON.stringify(r.json).slice(0, 250))
    const c = r.json
    return e.json(200, {
      ok: true,
      empresa: { telefone: empresa.getString('telefone'), fixo, cel },
      asaas: { name: c.name, email: c.email, phone: c.phone, mobilePhone: c.mobilePhone },
    })
  }

  // corrigir: fixo -> phone, celular -> mobilePhone, o campo sem numero fica vazio
  const corpo = {}
  if (fixo) corpo.phone = fixo
  if (cel) corpo.mobilePhone = cel
  if (!fixo) corpo.phone = ''
  if (!cel) corpo.mobilePhone = ''
  const r2 = $http.send({
    url: base + '/customers/' + customerId,
    method: 'PUT',
    headers,
    body: JSON.stringify(corpo),
  })
  if (r2.statusCode !== 200)
    return e.badRequestError('Asaas: ' + JSON.stringify(r2.json).slice(0, 250))
  console.log('[manutencao] telefone corrigido', empresaId, JSON.stringify(corpo))
  return e.json(200, {
    ok: true,
    atualizado: corpo,
    asaas: { phone: r2.json.phone, mobilePhone: r2.json.mobilePhone },
  })
})

// Cria no Asaas um cliente SEPARADO para uma empresa que hoje compartilha
// cadastro com outra (mesmo CNPJ, contratos diferentes).
//
// Caso concreto (02/11): MID HOME e MID WORK são dois contratos do mesmo
// CONDOMINIO MID CURITIBA (CNPJ 20892181000115). Como o hook de boleto procura
// cliente por cpfCnpj, os dois caíram no MESMO cliente do Asaas, cadastrado
// como "MID WORK". Efeito: o boleto de R$ 188,60 do MID HOME aparece com o nome
// MID WORK no painel, e as duas cobranças vão para o e-mail da MID WORK.
//
//   POST /backend/v1/manutencao/asaas-customer-separar { "empresaId": "e..." }
routerAdd('POST', '/backend/v1/manutencao/asaas-customer-separar', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

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
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')
  const email = String(empresa.getString('email') || empresa.getString('responsavel_email') || '')
  const enderecoTxt = String(empresa.getString('endereco') || '')
  const fone = String(empresa.getString('telefone') || '').replace(/\D/g, '')

  const corpo = {
    name: empresa.getString('nome'),
    externalReference: empresaId,
    // sem isso o Asaas reaproveita/atrela o cliente existente do mesmo CNPJ
    cpfCnpj: doc,
  }
  if (email) corpo.email = email
  if (fone.length === 11) corpo.mobilePhone = fone
  if (fone.length === 10) corpo.phone = fone

  const partes = enderecoTxt
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let rua = '',
    numero = '',
    bairro = '',
    cidUf = '',
    cep = ''
  if (partes.length >= 5) {
    rua = partes[0]
    numero = partes[1]
    bairro = partes[2]
    cidUf = partes[3]
    cep = partes[4]
  } else if (partes.length === 4) {
    rua = partes[0]
    numero = partes[1]
    cidUf = partes[2]
    cep = partes[3]
  }
  if (rua) corpo.address = rua
  if (numero) corpo.addressNumber = numero
  if (bairro) corpo.province = bairro
  const cidadeUf = cidUf.split('-').map((s) => s.trim())
  if (cidadeUf[0]) corpo.cityName = cidadeUf[0]
  if (cidadeUf[1]) corpo.state = cidadeUf[1]
  const cepLimpo = cep.replace(/\D/g, '')
  if (cepLimpo.length === 8) corpo.postalCode = cepLimpo

  const r1 = $http.send({
    url: base + '/customers',
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
  console.log(
    '[manutencao] separar customer',
    empresaId,
    r1.statusCode,
    JSON.stringify(r1.json || {}).slice(0, 300),
  )
  if (r1.statusCode !== 200)
    return e.badRequestError(
      'Asaas: ' + String(r1.statusCode) + ' ' + JSON.stringify(r1.json).slice(0, 300),
    )

  const novoId = r1.json.id || ''
  const anterior = String(empresa.getString('asaas_customer_id') || '')
  empresa.set('asaas_customer_id', novoId)
  $app.save(empresa)

  return e.json(200, {
    ok: true,
    empresa: empresa.getString('nome'),
    customerAnterior: anterior,
    customerNovo: novoId,
    nome: r1.json.name,
    email: r1.json.email,
  })
})

// Cancela a COBRANÇA AGENDADA de um lançamento antes de ela ser gerada.
// Dentro da janela de segurança (padrão 60 min) nada foi enviado ao Asaas nem à
// prefeitura, então cancelar aqui não gera documento fiscal nem contábil.
//
//   POST /backend/v1/cobranca/cancelar { "colecao": "fechamentos|servicos", "id": "..." }
//
// Autenticado por login do sistema OU pelo token de manutenção.
routerAdd('POST', '/backend/v1/cobranca/cancelar', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!e.auth && (!token || got !== token)) return e.unauthorizedError('login necessario')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const id = String((body && body.id) || '')
  if (colecao !== 'fechamentos' && colecao !== 'servicos')
    return e.badRequestError('colecao invalida')
  if (!id) return e.badRequestError('id obrigatorio')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {}
  if (!rec) return e.badRequestError('registro nao encontrado')

  const status = String(rec.getString('cobranca_status') || '')
  if (status === 'gerada') {
    return e.badRequestError(
      'Cobranca JA GERADA (boleto ' +
        String(rec.getString('asaas_payment_id') || '') +
        '). Para desfazer, cancele o boleto e a NF no Asaas e depois marque como cancelada.',
    )
  }
  if (status === 'gerando') {
    return e.badRequestError('Cobranca em processamento agora — tente em 1 minuto.')
  }

  rec.set('cobranca_status', 'cancelada')
  rec.set('cobranca_erro', '')
  $app.save(rec)
  console.log('[cobranca] cancelada pelo usuario', colecao, id)
  return e.json(200, { ok: true, colecao: colecao, id: id, status: 'cancelada' })
})

// Religa uma cobrança cancelada (dentro da janela), recalculando o horário.
//   POST /backend/v1/cobranca/reativar { "colecao": "...", "id": "..." }
routerAdd('POST', '/backend/v1/cobranca/reativar', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!e.auth && (!token || got !== token)) return e.unauthorizedError('login necessario')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const id = String((body && body.id) || '')
  const minutosBody = body && body.minutos !== undefined ? Number(body.minutos) : 0
  if (colecao !== 'fechamentos' && colecao !== 'servicos')
    return e.badRequestError('colecao invalida')
  if (!id) return e.badRequestError('id obrigatorio')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {}
  if (!rec) return e.badRequestError('registro nao encontrado')
  if (String(rec.getString('cobranca_status') || '') === 'gerada')
    return e.badRequestError('Cobranca ja gerada — nada a reativar.')

  let minutos = minutosBody > 0 ? minutosBody : 0
  if (!minutos) {
    try {
      const cfgs = $app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
      if (cfgs.length > 0) minutos = Number(cfgs[0].get('janela_cobranca_minutos') || 0) || 60
    } catch (_) {
      minutos = 60
    }
  }

  const fmtIso = (ms) => {
    const d = new Date(ms)
    const p = (n) => String(n).padStart(2, '0')
    return (
      d.getUTCFullYear() +
      '-' +
      p(d.getUTCMonth() + 1) +
      '-' +
      p(d.getUTCDate()) +
      ' ' +
      p(d.getUTCHours()) +
      ':' +
      p(d.getUTCMinutes()) +
      ':' +
      p(d.getUTCSeconds()) +
      '.000Z'
    )
  }
  rec.set('cobranca_agendada_em', fmtIso(Date.now()))
  rec.set('cobranca_processar_em', fmtIso(Date.now() + minutos * 60000))
  rec.set('cobranca_status', 'aguardando')
  rec.set('tentativas_cobranca', 0)
  rec.set('cobranca_erro', '')
  $app.save(rec)
  return e.json(200, {
    ok: true,
    minutos: minutos,
    processar_em: rec.getString('cobranca_processar_em'),
  })
})

// Consulta um pagamento no Asaas (para conferência — não altera nada).
//   POST /backend/v1/manutencao/asaas-pagamento { "paymentId": "pay_..." }
routerAdd('POST', '/backend/v1/manutencao/asaas-pagamento', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const paymentId = String((body && body.paymentId) || '')
  if (!paymentId) return e.badRequestError('paymentId obrigatorio')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
  const r = $http.send({ url: base + '/payments/' + paymentId, method: 'GET', headers })
  if (r.statusCode !== 200)
    return e.badRequestError(
      'Asaas: ' + String(r.statusCode) + ' ' + JSON.stringify(r.json).slice(0, 250),
    )
  const p = r.json
  return e.json(200, {
    ok: true,
    id: p.id,
    status: p.status,
    value: p.value,
    netValue: p.netValue,
    dueDate: p.dueDate,
    paymentDate: p.paymentDate,
    clientPaymentDate: p.clientPaymentDate,
    billingType: p.billingType,
    description: p.description,
    externalReference: p.externalReference,
    customer: p.customer,
    invoiceNumber: p.invoiceNumber,
    confirmedDate: p.confirmedDate,
    paymentReceivedInCash: p.paymentReceivedInCash,
  })
})

// Baixa MANUAL no sistema -> recebe o boleto no Asaas como "recebido em dinheiro".
// Espelho do que o Luiz faz no site do Asaas. Ação EXPLÍCITA: nunca automática.
//   POST /backend/v1/manutencao/asaas-baixa-dinheiro { "colecao": "fechamentos|servicos", "id": "..." }
routerAdd('POST', '/backend/v1/manutencao/asaas-baixa-dinheiro', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const id = String((body && body.id) || '')
  const dataPag = String((body && body.dataPagamento) || '').slice(0, 10)
  if (colecao !== 'fechamentos' && colecao !== 'servicos')
    return e.badRequestError('colecao invalida')
  if (!id) return e.badRequestError('id obrigatorio')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {}
  if (!rec) return e.badRequestError('registro nao encontrado')

  const paymentId = String(rec.getString('asaas_payment_id') || '')
  if (!paymentId) return e.badRequestError('registro sem asaas_payment_id')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  // 1) estado atual — não sobrescreve o que já está pago
  const r0 = $http.send({ url: base + '/payments/' + paymentId, method: 'GET', headers })
  if (r0.statusCode !== 200)
    return e.badRequestError(
      'Asaas GET: ' + String(r0.statusCode) + ' ' + JSON.stringify(r0.json).slice(0, 200),
    )
  const atual = String(r0.json.status || '')
  if (atual === 'RECEIVED' || atual === 'CONFIRMED' || atual === 'RECEIVED_IN_CASH') {
    return e.json(200, {
      ok: true,
      jaEstava: true,
      statusAnterior: atual,
      status: atual,
      mensagem: 'O boleto já estava baixado no Asaas — nada foi alterado.',
    })
  }
  if (atual === 'REFUNDED' || atual === 'REFUND_REQUESTED' || atual === 'CHARGEBACK_REQUESTED') {
    return e.badRequestError('Boleto está em estorno/chargeback no Asaas — resolver por lá.')
  }

  // 2) baixa em dinheiro: recebe o valor total, na data informada (ou hoje)
  const corpo = { paymentDate: dataPag || new Date().toISOString().slice(0, 10) }
  let valorOriginal = Number(r0.json.value) || 0
  let valor = valorOriginal
  // torneio de valor (ex.: dinheiro com desconto/arredondamento) — o chamador decide
  const informado =
    body && body.valor !== undefined && body.valor !== null ? Number(body.valor) : NaN
  if (!Number.isNaN(informado) && informado > 0) valor = informado
  corpo.value = valor
  if (valor !== valorOriginal) {
    // Asaas exige notifyCustomer=false p/ alterar valor na baixa; só quando há ajuste
    corpo.notifyCustomer = false
  }

  const r1 = $http.send({
    url: base + '/payments/' + paymentId + '/receiveInCash',
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
  console.log(
    '[manutencao] baixa em dinheiro',
    paymentId,
    r1.statusCode,
    JSON.stringify(r1.json || {}).slice(0, 300),
  )
  if (r1.statusCode !== 200)
    return e.badRequestError(
      'Asaas receiveInCash: ' + String(r1.statusCode) + ' ' + JSON.stringify(r1.json).slice(0, 250),
    )

  // 3) espelha no registro local (status + data + forma)
  try {
    rec.set('status', 'pago')
    rec.set('data_pagamento', corpo.paymentDate)
    rec.set('asaas_baixa_dinheiro', true)
    rec.set('asaas_baixa_em', new Date().toISOString())
    $app.save(rec)
  } catch (err) {
    console.warn('[manutencao] nao consegui gravar a baixa no registro local', err)
  }

  return e.json(200, {
    ok: true,
    jaEstava: false,
    statusAnterior: atual,
    status: String(r1.json.status || ''),
    paymentDate: corpo.paymentDate,
    valor: valor,
  })
})
