/// <reference path="../pb_data/types.d.ts" />
// 0024 — reconstrói "servicos" com o schema do serviço avulso
// (a 0023 rodou no-op: a coleção do template já existia; 0 registros — seguro)
migrate(
  (app) => {
    const empresasId = app.findCollectionByNameOrId('empresas').id
    try {
      const antiga = app.findCollectionByNameOrId('servicos')
      if (antiga) app.delete(antiga)
    } catch (_) {}

    app.save(
      new Collection({
        name: 'servicos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'empresa',
            type: 'relation',
            required: true,
            collectionId: empresasId,
            maxSelect: 1,
          },
          { name: 'descricao', type: 'text', required: true, max: 500 },
          { name: 'valor', type: 'number', required: true },
          { name: 'data_servico', type: 'date' },
          { name: 'data_vencimento', type: 'date', required: true },
          {
            name: 'status',
            type: 'select',
            values: ['emitido', 'pago', 'cancelado'],
            maxSelect: 1,
          },
          { name: 'emite_nf', type: 'bool' },
          { name: 'asaas_customer_id', type: 'text' },
          { name: 'asaas_payment_id', type: 'text' },
          { name: 'asaas_boleto_url', type: 'url' },
          { name: 'asaas_linha_digitavel', type: 'text' },
          { name: 'asaas_pix_payload', type: 'text' },
          { name: 'asaas_invoice_id', type: 'text' },
          { name: 'asaas_invoice_status', type: 'text' },
          { name: 'asaas_invoice_url', type: 'url' },
          { name: 'data_pagamento', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_servicos_empresa ON servicos (empresa)'],
      }),
    )
  },
  (app) => {},
)
