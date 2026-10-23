/// <reference path="../pb_data/types.d.ts" />
// 0038 — PROPOSTAS COMERCIAIS (pedido dela 23/10): gerador de proposta para
// locação, venda ou serviço, com revisão da IA (ortografia + clareza +
// perguntas ao Luiz) e PDF layout LCCA. Pronto p/ automação futura: a rota
// /backend/v1/proposta/gerar aceita origem 'whatsapp' com a mensagem crua do
// cliente — o fluxo automático (WhatsApp → IA → proposta → envio) reusa esta
// rota sem mudança de schema.
migrate(
  (app) => {
    const empresasId = app.findCollectionByNameOrId('empresas').id
    let tem = true
    try {
      tem = !!app.findCollectionByNameOrId('propostas_comerciais')
    } catch (_) {
      tem = false
    }
    if (tem) return
    const col = new Collection({
      name: 'propostas_comerciais',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero', type: 'text', max: 20 },
        {
          name: 'empresa',
          type: 'relation',
          collectionId: empresasId,
          maxSelect: 1,
        },
        { name: 'cliente_nome', type: 'text', required: true, max: 200 },
        { name: 'cliente_doc', type: 'text', max: 25 },
        { name: 'cliente_email', type: 'email' },
        { name: 'cliente_telefone', type: 'text', max: 30 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['locacao', 'venda', 'servico'],
        },
        { name: 'titulo', type: 'text', required: true, max: 200 },
        { name: 'descricao', type: 'text', required: true, max: 5000 },
        { name: 'itens', type: 'json', maxSize: 2000000 },
        { name: 'valor_total', type: 'number' },
        { name: 'validade_dias', type: 'number' },
        { name: 'condicoes', type: 'text', max: 1000 },
        { name: 'texto_final', type: 'text', max: 10000 },
        { name: 'revisao_ia', type: 'json', maxSize: 500000 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['rascunho', 'enviada', 'aceita', 'recusada'],
        },
        {
          name: 'origem',
          type: 'select',
          maxSelect: 1,
          values: ['manual', 'whatsapp', 'ia'],
        },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_propostas_empresa ON propostas_comerciais (empresa)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('propostas_comerciais'))
    } catch (_) {
      // rollback: coleção ainda não existia
    }
  },
)
