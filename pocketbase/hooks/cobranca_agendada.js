// Fila de cobrança: chama a geração de quem já passou da janela de segurança.
//
// Pedido da Juliana (02/11/2026): "criar um gatilho cronológico para enviar o
// boleto e enviar para a nota fiscal somente 60 minutos ou 2 horas após o evento
// ... de forma que dê para cancelar um registro sem gerar documentos fiscais".
//
// Este arquivo é só o RELÓGIO. A geração (boleto + Pix + NFS-e) mora inteira em
// cobranca_processar.js, para o botão "Emitir agora" e o cron usarem o MESMO
// código — duas cópias divergiriam na primeira correção.
//
// Fluxo:
//  - fechamentos e servicos nascem com cobranca_status = "aguardando" e
//    cobranca_processar_em = criado_em + config.janela_cobranca_minutos.
//  - A cada 5 min, este cron lista o que venceu e chama a rota de geração.
//  - Registro travado em "gerando" (processo morreu no meio) volta para a fila
//    depois de 30 min; após 5 tentativas vira "erro" e para de tentar.
cronAdd('cobranca_agendada', '*/5 * * * *', () => {
  const agora = new Date()

  // ---------- destrava o que ficou preso em "gerando" ----------
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

  // ---------- chama a geração para o que venceu ----------
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const appUrl = String($secrets.get('APP_URL') || '').replace(/\/+$/, '')
  if (!token || !appUrl) {
    console.warn('[cobranca] sem MAESTRO_TOKEN/APP_URL — fila nao processada')
    return
  }

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
      let venceu = true
      try {
        const dt = rec.getDateTime('cobranca_processar_em')
        if (dt && !dt.isZero()) venceu = dt.time().getTime() <= agora.getTime()
      } catch (_) {}
      if (!venceu) continue

      // chamar a própria rota interna: a geração vive num lugar só. O Asaas é
      // chamado a partir da rota, então o trabalho pesado não fica sem timeout.
      try {
        const r = $http.send({
          url: appUrl + '/backend/v1/cobranca/processar',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-maestro-token': token },
          body: JSON.stringify({ colecao: colecao, id: rec.id }),
          timeout: 60,
        })
        if (r.statusCode !== 200) {
          console.warn('[cobranca] falha ao gerar', colecao, rec.id, r.statusCode)
          try {
            const t = Number(rec.get('tentativas_cobranca') || 0) + 1
            rec.set('tentativas_cobranca', t)
            // a rota já grava o motivo em cobranca_erro; aqui só controla retry
            if (t >= 5) rec.set('cobranca_status', 'erro')
            else if (String(rec.getString('cobranca_status')) === 'gerando')
              rec.set('cobranca_status', 'aguardando')
            $app.save(rec)
          } catch (_) {}
        }
      } catch (err) {
        console.warn('[cobranca] erro de transporte', colecao, rec.id, err)
      }
    }
  }
})
