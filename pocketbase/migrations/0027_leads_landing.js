/// <reference path="../pb_data/types.d.ts" />
// 0027 — coleção leads (captura da landing page pública /lcca, pedido 11/10)
// Leads de visitantes NÃO autenticados: createRule público; leitura só logada.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('leads')
      return
    } catch (_) {}
    app.save(
      new Collection({
        name: 'leads',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true, max: 120 },
          { name: 'empresa', type: 'text', max: 120 },
          { name: 'whatsapp', type: 'text', max: 30 },
          { name: 'email', type: 'text', max: 160 },
          {
            name: 'interesse',
            type: 'select',
            maxSelect: 1,
            values: [
              'impressoras',
              'computadores',
              'servidores',
              'infra_completa',
              'software_cupom',
              'nao_sei',
            ],
          },
          { name: 'mensagem', type: 'text', max: 1000 },
          { name: 'origem', type: 'text', max: 60 },
          { name: 'email_notificado', type: 'bool' },
          { name: 'kommo_enviado', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_leads_created ON leads (created)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('leads'))
    } catch (_) {}
  },
)
