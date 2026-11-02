// Hook: agenda a cobrança do serviço avulso em vez de gerar na hora.
//
// MUDANÇA 02/11/2026 (pedido da Juliana): o serviço avulso gerava boleto + Pix +
// NFS-e no ato da criação, e o e-mail saía em seguida. Um erro de digitação no
// valor virava nota fiscal emitida. Agora o registro nasce em "aguardando" e só
// gera depois da janela (config.janela_cobranca_minutos, padrão 60 min).
//
// Quem gera boleto/Pix/NF é o cron do cobranca_agendada.js. Este hook só marca
// a hora. A OS (os_cobrar.js) cria um registro em servicos e cai na mesma fila.
onRecordAfterCreateSuccess((e) => {
  try {
    const rec = e.record
    if (rec.collection().name !== 'servicos') {
      e.next()
      return
    }

    const total = Number(rec.getFloat('valor')) || 0
    if (!total || total <= 0) {
      e.next()
      return
    }

    if (rec.getString('cobranca_status')) {
      e.next()
      return
    }

    let minutos = 60
    try {
      const cfgs = $app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
      if (cfgs.length > 0) {
        const v = Number(cfgs[0].get('janela_cobranca_minutos') || 0)
        if (v > 0) minutos = v
      }
    } catch (_) {}

    const fmt = (ms) => {
      const d = new Date(ms)
      const p = (n) => String(n).padStart(2, '0')
      return (
        d.getUTCFullYear() +
        '-' +
        p(d.getUTCMonth() + 1) +
        '-' +
        p(d.getUTCDate()) +
        ' ' +
        p(d.getUTCHours()) +
        ':' +
        p(d.getUTCMinutes()) +
        ':' +
        p(d.getUTCSeconds()) +
        '.000Z'
      )
    }
    const agoraMs = Date.now()
    rec.set('cobranca_agendada_em', fmt(agoraMs))
    rec.set('cobranca_processar_em', fmt(agoraMs + minutos * 60 * 1000))
    rec.set('cobranca_status', 'aguardando')
    $app.save(rec)
    console.log(
      '[servico] cobranca agendada p/',
      rec.id,
      'em',
      minutos,
      'min — boleto/NF/e-mail NAO foram gerados',
    )
  } catch (err) {
    console.warn('[servico] erro ao agendar cobranca', err)
  }
  e.next()
}, 'servicos')
