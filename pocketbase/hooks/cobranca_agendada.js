// Fila de cobrança: gera boleto + Pix + NFS-e SÓ depois da janela de segurança.
//
// Pedido da Juliana (02/11/2026): "criar um gatilho cronológico para enviar o
// boleto e enviar para a nota fiscal somente 60 minutos ou 2 horas após o
// evento, para que o cliente não receba um email de teste ou com erro e para
// que esse erro não vá para o banco também... de forma que dê para cancelar um
// registro sem gerar documentos fiscais e contábeis".
//
// COMO FUNCIONA
//  - fechamentos e servicos nascem com cobranca_status = "aguardando" e
//    cobranca_processar_em = criado_em + janela (config.janela_cobranca_minutos).
//  - Este cron roda de 5 em 5 minutos, pega o que venceu e gera.
//  - Dentro da janela: dá para corrigir o lançamento à vontade (nada é gerado)
//    ou cancelar (cobranca_status = "cancelada" → o registro nunca gera nada).
//  - Um registro por vez é reivindicado (status "gerando" antes de chamar o
//    Asaas), então duas execuções do cron não geram boleto duplicado.
//  - Se o Asaas falhar, volta para "aguardando" com o erro gravado e tenta de
//    novo na próxima rodada — até tentativas_cobranca chegar a 5, aí vira "erro".
//
// NADA aqui roda dentro da requisição do usuário: o cliente só é impactado
// depois que a janela passou.

