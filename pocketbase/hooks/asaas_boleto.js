// Hook: agenda a cobrança do fechamento em vez de gerar na hora.
//
// MUDANÇA 02/11/2026 (pedido da Juliana): antes, criar um fechamento gerava
// boleto + NFS-e no mesmo instante. Se o lançamento estava errado ou era teste,
// o documento fiscal já tinha saído e o e-mail já tinha ido ao cliente.
//
// Agora o registro nasce em "aguardando" e só gera depois da janela
// configurada (config.janela_cobranca_minutos, padrão 60 min). Quem gera é o
// cron do cobranca_agendada.js — este hook apenas marca a hora.
//
// IMPORTANTE: este arquivo NÃO gera mais boleto nem nota. Toda a geração vive
// em cobranca_agendada.js, num lugar só, para as duas coleções.
onRecordAfterCreateSuccess((e) => {
  try {
    const rec = e.record
    if (rec.collection().name !== 'fechamentos') {
      e.next()
      return
    }

    const total = Number(rec.getString('valor_final')) || Number(rec.getString('total')) || 0
    if (!total || total <= 0) {
      e.next()
      return
    }

    // já veio com cobrança? (importação/seed) não mexe
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

    // DateTime só aceita string de data; o offset sai do JavaScript puro.
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
      '[fechamento] cobranca agendada p/',
      rec.id,
      'em',
      minutos,
      'min — boleto/NF/e-mail NAO foram gerados',
    )
  } catch (err) {
    console.warn('[fechamento] erro ao agendar cobranca', err)
  }
  e.next()
}, 'fechamentos')
