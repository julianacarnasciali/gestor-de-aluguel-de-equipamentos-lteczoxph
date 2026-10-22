/// <reference path="../pb_data/types.d.ts" />
// 0034 — franquia de páginas POR MÁQUINA (pedido da Juliana 21/10: contratos
// novos têm franquia individual por máquina — o que sobra na franquia de uma
// não cobre o excedente de outra). Campo opcional; sem ele, vale a franquia
// do contrato como é hoje.
migrate(
  (app) => {
    const e = app.findCollectionByNameOrId('equipamentos')
    if (!e.fields.getByName('franquia_paginas')) {
      e.fields.add(new NumberField({ name: 'franquia_paginas', onlyInt: true }))
    }
    app.save(e)
  },
  (app) => {},
)
