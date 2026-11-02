// GERAÇÃO da cobrança (boleto + Pix + NFS-e) — em UM lugar só.
//
// Por que virou rota: o JSVM não compartilha funções entre arquivos (cada hook é
// isolado). Se eu copiasse a geração para o cron e para o botão, as duas cópias
// divergiriam na primeira correção. Então a geração mora aqui e os dois caminhos
// chamam esta rota:
//   - cron "cobranca_agendada" (a cada 5 min) → chama para o que venceu a janela
//   - botão "Emitir agora" na tela → chama com forcar=true (ignora a janela)
//
//   POST /backend/v1/cobranca/processar
//   { "colecao": "fechamentos|servicos", "id": "...", "forcar": true }
//
// Autenticação: login do sistema (botão) OU x-maestro-token (cron/eu).
//
// REGRAS DE SEGURANÇA
//  - Só processa registro com cobranca_status "aguardando" ou "erro"
//    (nunca "gerada" — evita boleto duplicado).
//  - Reivindica gravando "gerando" ANTES de falar com o Asaas.
//  - Sem forcar=true, respeita cobranca_processar_em (a janela).
routerAdd('POST', '/backend/v1/cobranca/processar', (e) => {
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const got = e.request.header.get('x-maestro-token') || ''
  if (!e.auth && (!token || got !== token)) return e.unauthorizedError('login necessario')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const id = String((body && body.id) || '')
  const forcar = !!(body && body.forcar)
  if (colecao !== 'fechamentos' && colecao !== 'servicos')
    return e.badRequestError('colecao invalida')
  if (!id) return e.badRequestError('id obrigatorio')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {}
  if (!rec) return e.badRequestError('registro nao encontrado')

  const statusAtual = String(rec.getString('cobranca_status') || '')
  if (statusAtual === 'gerada') {
    return e.json(200, {
      ok: true,
      jaGerada: true,
      paymentId: String(rec.getString('asaas_payment_id') || ''),
      mensagem: 'Esta cobrança já foi gerada — nenhum boleto novo foi criado.',
    })
  }
  if (statusAtual === 'gerando') {
    return e.badRequestError('Esta cobrança está sendo gerada agora — aguarde alguns segundos.')
  }
  if (statusAtual === 'cancelada') {
    return e.badRequestError('Esta cobrança foi cancelada. Reative antes de emitir.')
  }

  // janela: sem forcar, só gera se já venceu
  if (!forcar) {
    let podeGerar = true
    try {
      const dt = rec.getDateTime('cobranca_processar_em')
      if (dt && !dt.isZero()) podeGerar = dt.time().getTime() <= Date.now()
    } catch (_) {}
    if (!podeGerar) {
      return e.badRequestError(
        'Ainda dentro da janela de segurança — use forcar=true para emitir agora.',
      )
    }
  }

  const apiKey = $secrets.get('ASAAS_API_KEY')
  if (!apiKey) return e.badRequestError('sem ASAAS_API_KEY configurada')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  const ehFechamento = colecao === 'fechamentos'
  const total = ehFechamento
    ? Number(rec.get('valor_final') || rec.get('total') || 0)
    : Number(rec.get('valor') || 0)
  if (!total || total <= 0) return e.badRequestError('registro com valor zerado')

  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', rec.getString('empresa'))
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  // REIVINDICA antes de falar com o Asaas (evita boleto duplicado)
  rec.set('cobranca_status', 'gerando')
  rec.set('cobranca_erro', '')
  $app.save(rec)

  const falhar = (msg) => {
    rec.set('cobranca_status', 'erro')
    rec.set('cobranca_erro', String(msg).slice(0, 500))
    $app.save(rec)
    return e.badRequestError(String(msg).slice(0, 400))
  }

  const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')
  const nome = empresa.getString('nome')
  const email = String(empresa.getString('email') || empresa.getString('responsavel_email') || '')
  const fone = String(empresa.getString('telefone') || '').replace(/\D/g, '')
  const fixo = fone.length === 10 ? fone : ''
  const cel = fone.length === 11 ? fone : ''
  const enderecoTxt = String(empresa.getString('endereco') || '')

  // 1) cliente no Asaas — usa o id da EMPRESA (dois contratos do mesmo CNPJ têm
  //    cadastros separados; foi o caso MID HOME/WORK)
  let customerId = String(empresa.getString('asaas_customer_id') || '')
  try {
    if (!customerId && doc) {
      const r1 = $http.send({ url: base + '/customers?cpfCnpj=' + doc, method: 'GET', headers })
      if (r1.statusCode === 200 && r1.json.totalCount > 0) customerId = r1.json.data[0].id
    }
    if (!customerId) {
      const corpo = { name: nome, externalReference: String(empresa.id) }
      if (doc) corpo.cpfCnpj = doc
      if (email) corpo.email = email
      if (cel) corpo.mobilePhone = cel
      if (fixo) corpo.phone = fixo
      if (enderecoTxt) {
        const partes = enderecoTxt
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        let rua = '',
          numero = '',
          bairro = '',
          cidUf = '',
          cepP = ''
        if (partes.length >= 5) {
          rua = partes[0]
          numero = partes[1]
          bairro = partes[2]
          cidUf = partes[3]
          cepP = partes[4]
        } else if (partes.length === 4) {
          rua = partes[0]
          numero = partes[1]
          cidUf = partes[2]
          cepP = partes[3]
        }
        if (rua) corpo.address = rua
        if (numero) corpo.addressNumber = numero
        if (bairro) corpo.province = bairro
        const cidadeUf = cidUf.split('-').map((s) => s.trim())
        if (cidadeUf[0]) corpo.cityName = cidadeUf[0]
        if (cidadeUf[1]) corpo.state = cidadeUf[1]
        const cepLimpo = cepP.replace(/\D/g, '')
        if (cepLimpo.length === 8) corpo.postalCode = cepLimpo
      }
      const r2 = $http.send({
        url: base + '/customers',
        method: 'POST',
        headers,
        body: JSON.stringify(corpo),
      })
      if (r2.statusCode !== 200)
        return falhar(
          'customer Asaas ' + r2.statusCode + ': ' + JSON.stringify(r2.json).slice(0, 200),
        )
      customerId = r2.json.id
      empresa.set('asaas_customer_id', customerId)
      $app.save(empresa)
    }
  } catch (err) {
    return falhar('erro customer: ' + String(err))
  }

  // 2) boleto
  const venc = String(
    rec.getString('data_vencimento') ||
      rec.getString('data_emissao') ||
      rec.getString('data_servico') ||
      '',
  ).slice(0, 10)
  const descricao = ehFechamento
    ? 'Locação de equipamentos — competência ' + rec.getString('competencia')
    : String(rec.getString('descricao') || 'Serviço avulso — LCCA Tecnologia').slice(0, 400)

  let paymentId = ''
  try {
    const r3 = $http.send({
      url: base + '/payments',
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer: customerId,
        billingType: 'BOLETO',
        value: total,
        dueDate: venc || new Date().toISOString().slice(0, 10),
        description: descricao,
        externalReference: rec.id,
      }),
    })
    if (r3.statusCode !== 200)
      return falhar('payment ' + r3.statusCode + ': ' + JSON.stringify(r3.json).slice(0, 250))
    paymentId = r3.json.id || ''
    rec.set('asaas_customer_id', customerId)
    rec.set('asaas_payment_id', paymentId)
    rec.set('asaas_boleto_url', r3.json.bankSlipUrl || '')
    rec.set('asaas_linha_digitavel', r3.json.identificationField || '')
    $app.save(rec)
  } catch (err) {
    return falhar('erro payment: ' + String(err))
  }

  // 3) Pix (só serviço avulso)
  if (!ehFechamento) {
    try {
      const r4 = $http.send({
        url: base + '/payments/' + paymentId + '/pixQrCode',
        method: 'GET',
        headers,
      })
      if (r4.statusCode === 200) {
        rec.set('asaas_pix_payload', r4.json.payload || '')
        $app.save(rec)
      }
    } catch (_) {}
  }

  // 4) NFS-e — só se emite nota. Serviço avulso respeita o flag do próprio
  //    serviço (escolha do Luiz na tela), não o da empresa.
  let emiteNF = empresa.getBool('emite_nf')
  if (!ehFechamento) {
    try {
      emiteNF = rec.getBool('emite_nf')
    } catch (_) {}
  }
  let invoiceId = ''
  let invoiceStatus = ''
  if (emiteNF) {
    try {
      const corpoNF = {
        customer: customerId,
        payment: paymentId,
        value: total,
        deductions: 0,
        effectiveDate: venc || new Date().toISOString().slice(0, 10),
        serviceDescription: descricao,
        observations: ehFechamento
          ? 'Ref. contrato de locação de bens móveis — LCCA Tecnologia'
          : 'Serviço avulso — LCCA Tecnologia',
        externalReference: rec.id,
        municipalServiceCode: '14.02.01',
        municipalServiceName: 'Assistência técnica',
        taxes: { retainIss: false, iss: 2.01, pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0 },
      }
      const r5 = $http.send({
        url: base + '/invoices',
        method: 'POST',
        headers,
        body: JSON.stringify(corpoNF),
      })
      if (r5.statusCode !== 200)
        return falhar('NF ' + r5.statusCode + ': ' + JSON.stringify(r5.json).slice(0, 250))
      invoiceId = r5.json.id || ''
      invoiceStatus = r5.json.status || ''
      rec.set('asaas_invoice_id', invoiceId)
      rec.set('asaas_invoice_status', invoiceStatus)
      rec.set('asaas_invoice_url', r5.json.pdfUrl || r5.json.externalPdfUrl || '')
      $app.save(rec)
    } catch (err) {
      return falhar('erro NF: ' + String(err))
    }
  }

  // 5) conclui. O e-mail sai pelos hooks existentes (email_fechamento e
  //    email_servico), que só disparam com cobranca_status = "gerada".
  rec.set('cobranca_status', 'gerada')
  rec.set('cobranca_erro', '')
  if (ehFechamento) {
    const st = String(rec.getString('status') || '')
    if (st === 'rascunho' || st === '') rec.set('status', 'emitido')
  }
  $app.save(rec)

  console.log(
    '[cobranca/processar] gerada',
    colecao,
    rec.id,
    'payment:',
    paymentId,
    'NF:',
    invoiceId || '-',
    forcar ? '(imediato)' : '(fila)',
  )
  return e.json(200, {
    ok: true,
    paymentId: paymentId,
    boletoUrl: String(rec.getString('asaas_boleto_url') || ''),
    invoiceId: invoiceId,
    invoiceStatus: invoiceStatus,
    valor: total,
    imediato: forcar,
  })
})
