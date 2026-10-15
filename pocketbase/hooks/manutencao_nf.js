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
      nome_fantasia: d.fantasia || '',
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
  const campos = (body && body.campos) || []
  const sort = String((body && body.sort) || '-created')
  const params = (body && body.params) || {}
  if (!colecao) return e.badRequestError('colecao obrigatoria')

  const lista = $app.findRecordsByFilter(colecao, filtro || 'id != ""', sort, 20, 0, params)
  const saida = []
  for (const r of lista) {
    const o = { id: r.id }
    for (const c of campos) {
      try {
        o[c] = r.get(c)
      } catch (_) {
        o[c] = null
      }
    }
    saida.push(o)
  }
  return e.json(200, { total: saida.length, items: saida })
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
  const campos = (body && body.campos) || {}
  if (!colecao || colecao === 'users') return e.badRequestError('colecao invalida')
  if (!campos || typeof campos !== 'object') return e.badRequestError('campos obrigatorios')

  // coleções permitidas (cadastro)
  const ok = ['empresas', 'contratos', 'equipamentos', 'leituras']
  if (ok.indexOf(colecao) === -1) return e.badRequestError('colecao nao permitida')

  const nova = new Record($app.findCollectionByNameOrId(colecao))
  for (const k in campos) {
    try {
      nova.set(k, campos[k])
    } catch (_) {}
  }
  $app.save(nova)
  console.log('[manutencao] registro criado', colecao, nova.id)
  return e.json(200, { ok: true, id: nova.id })
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
  if (!colecao || !id) return e.badRequestError('colecao e id obrigatorios')
  const ok = ['empresas', 'contratos', 'equipamentos', 'leituras', 'servicos']
  if (ok.indexOf(colecao) === -1) return e.badRequestError('colecao nao permitida')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {}
  if (!rec) return e.badRequestError('registro nao encontrado')

  const mudou = []
  for (const k in body) {
    if (k === 'colecao' || k === 'id') continue
    try {
      rec.set(k, body[k])
      mudou.push(k)
    } catch (_) {}
  }
  if (mudou.length === 0) return e.badRequestError('nada para atualizar')
  $app.save(rec)
  console.log('[manutencao] registro atualizado', colecao, id, mudou.join(','))
  return e.json(200, { ok: true, mudou })
})

