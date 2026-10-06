// Hook: ao criar um serviço avulso, gera cobrança no Asaas (boleto + Pix) e
// NFS-e se a empresa emite nota. After-success: roda APÓS o commit.
onRecordAfterCreateSuccess((e) => {
  try {
    const rec = e.record
    const total = Number(rec.getFloat('valor')) || 0
    if (!total || total <= 0) {
      e.next()
      return
    }

    const apiKey = $secrets.get('ASAAS_API_KEY')
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'
    if (!apiKey) {
      console.warn('[servico-avulso] sem ASAAS_API_KEY — cobrança não gerada', rec.id)
      e.next()
      return
    }

    // 1) empresa
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', rec.getString('empresa'))
    } catch (_) {}

    const doc = empresa ? String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '') : ''
    const nome = empresa ? empresa.getString('nome') : 'Cliente LCCA'
    const email =
      String(
        (empresa && (empresa.getString('email') || empresa.getString('responsavel_email'))) || '',
      ) || ''
    const enderecoTxt = empresa ? String(empresa.getString('endereco') || '') : ''
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
    let customerId = String((empresa && empresa.getString('asaas_customer_id')) || '')

    // 2) cliente no Asaas (reutiliza por CNPJ, cria se precisão, atualiza dados p/ NF)
    try {
      if (!customerId && doc) {
        const r1 = $http.send({ url: base + '/customers?cpfCnpj=' + doc, method: 'GET', headers })
        if (r1.statusCode === 200 && r1.json.totalCount > 0) customerId = r1.json.data[0].id
      }
      if (!customerId) {
        const corpo = { name: nome, externalReference: String(empresa ? empresa.id : rec.id) }
        if (doc) corpo.cpfCnpj = doc
        if (email) corpo.email = email
        if (enderecoTxt) {
          const partes = enderecoTxt.split(',').map((s) => s.trim())
          if (partes.length >= 4) {
            corpo.address = partes[0]
            corpo.addressNumber = partes[1]
            const cidadeUf = partes[2].split('-').map((s) => s.trim())
            corpo.cityName = cidadeUf[0] || ''
            corpo.state = cidadeUf[1] || ''
            corpo.postalCode = partes[3].replace(/\D/g, '')
          }
        }
        const r2 = $http.send({
          url: base + '/customers',
          method: 'POST',
          headers,
          body: JSON.stringify(corpo),
        })
        if (r2.statusCode === 200) customerId = r2.json.id
        else
          console.warn(
            '[servico-avulso] criar customer falhou',
            r2.statusCode,
            JSON.stringify(r2.json).slice(0, 300),
          )
      }
      if (customerId && empresa && !empresa.getString('asaas_customer_id')) {
        empresa.set('asaas_customer_id', customerId)
        $app.save(empresa)
      }
    } catch (err) {
      console.warn('[servico-avulso] erro customer', err)
    }

    // 3) cobrança: boleto (payment) — o mesmo payment expõe Pix via /pixQrCode
    let paymentId = ''
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
            dueDate: String(rec.getString('data_vencimento') || '').slice(0, 10),
            description: 'Serviço avulso — LCCA Tecnologia',
            externalReference: rec.id,
          }),
        })
        if (r3.statusCode === 200) {
          paymentId = r3.json.id || ''
          rec.set('asaas_customer_id', customerId)
          rec.set('asaas_payment_id', paymentId)
          rec.set('asaas_boleto_url', r3.json.bankSlipUrl || '')
          rec.set('asaas_linha_digitavel', r3.json.identificationField || '')
          $app.save(rec)
          console.log('[servico-avulso] boleto criado', paymentId, 'p/ serviço', rec.id)
        } else {
          console.warn(
            '[servico-avulso] criar payment falhou',
            r3.statusCode,
            JSON.stringify(r3.json).slice(0, 300),
          )
        }
      }
    } catch (err) {
      console.warn('[servico-avulso] erro payment', err)
    }

    // 4) Pix (QRCode estático da cobrança) — dinheiro cai na conta Asaas da LCCA
    try {
      if (paymentId) {
        const r4 = $http.send({
          url: base + '/payments/' + paymentId + '/pixQrCode',
          method: 'GET',
          headers,
        })
        if (r4.statusCode === 200) {
          rec.set('asaas_pix_payload', r4.json.payload || '')
          $app.save(rec)
          console.log('[servico-avulso] pix obtido p/ serviço', rec.id)
        } else {
          console.warn(
            '[servico-avulso] pixQrCode falhou',
            r4.statusCode,
            JSON.stringify(r4.json).slice(0, 200),
          )
        }
      }
    } catch (err) {
      console.warn('[servico-avulso] erro pix', err)
    }

    // 5) NFS-e (se a empresa emite) — mesma fórmula do fechamento
    try {
      if (customerId && empresa && empresa.getBool('emite_nf')) {
        const corpoNF = {
          customer: customerId,
          value: total,
          deductions: 0,
          effectiveDate: String(
            rec.getString('data_servico') || rec.getString('data_vencimento') || '',
          ).slice(0, 10),
          serviceDescription: String(rec.getString('descricao') || 'Serviço avulso'),
          observations: 'Serviço avulso — LCCA Tecnologia',
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
        if (rNF.statusCode === 200) {
          rec.set('asaas_invoice_id', rNF.json.id || '')
          rec.set('asaas_invoice_status', rNF.json.status || '')
          rec.set('asaas_invoice_url', rNF.json.pdfUrl || rNF.json.externalPdfUrl || '')
          $app.save(rec)
          console.log('[servico-avulso] NFS-e agendada', rNF.json.id, 'p/ serviço', rec.id)
        } else {
          console.warn(
            '[servico-avulso] criar invoice falhou',
            rNF.statusCode,
            JSON.stringify(rNF.json).slice(0, 300),
          )
        }
      }
    } catch (err) {
      console.warn('[servico-avulso] erro invoice', err)
    }
  } catch (err) {
    console.warn('[servico-avulso] erro geral', err)
  }
  e.next()
}, 'servicos')
