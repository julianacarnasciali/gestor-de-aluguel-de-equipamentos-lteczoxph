// Hook: ao lançar um fechamento, cria cliente + boleto no Asaas.
// After-success: roda APÓS o commit — falha externa não desfaz o fechamento.
// Tudo inline no callback (escopo do JSVM) e com try/catch total: erro do Asaas
// é LOGADO, nunca quebra a resposta do create.
onRecordAfterCreateSuccess((e) => {
  try {
    const rec = e.record
    const total = Number(rec.getString('valor_final')) || Number(rec.getString('total')) || 0
    if (!total || total <= 0) {
      e.next()
      return
    }

    const apiKey = $secrets.get('ASAAS_API_KEY')
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'
    if (!apiKey) {
      console.warn('[asaas] sem ASAAS_API_KEY — boleto não gerado para', rec.id)
      e.next()
      return
    }

    // 1) empresa (CNPJ/nome/contato)
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', rec.getString('empresa'))
    } catch (_) {}

    const doc = empresa ? String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '') : ''
    const nome = empresa ? empresa.getString('nome') : 'Cliente LCCA'
    const email = empresa ? String(empresa.getString('responsavel_email') || '') : ''
    const fone = empresa ? String(empresa.getString('telefone') || '').replace(/\D/g, '') : ''
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
    let customerId = String((empresa && empresa.getString('asaas_customer_id')) || '')

    // 2) cliente no Asaas: reutiliza ID salvo, senão busca por cpfCnpj, senão cria
    try {
      if (!customerId && doc) {
        const r1 = $http.send({ url: base + '/customers?cpfCnpj=' + doc, method: 'GET', headers })
        if (r1.statusCode === 200 && r1.json.totalCount > 0) customerId = r1.json.data[0].id
      }
      if (!customerId) {
        const corpo = { name: nome, externalReference: String(empresa ? empresa.id : rec.id) }
        if (doc) corpo.cpfCnpj = doc
        if (email) corpo.email = email
        if (fone) corpo.mobilePhone = fone
        const r2 = $http.send({
          url: base + '/customers',
          method: 'POST',
          headers,
          body: JSON.stringify(corpo),
        })
        if (r2.statusCode === 200) customerId = r2.json.id
        else
          console.warn(
            '[asaas] criar customer falhou',
            r2.statusCode,
            JSON.stringify(r2.json).slice(0, 300),
          )
      }
      if (customerId && empresa && !empresa.getString('asaas_customer_id')) {
        empresa.set('asaas_customer_id', customerId)
        $app.save(empresa)
      }
    } catch (err) {
      console.warn('[asaas] erro customer', err)
    }

    // 3) boleto
    try {
      if (customerId) {
        const r3 = $http.send({
          url: base + '/payments',
          method: 'POST',
          headers,
          body: JSON.stringify({
            customer: customerId,
            billingType: 'BOLETO',
            value: total,
            dueDate: String(
              rec.getString('data_vencimento') || rec.getString('data_emissao') || '',
            ).slice(0, 10),
            description: 'Locação de equipamentos — competência ' + rec.getString('competencia'),
            externalReference: rec.id,
          }),
        })
        if (r3.statusCode === 200) {
          rec.set('asaas_customer_id', customerId)
          rec.set('asaas_payment_id', r3.json.id || '')
          rec.set('asaas_boleto_url', r3.json.bankSlipUrl || '')
          rec.set('asaas_linha_digitavel', r3.json.identificationField || '')
          $app.save(rec)
          console.log('[asaas] boleto criado', r3.json.id, 'para fechamento', rec.id)
        } else {
          console.warn(
            '[asaas] criar payment falhou',
            r3.statusCode,
            JSON.stringify(r3.json).slice(0, 300),
          )
        }
      }
    } catch (err) {
      console.warn('[asaas] erro payment', err)
    }
  } catch (err) {
    console.warn('[asaas] erro geral no hook', err)
  }
  e.next()
}, 'fechamentos')
