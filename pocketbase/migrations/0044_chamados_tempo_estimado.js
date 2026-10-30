/// <reference path="../pb_data/types.d.ts" />
// 0044 — marca os tempos ESTIMADOS dos chamados (30/10).
//
// Por quê: a migração 0043 preencheu iniciado_em/resolvido_em dos chamados
// ANTIGOS a partir do campo `updated` — é uma aproximação, não um carimbo
// real de clique. Como a Juliana vai usar esse número para VENDER o software
// ("o funcionário levou X para atender"), o relatório não pode apresentar
// estimativa como medição. Este campo separa as duas coisas.
//
// Regra: tudo criado ANTES do SLA entrar no ar (30/10 21:12 UTC) é estimado.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('chamados')
    if (!c.fields.getByName('tempo_estimado')) {
      c.fields.add(new BoolField({ name: 'tempo_estimado' }))
    }
    app.save(c)

    const limite = '2026-10-30 21:12:00.000Z'
    try {
      const antigos = app.findRecordsByFilter('chamados', 'created < "' + limite + '"', '', 0, 0)
      for (const r of antigos) {
        r.set('tempo_estimado', true)
        app.save(r)
      }
      console.log('[0044] chamados com tempo estimado marcados:', antigos.length)
    } catch (err) {
      console.warn('[0044] falhou ao marcar estimados', err)
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId('chamados')
    if (c.fields.getByName('tempo_estimado')) c.fields.removeByName('tempo_estimado')
    app.save(c)
  },
)
