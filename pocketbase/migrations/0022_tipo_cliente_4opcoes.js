/// <reference path="../pb_data/types.d.ts" />
// 0022 — tipo de cliente em 4 opções: impressora | misto | computador | avulso
migrate(
  (app) => {
    const emp = app.findCollectionByNameOrId('empresas')
    const f = emp.fields.getByName('tipo_cliente')
    if (f) {
      f.values = ['impressora', 'misto', 'computador', 'avulso']
      app.save(emp)
    }

    // remapeia os existentes: contrato -> misto (padrão seguro: tem impressora + computador/servidor)
    const empresas = app.findRecordsByFilter('empresas', 'tipo_cliente = "contrato"', '', 500, 0)
    for (const e of empresas) {
      e.set('tipo_cliente', 'misto')
      app.save(e)
    }
  },
  (app) => {},
)
