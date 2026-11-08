// REDE DE SEGURANÇA DA NOTA (08/11/2026)
//
// REGRA DA EMPRESA (palavras da Juliana):
//   "Eu fiz o serviço, gravou, tem que gerar nota, boleto e email. Isso é uma
//    regra primária da empresa. Tem que funcionar tudo sozinho."
//
// O QUE ESTE ARQUIVO EVITA: uma nota que fica presa em SCHEDULED (agendada)
// trava o e-mail pela trava de cobrança — e ninguém percebe, porque o registro
// parece normal na tela. A cobrança saiu pela janela e o cliente nunca recebe.
//
// O QUE FAZ: a cada 10 minutos procura registros com cobrança já GERADA, com
// nota criada e status SCHEDULED, e pede ao Asaas para antecipar a emissão:
//   POST /v3/invoices/{id}/authorize
// Essa rota NÃO cria nota nova — só manda processar a que já existe. Quando o
// Asaas autoriza, o $app.save() abaixo dispara o hook de e-mail, que agora
// consulta a trava e libera o envio (relatório + boleto + nota).
//
// POR QUE AQUI E NÃO SÓ NO cobranca_processar: lá a antecipação é tentada no
// momento da geração. Se a prefeitura estiver fora do ar naquele instante, a
// nota fica agendada para o vencimento e o e-mail esperaria semanas. Este cron
// insiste sozinho até conseguir.
//
// SEGURANÇA:
//  - Só mexe em registro com cobranca_status = "gerada" (a janela de 60 min já
//    passou; dentro da janela a cobrança é "aguardando" e NÃO é tocada).
//  - Só chama /authorize; nunca cria, cancela ou altera valor.
//  - Nunca apaga nada e nunca escreve e-mail à mão: quem decide enviar é a
//    trava, sempre.
//  - Idade mínima de 10 min desde a criação da cobrança, para não competir com
//    a antecipação feita na geração.
cronAdd('nota_autorizar_pendentes', '*/10 * * * *', () => {
  const apiKey = $secrets.get('ASAAS_API_KEY')
  const base = $secrets.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
  if (!apiKey) {
    console.warn('[nota-pendente] sem ASAAS_API_KEY')
    return
  }
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }
  const agora = Date.now()

  for (const colecao of ['fechamentos', 'servicos']) {
    let lista = []
    try {
      lista = $app.findRecordsByFilter(
        colecao,
        'cobranca_status = "gerada" && asaas_invoice_status = "SCHEDULED" && asaas_invoice_id != ""',
        'updated',
        20,
        0,
      )
    } catch (err) {
      console.warn('[nota-pendente] erro ao listar', colecao, err)
      continue
    }

    for (const rec of lista) {
      try {
        // 10 min de carência: deixa a antecipação da geração terminar primeiro
        let idadeOk = true
        try {
          const dt = rec.getDateTime('cobranca_agendada_em')
          if (dt && !dt.isZero()) idadeOk = dt.time().getTime() < agora - 10 * 60 * 1000
        } catch (_) {}

        // já enviado para o cliente? então não há e-mail esperando
        let jaEnviado = false
        try {
          jaEnviado =
            rec.getString('email_enviado') === 'sim' || rec.getString('status') === 'enviado'
        } catch (_) {}

        // 40 min desde a última tentativa: não martela a prefeitura
        let tentouHaPouco = false
        try {
          const du = rec.getDateTime('updated')
          if (du && !du.isZero()) tentouHaPouco = du.time().getTime() > agora - 40 * 60 * 1000
        } catch (_) {}

        if (!idadeOk || jaEnviado || tentouHaPouco) continue

        const invoiceId = String(rec.getString('asaas_invoice_id') || '')
        const r = $http.send({
          url: base + '/invoices/' + invoiceId + '/authorize',
          method: 'POST',
          headers,
        })
        if (r.statusCode === 200) {
          const novo = String((r.json && r.json.status) || '')
          const url = (r.json && (r.json.pdfUrl || r.json.externalPdfUrl)) || ''
          if (novo) rec.set('asaas_invoice_status', novo)
          if (url) rec.set('asaas_invoice_url', url)
          $app.save(rec) // dispara o hook de e-mail -> trava -> envio se completo
          console.log('[nota-pendente] antecipada', colecao, rec.id, invoiceId, '->', novo)
        } else {
          console.warn(
            '[nota-pendente] falhou',
            colecao,
            rec.id,
            invoiceId,
            r.statusCode,
            JSON.stringify(r.json || {}).slice(0, 200),
          )
        }
      } catch (err) {
        console.warn('[nota-pendente] erro no registro', colecao, rec.id, err)
      }
    }
  }
})
