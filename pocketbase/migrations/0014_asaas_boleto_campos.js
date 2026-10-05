/// <reference path="../pb_data/types.d.ts" />
// 0014 — campos do boleto Asaas no fechamento
migrate(
  (app) => {
    const f = app.findCollectionByNameOrId('fechamentos')
    const add = (field) => {
      if (!f.fields.getByName(field['name'])) f.fields.add(field)
    }
    add(new TextField({ name: 'asaas_customer_id' }))
    add(new TextField({ name: 'asaas_payment_id' }))
    add(new URLField({ name: 'asaas_boleto_url' }))
    add(new TextField({ name: 'asaas_linha_digitavel' }))
    app.save(f)
  },
  (app) => {},
)
