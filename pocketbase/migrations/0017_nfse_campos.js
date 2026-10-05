/// <reference path="../pb_data/types.d.ts" />
// 0017 — campos da NFS-e Asaas no fechamento
migrate(
  (app) => {
    const f = app.findCollectionByNameOrId('fechamentos')
    const add = (field) => {
      if (!f.fields.getByName(field['name'])) f.fields.add(field)
    }
    add(new TextField({ name: 'asaas_invoice_id' }))
    add(new TextField({ name: 'asaas_invoice_status' }))
    add(new URLField({ name: 'asaas_invoice_url' }))
    app.save(f)
  },
  (app) => {},
)
