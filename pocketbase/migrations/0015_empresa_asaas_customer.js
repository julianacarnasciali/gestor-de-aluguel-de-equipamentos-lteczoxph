/// <reference path="../pb_data/types.d.ts" />
// 0015 — asaas_customer_id na empresa (reutilizar cliente, nunca duplicar)
migrate(
  (app) => {
    const emp = app.findCollectionByNameOrId('empresas')
    if (!emp.fields.getByName('asaas_customer_id')) {
      emp.fields.add(new TextField({ name: 'asaas_customer_id' }))
    }
    app.save(emp)
  },
  (app) => {},
)
