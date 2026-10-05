// Hook: ao lançar um fechamento, cria cliente + boleto no Asaas (sandbox em dev).
// After-success: roda APÓS o commit — falha externa não desfaz o fechamento.
// A chave mora no cofre ($secrets), nunca no código.
onRecordAfterCreateSuccess((e) => {
  const rec = e.record
  const total = rec.getNumber('valor_final') || rec.getNumber('total')
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

  // 1) empresa (para CNPJ/nome)
  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', rec.getString('empresa'))
  } catch (_) {}

  // 2) cliente no Asaas (busca por cpfCnpj, cria se não existir)
  const doc = empresa ? String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '') : ''
  const nome = empresa ? empresa.getString('nome') : 'Cliente LCCA'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
  let customerId = ''

  try {
    if (doc) {
      const r1 = $http.send({
        url: base + '/customers?cpfCnpj=' + doc,
        method: 'GET',
        headers,
      })
      if (r1.statusCode === 200 && r1.json.totalCount > 0) {
        customerId = r1.json.data[0].id
      }
    }
    if (!customerId) {
      const r2 = $http.send({
        url: base + '/customers',
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: nome,
          cpfCnpj: doc || undefined,
          email: empresa ? empresa.getString('responsavel_email') || '' : '',
          phone: empresa ? String(empresa.getString('telefone') || '').replace(/\D/g, '') : '',
        }),
      })
      if (r2.statusCode === 200) customerId = r2.json.id
      else console.warn('[asaas] criar customer falhou', r2.statusCode, r2.json)
    }
  } catch (err) {
    console.warn('[asaas] erro customer', err)
  }

  // 3) boleto (payment billingType BOLETO)
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
          dueDate: rec.getString('data_vencimento') || rec.getString('data_emissao'),
          description: 'Locação de equipamentos — competência ' + rec.getString('competencia'),
          externalReference: rec.id,
        }),
      })
      if (r3.statusCode === 200) {
        rec.set('asaas_customer_id', customerId)
        rec.set('asaas_payment_id', r3.json.id)
        rec.set('asaas_boleto_url', r3.json.bankSlipUrl || '')
        rec.set('asaas_linha_digitavel', r3.json.identificationField || '')
        $app.save(rec)
        console.log('[asaas] boleto criado', r3.json.id, 'para fechamento', rec.id)
      } else {
        console.warn('[asaas] criar payment falhou', r3.statusCode, r3.json)
      }
    }
  } catch (err) {
    console.warn('[asaas] erro payment', err)
  }

  e.next()
}, 'fechamentos')
