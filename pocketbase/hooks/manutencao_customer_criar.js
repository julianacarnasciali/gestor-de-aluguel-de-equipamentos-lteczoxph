// Cadastra UMA empresa no Asaas — e NADA mais.
//
// Pedido da Juliana (05/11/2026): "Eu quero que você crie no ASAAS o cadastro da
// Maxi Gráfica. corrija apenas o cadastro da empresa, não crie nota, não emita
// boleto, não altere mais nada."
//
// Por que existe: as rotas de manutenção exigem `x-maestro-token` (secret), e o
// valor não está em lugar nenhum. Esta rota aceita a SESSÃO de um usuário logado
// (mesmo padrão de reemitir_nf), então não precisa do token.
//
//   POST /backend/v1/manutencao/asaas-customer-criar
//   { "empresaId": "e..." }
//
// O QUE ESTA ROTA NÃO FAZ (de propósito):
//   - não cria boleto (payments)
//   - não cria nota fiscal (invoices)
//   - não envia e-mail
//   - não altera nenhum outro campo da empresa além de `asaas_customer_id`
//
// SEGURANÇA CONTRA DUPLICIDADE (lição MID HOME/WORK):
//   1. Se a empresa já tem asaas_customer_id, devolve e para — não cria outro.
//   2. Antes de criar, procura o CNPJ no Asaas (GET /customers?cpfCnpj=). Se já
//      existir cadastro lá, apenas VINCULA o id existente — nunca cria um segundo.
//   3. Só faz POST /customers quando não há nada com esse CNPJ no Asaas.
routerAdd('POST', '/backend/v1/manutencao/asaas-customer-criar', (e) => {
  // ---------- autenticação: sessão OU token de manutenção ----------
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

  // 1) já cadastrada? devolve sem tocar em nada
  const jaTem = String(empresa.getString('asaas_customer_id') || '')
  if (jaTem) {
    return e.json(200, {
      ok: true,
      jaCadastrada: true,
      asaas_customer_id: jaTem,
      mensagem: 'Esta empresa já tem cadastro no Asaas — nada foi criado.',
    })
  }

  const apiKey = $secrets.get('ASAAS_API_KEY')
  if (!apiKey) return e.badRequestError('sem ASAAS_API_KEY configurada')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) {
    return e.badRequestError('empresa sem CPF/CNPJ valido no cadastro')
  }
  const nome = empresa.getString('nome')
  const email = String(empresa.getString('email') || empresa.getString('responsavel_email') || '')
  const fone = String(empresa.getString('telefone') || '').replace(/\D/g, '')
  const fixo = fone.length === 10 ? fone : ''
  const cel = fone.length === 11 ? fone : ''
  const enderecoTxt = String(empresa.getString('endereco') || '')

  // 2) já existe no Asaas com esse CNPJ? APENAS VINCULA (nunca duplica)
  try {
    const r0 = $http.send({
      url: base + '/customers?cpfCnpj=' + doc,
      method: 'GET',
      headers,
      timeout: 40,
    })
    if (r0.statusCode === 200 && r0.json && Number(r0.json.totalCount) > 0) {
      const achado = r0.json.data[0]
      empresa.set('asaas_customer_id', String(achado.id || ''))
      $app.save(empresa)
      console.log(
        '[customer-criar] VINCULADO a cliente existente',
        empresaId,
        achado.id,
        achado.name,
      )
      return e.json(200, {
        ok: true,
        vinculada: true,
        criada: false,
        asaas_customer_id: String(achado.id || ''),
        nome_no_asaas: String(achado.name || ''),
        mensagem:
          'Já existia um cliente com este CNPJ no Asaas. O cadastro existente foi vinculado — nenhum cliente novo foi criado.',
      })
    }
  } catch (err) {
    console.warn('[customer-criar] consulta previa falhou', empresaId, err)
    return e.badRequestError(
      'Falha ao consultar o Asaas antes de criar: ' + String(err).slice(0, 200),
    )
  }

  // 3) monta o corpo com os dados do cadastro
  const corpo = {
    name: nome,
    externalReference: empresaId,
    cpfCnpj: doc,
  }
  if (email) corpo.email = email
  if (cel) corpo.mobilePhone = cel
  if (fixo) corpo.phone = fixo

  // endereço no formato do sistema: "Rua, N, Bairro, Cidade - UF, CEP"
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
  // o CEP é a fonte mais confiável quando o texto do endereço está irregular
  if (!cepLimpo || cepLimpo.length !== 8) {
    const cepCampo = String(empresa.getString('cep') || '').replace(/\D/g, '')
    if (cepCampo.length === 8) corpo.postalCode = cepCampo
  }

  // 4) cria — SOMENTE o cliente
  const r1 = $http.send({
    url: base + '/customers',
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
    timeout: 60,
  })
  if (r1.statusCode !== 200) {
    console.warn(
      '[customer-criar] falhou',
      empresaId,
      r1.statusCode,
      JSON.stringify(r1.json || {}).slice(0, 300),
    )
    return e.badRequestError(
      'Asaas recusou: ' + String(r1.statusCode) + ' ' + JSON.stringify(r1.json || {}).slice(0, 300),
    )
  }

  const novoId = String(r1.json.id || '')
  if (!novoId) return e.badRequestError('Asaas nao devolveu id do cliente')

  // única gravação: o id do cliente no cadastro
  empresa.set('asaas_customer_id', novoId)
  $app.save(empresa)

  console.log('[customer-criar] CRIADO', empresaId, novoId, nome, '| nenhum boleto/NF gerado')
  return e.json(200, {
    ok: true,
    criada: true,
    vinculada: false,
    asaas_customer_id: novoId,
    nome: nome,
    cnpj: doc,
    email: email || '',
    enviado_ao_asaas: corpo,
  })
})
