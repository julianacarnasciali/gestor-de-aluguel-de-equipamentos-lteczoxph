// Baixa manual no Gestor -> baixa no Asaas como RECEBIDO EM DINHEIRO.
//
// Pedido da Juliana (02/11/2026): quando o Luiz dá baixa no sistema porque o
// cliente pagou por fora (Pix em outra conta da LCCA, dinheiro, etc), o boleto
// fica em aberto no Asaas e a conciliação não fecha. A baixa tem que espelhar
// no Asaas também.
//
// Caso concreto que originou: Jandira Reserva, serviço avulso de R$ 1.320
// (pay_vuxumky61c5pjt11), pago por Pix em 21/10 fora do Asaas.
//
// REGRAS DE SEGURANÇA (o hook roda em toda atualização; errar aqui mexe em
// dinheiro de verdade):
//  1. Só age quando o status VIRA "pago" (antes != pago). Reabrir/repetir não
//     dispara nada.
//  2. Só age se o registro ainda NÃO foi espelhado (asaas_baixa_dinheiro).
//  3. Antes de baixar, CONSULTA o Asaas. Se o boleto já está RECEIVED ou
//     CONFIRMED, o pagamento entrou pelo Asaas de verdade (caminho do webhook)
//     e não há nada a fazer — só grava o status.
//  4. Nunca derruba a resposta do usuário: after-success + try/catch total.
//  5. Estorno/chargeback não é tocado: só registra e sai.
//
// Os campos asaas_baixa_dinheiro / asaas_baixa_em / asaas_status vêm da
// migração 0048.
onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    const colecao = rec.collection().name
    if (colecao !== 'fechamentos' && colecao !== 'servicos') {
      e.next()
      return
    }

    const statusNovo = rec.getString('status')
    let statusAntes = ''
    try {
      statusAntes = rec.original().getString('status')
    } catch (_) {}

    // 1) só na transição para "pago"
    if (statusNovo !== 'pago' || statusAntes === 'pago') {
      e.next()
      return
    }
    // 2) já espelhado?
    if (rec.getBool('asaas_baixa_dinheiro')) {
      e.next()
      return
    }
    const paymentId = rec.getString('asaas_payment_id')
    if (!paymentId) {
      e.next()
      return
    }

    const apiKey = $secrets.get('ASAAS_API_KEY')
    if (!apiKey) {
      console.warn('[baixa-asaas] sem ASAAS_API_KEY — baixa nao espelhada', rec.id)
      e.next()
      return
    }
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

    // 3) estado atual no Asaas
    let atual = ''
    try {
      const r0 = $http.send({ url: base + '/payments/' + paymentId, method: 'GET', headers })
      if (r0.statusCode === 200) atual = String(r0.json.status || '')
      else {
        console.warn('[baixa-asaas] GET falhou', paymentId, r0.statusCode)
        rec.set('asaas_status', 'ERRO_GET')
        $app.save(rec)
        e.next()
        return
      }
    } catch (errGet) {
      console.warn('[baixa-asaas] erro GET', errGet)
      e.next()
      return
    }

    // já recebido: o dinheiro entrou pelo proprio Asaas (webhook). Nada a fazer.
    if (atual === 'RECEIVED' || atual === 'CONFIRMED' || atual === 'RECEIVED_IN_CASH') {
      rec.set('asaas_status', atual)
      $app.save(rec)
      console.log('[baixa-asaas] ja estava recebido no Asaas:', paymentId, atual)
      e.next()
      return
    }

    // estorno/chargeback: nao mexer em dinheiro aqui
    if (
      atual === 'REFUNDED' ||
      atual === 'REFUND_REQUESTED' ||
      atual === 'REFUND_IN_PROGRESS' ||
      atual === 'CHARGEBACK_REQUESTED' ||
      atual === 'CHARGEBACK_DISPUTE' ||
      atual === 'AWAITING_CHARGEBACK_REVERSAL'
    ) {
      rec.set('asaas_status', atual)
      $app.save(rec)
      console.warn('[baixa-asaas] boleto em estorno/chargeback — nao baixado', paymentId, atual)
      e.next()
      return
    }

    // 4) baixa em dinheiro, na data que o Luiz informou no sistema
    let dataPag = String(rec.getString('data_pagamento') || '').slice(0, 10)
    if (!dataPag) dataPag = new Date().toISOString().slice(0, 10)
    const valor = Number(rec.get('valor_final') || rec.get('valor') || 0)
    const corpo = { paymentDate: dataPag, notifyCustomer: false }
    if (valor > 0) corpo.value = valor

    const r1 = $http.send({
      url: base + '/payments/' + paymentId + '/receiveInCash',
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
    })
    console.log(
      '[baixa-asaas] receiveInCash',
      paymentId,
      r1.statusCode,
      JSON.stringify(r1.json || {}).slice(0, 250),
    )

    if (r1.statusCode === 200) {
      // marca antes de salvar: evita que o próprio save dispare o hook de novo
      rec.set('asaas_baixa_dinheiro', true)
      rec.set('asaas_baixa_em', new Date().toISOString())
      rec.set('asaas_status', String(r1.json.status || 'RECEIVED_IN_CASH'))
      $app.save(rec)
      console.log('[baixa-asaas] baixa espelhada', colecao, rec.id, paymentId, dataPag)
    } else {
      // não conseguiu: registra o erro para o Luiz ver na tela e não perde o rastro
      rec.set('asaas_status', 'ERRO_' + String(r1.statusCode))
      $app.save(rec)
      console.warn(
        '[baixa-asaas] Asaas recusou a baixa',
        paymentId,
        r1.statusCode,
        JSON.stringify(r1.json || {}).slice(0, 300),
      )
    }
  } catch (err) {
    console.warn('[baixa-asaas] erro geral', err)
  }
  e.next()
}, 'fechamentos')

onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    const statusNovo = rec.getString('status')
    let statusAntes = ''
    try {
      statusAntes = rec.original().getString('status')
    } catch (_) {}
    if (statusNovo !== 'pago' || statusAntes === 'pago') {
      e.next()
      return
    }
    if (rec.getBool('asaas_baixa_dinheiro')) {
      e.next()
      return
    }
    const paymentId = rec.getString('asaas_payment_id')
    if (!paymentId) {
      e.next()
      return
    }

    const apiKey = $secrets.get('ASAAS_API_KEY')
    if (!apiKey) {
      e.next()
      return
    }
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

    let atual = ''
    try {
      const r0 = $http.send({ url: base + '/payments/' + paymentId, method: 'GET', headers })
      if (r0.statusCode === 200) atual = String(r0.json.status || '')
      else {
        rec.set('asaas_status', 'ERRO_GET')
        $app.save(rec)
        e.next()
        return
      }
    } catch (_) {
      e.next()
      return
    }

    if (atual === 'RECEIVED' || atual === 'CONFIRMED' || atual === 'RECEIVED_IN_CASH') {
      rec.set('asaas_status', atual)
      $app.save(rec)
      e.next()
      return
    }
    if (
      atual === 'REFUNDED' ||
      atual === 'REFUND_REQUESTED' ||
      atual === 'REFUND_IN_PROGRESS' ||
      atual === 'CHARGEBACK_REQUESTED' ||
      atual === 'CHARGEBACK_DISPUTE' ||
      atual === 'AWAITING_CHARGEBACK_REVERSAL'
    ) {
      rec.set('asaas_status', atual)
      $app.save(rec)
      e.next()
      return
    }

    let dataPag = String(rec.getString('data_pagamento') || '').slice(0, 10)
    if (!dataPag) dataPag = new Date().toISOString().slice(0, 10)
    const valor = Number(rec.get('valor') || 0)
    const corpo = { paymentDate: dataPag, notifyCustomer: false }
    if (valor > 0) corpo.value = valor

    const r1 = $http.send({
      url: base + '/payments/' + paymentId + '/receiveInCash',
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
    })
    console.log(
      '[baixa-asaas] receiveInCash (servico)',
      paymentId,
      r1.statusCode,
      JSON.stringify(r1.json || {}).slice(0, 250),
    )

    if (r1.statusCode === 200) {
      rec.set('asaas_baixa_dinheiro', true)
      rec.set('asaas_baixa_em', new Date().toISOString())
      rec.set('asaas_status', String(r1.json.status || 'RECEIVED_IN_CASH'))
      $app.save(rec)
      console.log('[baixa-asaas] baixa espelhada servico', rec.id, paymentId, dataPag)
    } else {
      rec.set('asaas_status', 'ERRO_' + String(r1.statusCode))
      $app.save(rec)
      console.warn(
        '[baixa-asaas] Asaas recusou (servico)',
        paymentId,
        r1.statusCode,
        JSON.stringify(r1.json || {}).slice(0, 300),
      )
    }
  } catch (err) {
    console.warn('[baixa-asaas] erro geral servico', err)
  }
  e.next()
}, 'servicos')
