/// <reference path="../pb_data/types.d.ts" />
// 0021 — recorrência automática p/ contratos sem impressora
// (mensalidade fixa: só computadores/servidores/serviços — sem leitura)
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('contratos')
    if (!c.fields.getByName('recorrente')) {
      c.fields.add(new BoolField({ name: 'recorrente' }))
    }
    app.save(c)

    // marca como recorrentes os contratos ativos sem impressora ativa
    const contratos = app.findRecordsByFilter('contratos', 'ativo = true', '', 0, 0)
    for (const k of contratos) {
      const impressoras = app.findRecordsByFilter(
        'equipamentos',
        "contrato = '" + k.id + "' && tipo = 'impressora' && ativo = true",
        '',
        1,
        0,
      )
      if (impressoras.length === 0) {
        k.set('recorrente', true)
        app.save(k)
      }
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId('contratos')
    if (c.fields.getByName('recorrente')) c.fields.remove('recorrente')
    app.save(c)
  },
)
