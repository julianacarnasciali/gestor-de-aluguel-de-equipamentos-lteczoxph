/// <reference path="../pb_data/types.d.ts" />
// 0036 — módulo Contratos (pedido dela 23/10): arquivo do contrato ASSINADO
// digitalizado (upload) + flag de assinatura com data.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('documentos_contrato')
    const add = (f) => {
      if (!c.fields.getByName(f['name'])) c.fields.add(f)
    }
    add(new FileField({ name: 'arquivo', maxSelect: 1, maxSize: 15728640 }))
    add(new BoolField({ name: 'assinado' }))
    add(new DateField({ name: 'assinado_em' }))
    app.save(c)
  },
  (app) => {},
)