cronAdd('cobranca_agendada', '*/5 * * * *', () => {
  // ---------- helpers inline (JSVM não compartilha funções de topo) ----------

  const agora = new Date()

  const minutosJanela = () => {
    try {
      const cfgs = $app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
      if (cfgs.length > 0) {
        const v = Number(cfgs[0].get('janela_cobranca_minutos') || 0)
        if (v > 0) return v
      }
    } catch (_) {}
    return 60
  }

  const vencido = (rec) => {
    // getDateTime devolve um DateTime do PocketBase; .time() dá o instante
    try {
      const dt = rec.getDateTime('cobranca_processar_em')
      if (!dt || dt.isZero()) return true
      return dt.time().getTime() <= agora.getTime()
    } catch (_) {
      return true
    }
  }

  // Processa um registro: gera boleto, Pix e (se a empresa emite) NFS-e.
  const processar = (colecao, rec) => {
    const apiKey = $secrets.get('ASAAS_API_KEY')
    if (!apiKey) {
      rec.set('cobranca_status', 'erro')
      rec.set('cobranca_erro', 'sem ASAAS_API_KEY')
      $app.save(rec)
      return
    }
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

    const ehFechamento = colecao === 'fechamentos'
    const total = ehFechamento
      ? Number(rec.get('valor_final') || rec.get('total') || 0)
      : Number(rec.get('valor') || 0)
    if (!total || total <= 0) {
      rec.set('cobranca_status', 'erro')
      rec.set('cobranca_erro', 'valor zerado')
      $app.save(rec)
      return
    }

    // 1) empresa
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', rec.getString('empresa'))
    } catch (_) {}
    if (!empresa) {
      rec.set('cobranca_status', 'erro')
      rec.set('cobranca_erro', 'empresa nao encontrada')
      $app.save(rec)
      return
    }

    const doc = String(empresa.getString('cnpj_cpf') || '').replace(/\D/g, '')
    const nome = empresa.getString('nome')
    const email = String(empresa.getString('email') || empresa.getString('responsavel_email') || '')
    const fone = String(empresa.getString('telefone') || '').replace(/\D/g, '')
    const fixo = fone.length === 10 ? fone : ''
    const cel = fone.length === 11 ? fone : ''
    const enderecoTxt = String(empresa.getString('endereco') || '')

    // 2) cliente no Asaas — usa o id salvo na EMPRESA (permite dois contratos
    //    do mesmo CNPJ com cadastros separados; foi o caso MID HOME/WORK).
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
        if (r2.statusCode === 200) {
          customerId = r2.json.id
          empresa.set('asaas_customer_id', customerId)
          $app.save(empresa)
        } else {
          rec.set('cobranca_status', 'erro')
          rec.set(
            'cobranca_erro',
            'customer Asaas ' + r2.statusCode + ': ' + JSON.stringify(r2.json).slice(0, 200),
          )
          $app.save(rec)
          return
        }
      }
    } catch (err) {
      rec.set('cobranca_status', 'erro')
      rec.set('cobranca_erro', 'erro customer: ' + String(err).slice(0, 200))
      $app.save(rec)
      return
    }

    // 3) cobrança (boleto)
    let paymentId = ''
    const venc = String(
      rec.getString('data_vencimento') ||
        rec.getString('data_emissao') ||
        rec.getString('data_servico') ||
        '',
    ).slice(0, 10)
    const descricao = ehFechamento
      ? 'Locação de equipamentos — competência ' + rec.getString('competencia')
      : String(rec.getString('descricao') || 'Serviço avulso — LCCA Tecnologia').slice(0, 400)
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
      if (r3.statusCode !== 200) {
        rec.set('cobranca_status', 'erro')
        rec.set(
          'cobranca_erro',
          'payment ' + r3.statusCode + ': ' + JSON.stringify(r3.json).slice(0, 250),
        )
        $app.save(rec)
        console.warn('[cobranca] payment falhou', rec.id, r3.statusCode)
        return
      }
      paymentId = r3.json.id || ''
      rec.set('asaas_customer_id', customerId)
      rec.set('asaas_payment_id', paymentId)
      rec.set('asaas_boleto_url', r3.json.bankSlipUrl || '')
      rec.set('asaas_linha_digitavel', r3.json.identificationField || '')
      $app.save(rec)
    } catch (err) {
      rec.set('cobranca_status', 'erro')
      rec.set('cobranca_erro', 'erro payment: ' + String(err).slice(0, 200))
      $app.save(rec)
      return
    }

    // 4) Pix (só serviço avulso — o fechamento vai por boleto)
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

    // 5) NFS-e — SOMENTE se a empresa emite nota. Serviço avulso respeita o
    //    flag por serviço (rec.emite_nf), que é a escolha do Luiz na tela.
    let emiteNF = empresa.getBool('emite_nf')
    if (!ehFechamento) {
      try {
        emiteNF = rec.getBool('emite_nf')
      } catch (_) {}
    }
    if (emiteNF) {
      try {
        const corpoNF = {
          customer: customerId,
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
        if (paymentId) corpoNF.payment = paymentId
        const r5 = $http.send({
          url: base + '/invoices',
          method: 'POST',
          headers,
          body: JSON.stringify(corpoNF),
        })
        if (r5.statusCode === 200) {
          rec.set('asaas_invoice_id', r5.json.id || '')
          rec.set('asaas_invoice_status', r5.json.status || '')
          rec.set('asaas_invoice_url', r5.json.pdfUrl || r5.json.externalPdfUrl || '')
          $app.save(rec)
        } else {
          rec.set(
            'cobranca_erro',
            'NF ' + r5.statusCode + ': ' + JSON.stringify(r5.json).slice(0, 250),
          )
          rec.set('cobranca_status', 'erro')
          $app.save(rec)
          console.warn('[cobranca] invoice falhou', rec.id, r5.statusCode)
          return
        }
      } catch (err) {
        rec.set('cobranca_status', 'erro')
        rec.set('cobranca_erro', 'erro NF: ' + String(err).slice(0, 200))
        $app.save(rec)
        return
      }
    }

    // 6) fecha: gerada. O e-mail sai pelo hook de e-mail já existente
    //    (dispara quando o status vira "emitido" / quando o Pix é gravado).
    rec.set('cobranca_status', 'gerada')
    rec.set('cobranca_erro', '')
    $app.save(rec)
    console.log(
      '[cobranca] gerada',
      colecao,
      rec.id,
      'payment:',
      paymentId,
      'janela:',
      minutosJanela(),
      'min',
    )
  }

  // ---------- rede de segurança: destrava o que ficou em "gerando" ----------
  // Se o processo morrer no meio (deploy, timeout do Asaas), o registro ficaria
  // preso em "gerando" para sempre. Depois de 30 min, volta para a fila.
  for (const colecao of ['fechamentos', 'servicos']) {
    try {
      const presos = $app.findRecordsByFilter(colecao, 'cobranca_status = "gerando"', '', 50, 0)
      for (const p of presos) {
        let velho = false
        try {
          const dt = p.getDateTime('cobranca_agendada_em')
          velho = !dt || dt.isZero() || dt.time().getTime() < agora.getTime() - 30 * 60 * 1000
        } catch (_) {
          velho = true
        }
        if (!velho) continue
        const t = Number(p.get('tentativas_cobranca') || 0) + 1
        p.set('tentativas_cobranca', t)
        p.set('cobranca_status', t >= 5 ? 'erro' : 'aguardando')
        p.set('cobranca_erro', 'travou em gerando — devolvido a fila (' + t + ')')
        $app.save(p)
        console.log('[cobranca] destravado', colecao, p.id, 'tentativa', t)
      }
    } catch (err) {
      console.warn('[cobranca] erro ao destravar', colecao, err)
    }
  }

  // ---------- laço da fila ----------
  for (const colecao of ['fechamentos', 'servicos']) {
    let lista = []
    try {
      lista = $app.findRecordsByFilter(
        colecao,
        'cobranca_status = "aguardando"',
        'cobranca_processar_em',
        50,
        0,
      )
    } catch (err) {
      console.warn('[cobranca] erro ao listar', colecao, err)
      continue
    }
    for (const rec of lista) {
      if (!vencido(rec)) continue
      // reivindica: grava "gerando" antes de falar com o Asaas (evita duplicar)
      try {
        rec.set('cobranca_status', 'gerando')
        $app.save(rec)
      } catch (_) {
        continue
      }
      try {
        processar(colecao, rec)
      } catch (err) {
        console.warn('[cobranca] erro ao processar', colecao, rec.id, err)
        try {
          const tentativas = Number(rec.get('tentativas_cobranca') || 0) + 1
          rec.set('tentativas_cobranca', tentativas)
          rec.set('cobranca_status', tentativas >= 5 ? 'erro' : 'aguardando')
          rec.set('cobranca_erro', String(err).slice(0, 400))
          $app.save(rec)
        } catch (_) {}
      }
    }
  }
})
