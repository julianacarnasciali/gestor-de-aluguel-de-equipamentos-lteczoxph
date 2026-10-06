/// <reference path="../pb_data/types.d.ts" />
// 0025 — flag email_enviado no servico (evita reenvio)
migrate(
  (app) => {
    const s = app.findCollectionByNameOrId('servicos')
    if (!s.fields.getByName('email_enviado')) {
      s.fields.add(new TextField({ name: 'email_enviado' }))
    }
    app.save(s)
  },
  (app) => {},
)
