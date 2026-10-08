// Rota: reemitir a NFS-e de um fechamento ou serviço que ficou sem nota
// (ex.: "Endereço do cliente incompleto / CEP inválido" na 1ª tentativa).
// Confere permissão (usuário logado), corrige o cliente no Asaas com os dados
// atuais da empresa e agenda a NF de novo.
routerAdd('POST', '/backend/v1/reemitir-nf', (e) => {
  const auth = e.auth
  if (!auth) return e.unauthorizedError('login obrigatório')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const colecao = String((body && body.colecao) || '')
  const id = String((body && body.id) || '')
  if (colecao !== 'fechamentos' && colecao !== 'servicos') {
    return e.badRequestError('colecao invalida')
  }
  if (!id) return e.badRequestError('id obrigatorio')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {
    return e.notFoundError('lancamento nao encontrado')
  }

  const empresaId = rec.getString('empresa')
  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', empresaId)
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  if (!apiKey) return e.badRequestError('sem chave do Asaas')

  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
  const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')
  const email =
    String(empresa.getString('email') || empresa.getString('responsavel_email') || '') || ''
  const enderecoTxt = String(empresa.getString('endereco') || '')

  // 1) acha/cria o cliente e ATUALIZA com os dados atuais (endereço novo resolve o 400)
  let customerId = String(empresa.getString('asaas_customer_id') || '')
  try {
    if (!customerId && doc) {
      const r1 = $http.send({ url: base + '/customers?cpfCnpj=' + doc, method: 'GET', headers })
      if (r1.statusCode === 200 && r1.json.totalCount > 0) customerId = r1.json.data[0].id
    }
    const partes = enderecoTxt.split(',').map((s) => s.trim())
    const corpoUpd = { name: empresa.getString('nome') }
    if (email) corpoUpd.email = email
    if (partes.length >= 4) {
      corpoUpd.address = partes[0]
      corpoUpd.addressNumber = partes[1]
      const cidadeUf = partes[2].split('-').map((s) => s.trim())
      corpoUpd.cityName = cidadeUf[0] || ''
      corpoUpd.state = cidadeUf[1] || ''
      corpoUpd.postalCode = partes[3].replace(/\D/g, '')
    }
    if (customerId) {
      const ru = $http.send({
        url: base + '/customers/' + customerId,
        method: 'PUT',
        headers,
        body: JSON.stringify(corpoUpd),
      })
      if (ru.statusCode !== 200) {
        console.warn(
          '[reemitir-nf] update customer falhou',
          ru.statusCode,
          JSON.stringify(ru.json).slice(0, 200),
        )
      }
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
    console.warn('[reemitir-nf] erro customer', errC)
  }
  if (!customerId) return e.badRequestError('sem cliente no Asaas')

  // 2) valor e vínculo com o payment (se existir boleto)
  const valor =
    Number(rec.getFloat('valor_final')) ||
    Number(rec.getFloat('total')) ||
    Number(rec.getFloat('valor')) ||
    0
  if (!valor || valor <= 0) return e.badRequestError('fechamento sem valor')
  const paymentId = String(rec.getString('asaas_payment_id') || '')

  // 3) agenda a NF de novo
  const competencia = rec.getString('competencia') || ''
  const ehServico = colecao === 'servicos'
  const descricaoServico = ehServico
    ? String(rec.getString('descricao') || 'Serviço avulso')
    : 'Prestação de serviços de suporte de TI e impressoras e multifuncionais referentes ao contrato mensal' +
      (competencia ? ' — competência ' + competencia : '')

  const corpoNF = {
    customer: customerId,
    value: valor,
    deductions: 0,
    effectiveDate: String(
      rec.getString('data_emissao') ||
        rec.getString('data_servico') ||
        rec.getString('data_vencimento') ||
        '',
    ).slice(0, 10),
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
      '[reemitir-nf] invoice falhou',
      rNF.statusCode,
      JSON.stringify(rNF.json).slice(0, 300),
    )
    return e.badRequestError('Asaas: ' + JSON.stringify(rNF.json).slice(0, 250))
  }

  rec.set('asaas_invoice_id', rNF.json.id || '')
  rec.set('asaas_invoice_status', rNF.json.status || '')
  rec.set('asaas_invoice_url', rNF.json.pdfUrl || rNF.json.externalPdfUrl || '')
  $app.save(rec)
  console.log('[reemitir-nf] NFS-e reagendada', rNF.json.id, 'p/', colecao, rec.id)
  return e.json(200, { ok: true, invoice: rNF.json.id, status: rNF.json.status })
})
