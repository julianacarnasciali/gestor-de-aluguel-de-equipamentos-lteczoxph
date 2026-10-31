/// <reference path="../pb_data/types.d.ts" />
// 0046 — limiares do ALERTA DE TROCA (pedido dela 31/10, "sugestão 2").
//
// Ficam na config (global) porque são política da LCCA, não do cliente:
//   alerta_qtd_12m   = quantas manutenções corretivas em 12 meses disparam
//   alerta_custo_12m = quanto de peça em 12 meses dispara
// Padrão inicial: 4 corretivas OU R$ 500 de peça. Como não existe número
// universal, a tela deixa calibrar — estes campos guardam a escolha dela.
//
// Guard: if (!getByName) add (nunca try{getByName;return}catch — migração 0031).
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('config')
    if (!c.fields.getByName('alerta_qtd_12m')) {
      c.fields.add(new NumberField({ name: 'alerta_qtd_12m', min: 0, max: 999 }))
    }
    if (!c.fields.getByName('alerta_custo_12m')) {
      c.fields.add(new NumberField({ name: 'alerta_custo_12m', min: 0 }))
    }
    app.save(c)

    try {
      const cfgs = app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
      if (cfgs.length > 0) {
        const cfg = cfgs[0]
        let mudou = false
        if (Number(cfg.getFloat('alerta_qtd_12m') || 0) <= 0) {
          cfg.set('alerta_qtd_12m', 4)
          mudou = true
        }
        if (Number(cfg.getFloat('alerta_custo_12m') || 0) <= 0) {
          cfg.set('alerta_custo_12m', 500)
          mudou = true
        }
        if (mudou) app.save(cfg)
      }
    } catch (err) {
      console.warn('[0046] config nao inicializada', err)
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId('config')
    for (const f of ['alerta_qtd_12m', 'alerta_custo_12m']) {
      if (c.fields.getByName(f)) c.fields.removeByName(f)
    }
    app.save(c)
  },
)
