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
    const email =
      String(
        (empresa && (empresa.getString('email') || empresa.getString('responsavel_email'))) || '',
      ) || ''
    const fone = empresa ? String(empresa.getString('telefone') || '').replace(/\D/g, '') : ''
    const enderecoTxt = empresa ? String(empresa.getString('endereco') || '') : ''
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
        if (enderecoTxt) {
          // formato: "Rua X, 100, Cidade - UF, CEP" (o Asaas exige endereço completo p/ NFS-e)
          const partes = enderecoTxt.split(',').map((s) => s.trim())
          if (partes.length >= 4) {
            corpo.address = partes[0]
            corpo.addressNumber = partes[1]
            const cidadeUf = partes[2].split('-').map((s) => s.trim())
            corpo.cityName = cidadeUf[0] || ''
            corpo.state = cidadeUf[1] || ''
            corpo.postalCode = partes[3].replace(/\D/g, '')
            corpo.addressComplement = ''
            corpo.province = ''
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
            '[asaas] criar customer falhou',
            r2.statusCode,
            JSON.stringify(r2.json).slice(0, 300),
          )
      }
      // cliente existente pode estar sem e-mail/endereço (exigidos pela NFS-e) — atualiza
      if (customerId && (email || enderecoTxt)) {
        try {
          const corpoUpd = {}
          if (email) corpoUpd.email = email
          if (enderecoTxt) {
            const partes = enderecoTxt.split(',').map((s) => s.trim())
            if (partes.length >= 4) {
              corpoUpd.address = partes[0]
              corpoUpd.addressNumber = partes[1]
              const cidadeUf = partes[2].split('-').map((s) => s.trim())
              corpoUpd.cityName = cidadeUf[0] || ''
              corpoUpd.state = cidadeUf[1] || ''
              corpoUpd.postalCode = partes[3].replace(/\D/g, '')
            }
          }
          if (Object.keys(corpoUpd).length > 0) {
            const rU = $http.send({
              url: base + '/customers/' + customerId,
              method: 'PUT',
              headers,
              body: JSON.stringify(corpoUpd),
            })
            if (rU.statusCode !== 200) {
              console.warn(
                '[asaas] atualizar customer falhou',
                rU.statusCode,
                JSON.stringify(rU.json).slice(0, 300),
              )
            }
          }
        } catch (errU) {
          console.warn('[asaas] erro update customer', errU)
        }
      }
      if (customerId && empresa && !empresa.getString('asaas_customer_id')) {
        empresa.set('asaas_customer_id', customerId)
        $app.save(empresa)
      }
    } catch (err) {
      console.warn('[asaas] erro customer', err)
    }

    // 3) boleto
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
            dueDate: String(
              rec.getString('data_vencimento') || rec.getString('data_emissao') || '',
            ).slice(0, 10),
            description: 'Locação de equipamentos — competência ' + rec.getString('competencia'),
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
          console.log('[asaas] boleto criado', paymentId, 'para fechamento', rec.id)
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

    // 4) NFS-e (somente empresas que emitem nota) — agendada vinculada ao boleto
    try {
      if (customerId && empresa && empresa.getBool('emite_nf')) {
        const corpoNF = {
          customer: customerId,
          value: total,
          deductions: 0,
          effectiveDate: String(
            rec.getString('data_emissao') || rec.getString('data_vencimento') || '',
          ).slice(0, 10),
          serviceDescription:
            'Locação de equipamentos — competência ' + rec.getString('competencia'),
          observations: 'Ref. contrato de locação de bens móveis — LCCA Tecnologia',
          externalReference: rec.id,
        }
        if (paymentId) corpoNF.payment = paymentId
        // impostos: locação de bens móveis não sofre ISS (SV 31); Simples recolhe via DAS
        corpoNF.taxes = {
          retainIss: false,
          iss: 0,
          pis: 0,
          cofins: 0,
          csll: 0,
          ir: 0,
          inss: 0,
        }
        // serviço municipal: o Asaas EXIGE municipalServiceId + municipalServiceName
        // (só o nome dá 500 unknow.error; só o id dá invalid_municipalServiceExternalId)
        let municipalServiceId = $secrets.get('ASAAS_MUNICIPAL_SERVICE_ID')
        if (!municipalServiceId) {
          try {
            const rS = $http.send({ url: base + '/fiscalInfo/services', method: 'GET', headers })
            if (rS.statusCode === 200 && Array.isArray(rS.json.data) && rS.json.data.length > 0) {
              const alvo = rS.json.data.find((s) =>
                String(s.description || '')
                  .toLowerCase()
                  .includes('loca'),
              )
              municipalServiceId = (alvo || rS.json.data[0]).id
            }
          } catch (errS) {
            console.warn('[asaas] listar fiscalInfo/services falhou', errS)
          }
        }
        if (municipalServiceId) corpoNF.municipalServiceId = municipalServiceId
        corpoNF.municipalServiceName = 'Locação de bens móveis'

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
          console.log('[asaas] NFS-e agendada', rNF.json.id, 'para fechamento', rec.id)
        } else {
          console.warn(
            '[asaas] criar invoice falhou',
            rNF.statusCode,
            JSON.stringify(rNF.json).slice(0, 300),
          )
        }
      }
    } catch (err) {
      console.warn('[asaas] erro invoice', err)
    }
  } catch (err) {
    console.warn('[asaas] erro geral no hook', err)
  }
  e.next()
}, 'fechamentos')
