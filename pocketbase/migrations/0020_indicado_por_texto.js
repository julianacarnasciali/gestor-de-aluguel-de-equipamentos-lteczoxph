/// <reference path="../pb_data/types.d.ts" />
// 0020 — indicado por (texto livre, para pessoas que não são clientes)
migrate(
  (app) => {
    const emp = app.findCollectionByNameOrId('empresas')
    if (!emp.fields.getByName('indicado_por_texto')) {
      emp.fields.add(new TextField({ name: 'indicado_por_texto' }))
    }
    app.save(emp)
  },
  (app) => {},
)
