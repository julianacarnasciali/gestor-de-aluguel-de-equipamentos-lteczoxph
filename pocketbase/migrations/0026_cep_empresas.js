/// <reference path="../pb_data/types.d.ts" />
// 0026 — campo cep na colecao empresas (cadastro CEP-first, pedido 08/10)
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('empresas')
    if (!c.fields.getByName('cep')) {
      c.fields.add(new TextField({ name: 'cep' }))
    }
    app.save(c)
  },
  (app) => {},
)
