/// <reference path="../pb_data/types.d.ts" />
// 0043 — SLA dos chamados técnicos (pedido dela 30/10): controlar o tempo de
// atendimento com as próprias metas.
//
// O que entra:
//  chamados → iniciado_em / resolvido_em (carimbos de hora do "Iniciar
//  atendimento" e "Marcar resolvido"), iniciado_por / resolvido_por (quem
//  clicou), sla_horas (meta congelada no momento da abertura) e prazo_em
//  (created + sla_horas). O prazo fica GRAVADO no chamado para que mudar a
//  meta depois não reescreva o histórico.
//  config → sla_urgente_horas / sla_alta_horas / sla_media_horas /
//  sla_baixa_horas (editáveis na tela de Chamados).
//
// Guard correto: if (!getByName) add — NUNCA try{getByName;return}catch
// (getByName devolve null sem lançar; foi o bug da migração 0031 — ver 0042).
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('chamados')
    if (!c.fields.getByName('iniciado_em')) {
      c.fields.add(new DateField({ name: 'iniciado_em' }))
    }
    if (!c.fields.getByName('resolvido_em')) {
      c.fields.add(new DateField({ name: 'resolvido_em' }))
    }
    if (!c.fields.getByName('iniciado_por')) {
      c.fields.add(new TextField({ name: 'iniciado_por', max: 120 }))
    }
    if (!c.fields.getByName('resolvido_por')) {
      c.fields.add(new TextField({ name: 'resolvido_por', max: 120 }))
    }
    if (!c.fields.getByName('sla_horas')) {
      c.fields.add(new NumberField({ name: 'sla_horas', min: 0, max: 720 }))
    }
    if (!c.fields.getByName('prazo_em')) {
      c.fields.add(new DateField({ name: 'prazo_em' }))
    }
    app.save(c)

    // metas globais (horas) por prioridade — padrão do contrato SaaS da LCCA:
    // P1 4h · P2 1 dia útil (8h) · P3 1 dia (24h) · P4 2 dias (48h)
    const k = app.findCollectionByNameOrId('config')
    if (!k.fields.getByName('sla_urgente_horas')) {
      k.fields.add(new NumberField({ name: 'sla_urgente_horas', min: 0, max: 720 }))
    }
    if (!k.fields.getByName('sla_alta_horas')) {
      k.fields.add(new NumberField({ name: 'sla_alta_horas', min: 0, max: 720 }))
    }
    if (!k.fields.getByName('sla_media_horas')) {
      k.fields.add(new NumberField({ name: 'sla_media_horas', min: 0, max: 720 }))
    }
    if (!k.fields.getByName('sla_baixa_horas')) {
      k.fields.add(new NumberField({ name: 'sla_baixa_horas', min: 0, max: 720 }))
    }
    app.save(k)

    const padrao = { urgente: 4, alta: 8, media: 24, baixa: 48 }

    try {
      const cfgs = app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
      if (cfgs.length > 0) {
        const cfg = cfgs[0]
        let mudou = false
        for (const p of ['urgente', 'alta', 'media', 'baixa']) {
          const campo = 'sla_' + p + '_horas'
          if (Number(cfg.getFloat(campo) || 0) <= 0) {
            cfg.set(campo, padrao[p])
            mudou = true
          }
        }
        if (mudou) app.save(cfg)
      }
    } catch (err) {
      console.warn('[0043] config nao inicializada', err)
    }

    // backfill: chamados antigos ganham meta e prazo a partir do created
    try {
      const todos = app.findRecordsByFilter('chamados', 'id != ""', '', 0, 0)
      for (const r of todos) {
        if (Number(r.getFloat('sla_horas') || 0) > 0 && r.getString('prazo_em')) continue
        const prio = String(r.getString('prioridade') || 'media')
        const horas = padrao[prio] || 24
        r.set('sla_horas', horas)
        const base = new Date(String(r.getString('created')).replace(' ', 'T'))
        if (!isNaN(base.getTime())) {
          r.set('prazo_em', new Date(base.getTime() + horas * 3600 * 1000).toISOString())
        }
        if (r.getString('status') === 'resolvido' && !r.getString('resolvido_em')) {
          r.set('resolvido_em', String(r.getString('updated')))
        }
        if (r.getString('status') === 'em_atendimento' && !r.getString('iniciado_em')) {
          r.set('iniciado_em', String(r.getString('updated')))
        }
        app.save(r)
      }
      console.log('[0043] backfill SLA em', todos.length, 'chamados')
    } catch (err) {
      console.warn('[0043] backfill falhou', err)
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId('chamados')
    for (const f of [
      'iniciado_em',
      'resolvido_em',
      'iniciado_por',
      'resolvido_por',
      'sla_horas',
      'prazo_em',
    ]) {
      if (c.fields.getByName(f)) c.fields.removeByName(f)
    }
    app.save(c)

    const k = app.findCollectionByNameOrId('config')
    for (const f of ['sla_urgente_horas', 'sla_alta_horas', 'sla_media_horas', 'sla_baixa_horas']) {
      if (k.fields.getByName(f)) k.fields.removeByName(f)
    }
    app.save(k)
  },
)
