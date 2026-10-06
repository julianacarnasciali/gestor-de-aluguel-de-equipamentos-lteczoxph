/// <reference path="../pb_data/types.d.ts" />
// 0019 — data de pagamento no fechamento (aba Financeiro)
migrate(
  (app) => {
    const f = app.findCollectionByNameOrId('fechamentos')
    if (!f.fields.getByName('data_pagamento')) {
      f.fields.add(new DateField({ name: 'data_pagamento' }))
    }
    app.save(f)
  },
  (app) => {},
)
