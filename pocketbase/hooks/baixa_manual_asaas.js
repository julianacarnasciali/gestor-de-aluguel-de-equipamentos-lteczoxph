// Baixa manual no Gestor -> baixa no Asaas como RECEBIDO EM DINHEIRO.
//
// Pedido da Juliana (02/11/2026): quando o Luiz dá baixa no sistema porque o
// cliente pagou por fora (Pix em outra conta da LCCA, dinheiro, etc), o boleto
// fica em aberto no Asaas e a conciliação não fecha.
//
// Caso concreto: Jandira Reserva, serviço avulso de R$ 1.320
// (pay_vuxumky61c5pjt11), pago por Pix em 21/10 fora do Asaas — baixado à mão
// em 02/11 via rota de manutenção.
//
// REGRAS DE SEGURANÇA (roda em toda atualização; errar aqui mexe em dinheiro):
//  1. Só age quando o status VIRA "pago". Reabrir/repetir não dispara nada.
//  2. Só age se ainda NÃO foi espelhado (asaas_baixa_dinheiro).
//  3. Tenta a baixa direto: o receiveInCash é idempotente do lado do Asaas e
//     responde erro claro quando a cobrança já está recebida (ver bloco 4).
//     (O GET de conferência que existia aqui voltava não-200 dentro do JSVM e
//     travava o fluxo com ERRO_GET — removido em 02/11.)
//  4. Estorno/chargeback: só registra, nunca mexe.
//  5. after-success + try/catch total: nunca derruba a resposta do usuário.
//
// Campos asaas_baixa_dinheiro / asaas_baixa_em / asaas_status vêm da migração 0048.
onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    if (rec.collection().name !== 'fechamentos') {
      e.next()
      return
    }
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
      console.warn('[baixa-asaas] sem ASAAS_API_KEY — nao espelhado', rec.id)
      e.next()
      return
    }
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

    let dataPag = String(rec.getString('data_pagamento') || '').slice(0, 10)
    if (!dataPag) dataPag = new Date().toISOString().slice(0, 10)
    const valor = Number(rec.get('valor_final') || rec.get('total') || 0)
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
      JSON.stringify(r1.json || {}).slice(0, 200),
    )

    if (r1.statusCode === 200) {
      rec.set('asaas_baixa_dinheiro', true)
      rec.set('asaas_baixa_em', new Date().toISOString())
      rec.set('asaas_status', String(r1.json.status || 'RECEIVED_IN_CASH'))
      $app.save(rec)
      console.log('[baixa-asaas] baixa espelhada', rec.id, paymentId, dataPag)
    } else {
      const msg = JSON.stringify(r1.json || {}).toLowerCase()
      // já recebido / já confirmado = nada a fazer, só registrar
      const jaRecebido =
        msg.indexOf('já recebida') >= 0 ||
        msg.indexOf('ja recebida') >= 0 ||
        msg.indexOf('já confirmada') >= 0 ||
        msg.indexOf('ja confirmada') >= 0 ||
        msg.indexOf('already') >= 0 ||
        msg.indexOf('estorno') >= 0 ||
        msg.indexOf('chargeback') >= 0
      rec.set('asaas_status', jaRecebido ? 'JA_RECEBIDO' : 'ERRO_' + String(r1.statusCode))
      rec.set('asaas_baixa_dinheiro', jaRecebido)
      $app.save(rec)
      console.warn('[baixa-asaas] Asaas recusou', paymentId, r1.statusCode, msg.slice(0, 250))
    }
  } catch (err) {
    console.warn('[baixa-asaas] erro geral', err)
  }
  e.next()
}, 'fechamentos')

onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    if (rec.collection().name !== 'servicos') {
      e.next()
      return
    }
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
      console.warn('[baixa-asaas] sem ASAAS_API_KEY — nao espelhado', rec.id)
      e.next()
      return
    }
    const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

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
      JSON.stringify(r1.json || {}).slice(0, 200),
    )

    if (r1.statusCode === 200) {
      rec.set('asaas_baixa_dinheiro', true)
      rec.set('asaas_baixa_em', new Date().toISOString())
      rec.set('asaas_status', String(r1.json.status || 'RECEIVED_IN_CASH'))
      $app.save(rec)
      console.log('[baixa-asaas] baixa espelhada servico', rec.id, paymentId, dataPag)
    } else {
      const msg = JSON.stringify(r1.json || {}).toLowerCase()
      const jaRecebido =
        msg.indexOf('já recebida') >= 0 ||
        msg.indexOf('ja recebida') >= 0 ||
        msg.indexOf('já confirmada') >= 0 ||
        msg.indexOf('ja confirmada') >= 0 ||
        msg.indexOf('already') >= 0 ||
        msg.indexOf('estorno') >= 0 ||
        msg.indexOf('chargeback') >= 0
      rec.set('asaas_status', jaRecebido ? 'JA_RECEBIDO' : 'ERRO_' + String(r1.statusCode))
      rec.set('asaas_baixa_dinheiro', jaRecebido)
      $app.save(rec)
      console.warn(
        '[baixa-asaas] Asaas recusou (servico)',
        paymentId,
        r1.statusCode,
        msg.slice(0, 250),
      )
    }
  } catch (err) {
    console.warn('[baixa-asaas] erro geral servico', err)
  }
  e.next()
}, 'servicos')