routerAdd('POST', '/backend/v1/manutencao/empresa-patch', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const id = String((body && body.id) || '')
  if (!id) return e.badRequestError('id obrigatorio')
  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', id)
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  // so campos de cadastro/endereco — nada de financeiro
  const permitidos = ['endereco', 'cep', 'email', 'responsavel_email', 'emite_nf']
  const mudou = []
  for (const k of permitidos) {
    if (body && body[k] !== undefined) {
      empresa.set(k, body[k])
      mudou.push(k)
    }
  }
  if (mudou.length === 0) return e.badRequestError('nada para atualizar')
  $app.save(empresa)
  console.log('[manutencao] empresa atualizada', id, mudou.join(','))
  return e.json(200, { ok: true, mudou })
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
  const filtro = String((body && body.filtro) || '')
  if (!colecao || !filtro) return e.badRequestError('colecao e filtro obrigatorios')
  const permitidas = ['leads', 'arquivos', 'chamados', 'empresas', 'equipamentos']
  if (permitidas.indexOf(colecao) === -1) return e.badRequestError('colecao nao permitida')

  const lista = $app.findRecordsByFilter(colecao, filtro, '', 500, 0)
  let apagados = 0
  for (const r of lista) {
    try {
      $app.delete(r)
      apagados++
    } catch (err) {
      console.warn('[manutencao] falha ao apagar', r.id, err)
    }
  }
  console.log('[manutencao] apagados', apagados, 'de', colecao, '| filtro:', filtro)
  return e.json(200, { ok: true, apagados })
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
    if (partes.length > 5) corpoUpd.addressComplement = partes.slice(5).join(', ')
    if (customerId) {
      const ru = $http.send({
        url: base + '/customers/' + customerId,
        method: 'PUT',
        headers,
        body: JSON.stringify(corpoUpd),
      })
      if (ru.statusCode !== 200)
        console.warn(
          '[manutencao] update customer falhou',
          ru.statusCode,
          JSON.stringify(ru.json).slice(0, 200),
        )
    } else {
      corpoUpd.cpfCnpj = doc
      corpoUpd.externalReference = empresa.id
      const rc = $http.send({
        url: base + '/customers',
        method: 'POST',
        headers,
        body: JSON.stringify(corpoUpd),
      })
      if (rc.statusCode === 200) {
        customerId = rc.json.id
        empresa.set('asaas_customer_id', customerId)
        $app.save(empresa)
      } else {
        return e.badRequestError(
          'cliente no Asaas falhou: ' + JSON.stringify(rc.json).slice(0, 200),
        )
      }
    }
  } catch (errC) {
    console.warn('[manutencao] erro customer', errC)
  }
  if (!customerId) return e.badRequestError('sem cliente no Asaas')

  // 2) valor e vinculo com o payment
  const valor =
    Number(rec.getFloat('valor_final')) ||
    Number(rec.getFloat('total')) ||
    Number(rec.getFloat('valor')) ||
    0
  if (!valor || valor <= 0) return e.badRequestError('lancamento sem valor')
  const paymentId = String(rec.getString('asaas_payment_id') || '')

  // 3) agenda a NF de novo (data de emissao = hoje)
  const competencia = rec.getString('competencia') || ''
  const ehServico = colecao === 'servicos'
  const descricaoServico = ehServico
    ? String(rec.getString('descricao') || 'Serviço avulso')
    : 'Prestação de serviços de suporte de TI e impressoras e multifuncionais referentes ao contrato mensal' +
      (competencia ? ' — competência ' + competencia : '')

  const hojeISO = new Date().toISOString().slice(0, 10)
  const corpoNF = {
    customer: customerId,
    value: valor,
    deductions: 0,
    effectiveDate: hojeISO,
    serviceDescription: descricaoServico,
    observations: ehServico
      ? 'Serviço avulso — LCCA Tech'
      : 'Ref. contrato de locação de bens móveis — LCCA Tech',
    externalReference: rec.id,
    municipalServiceCode: '14.02.01',
    municipalServiceName: 'Assistência técnica',
    taxes: { retainIss: false, iss: 2.01, pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0 },
  }
  if (paymentId) corpoNF.payment = paymentId

  const rNF = $http.send({
    url: base + '/invoices',
    method: 'POST',
    headers,
    body: JSON.stringify(corpoNF),
  })
  if (rNF.statusCode !== 200) {
    console.warn(
      '[manutencao] invoice falhou',
      rNF.statusCode,
      JSON.stringify(rNF.json).slice(0, 300),
    )
    return e.badRequestError('Asaas: ' + JSON.stringify(rNF.json).slice(0, 250))
  }

  rec.set('asaas_invoice_id', rNF.json.id || '')
  rec.set('asaas_invoice_status', rNF.json.status || '')
  rec.set('asaas_invoice_url', rNF.json.pdfUrl || rNF.json.externalPdfUrl || '')
  $app.save(rec)
  console.log('[manutencao] NFS-e reagendada', rNF.json.id, 'p/', colecao, rec.id)
  return e.json(200, { ok: true, invoice: rNF.json.id, status: rNF.json.status })
})

// Corrige telefone fixo/celular do cliente no Asaas (erro "Número de telefone
// incorreto" = fixo no campo de celular). A chave ASAAS_API_KEY fica no cofre.
//   POST /backend/v1/manutencao/asaas-telefone { "id": "<empresa>", "acao": "ver" | "corrigir" }
routerAdd('POST', '/backend/v1/manutencao/asaas-telefone', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!token || got !== token) return e.unauthorizedError('token invalido')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const empresaId = String((body && body.id) || '')
  const acao = String((body && body.acao) || 'ver')
  if (!empresaId) return e.badRequestError('id da empresa obrigatorio')
  if (acao !== 'ver' && acao !== 'corrigir')
    return e.badRequestError('acao invalida (ver|corrigir)')

  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', empresaId)
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  const customerId = String(empresa.getString('asaas_customer_id') || '')
  if (!customerId) return e.badRequestError('empresa sem cliente no Asaas')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

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
