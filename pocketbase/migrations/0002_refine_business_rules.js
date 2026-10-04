/// <reference path="../pb_data/types.d.ts" />
// 0002 — Refinamentos a partir do código antigo: serviços, templates de documentos, pagamentos, id_legado
migrate(
  (app) => {
    const RULE_AUTH = "@request.auth.id != ''"
    const AUTO = [
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]

    // ---------- SERVIÇOS (recorrentes e extras por contrato) ----------
    const contratosId = app.findCollectionByNameOrId('contratos').id
    app.save(
      new Collection({
        name: 'servicos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'contrato',
            type: 'relation',
            required: true,
            collectionId: contratosId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['recorrente', 'extra'],
            maxSelect: 1,
          }, // extra = avulso, cobra no mês
          { name: 'descricao', type: 'text', required: true, max: 200 },
          { name: 'valor', type: 'number' },
          { name: 'competencia', type: 'text', max: 7 }, // MM/YYYY (para extras)
          { name: 'ativo', type: 'bool' },
          ...AUTO,
        ],
      }),
    )

    // ---------- TEMPLATES de documentos (contrato, termos — editáveis) ----------
    app.save(
      new Collection({
        name: 'templates',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['contrato', 'termo_entrega', 'termo_devolucao'],
            maxSelect: 1,
          },
          { name: 'titulo', type: 'text', required: true, max: 120 },
          { name: 'conteudo', type: 'editor', maxSize: 512000 }, // HTML com placeholders {_nome_cliente} {_local_data} {_tabela}
          ...AUTO,
        ],
        indexes: ['CREATE UNIQUE INDEX idx_templates_tipo ON templates (tipo)'],
      }),
    )

    // ---------- PAGAMENTOS ----------
    const empresasId = app.findCollectionByNameOrId('empresas').id
    const fechamentosId = app.findCollectionByNameOrId('fechamentos').id
    app.save(
      new Collection({
        name: 'pagamentos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          { name: 'fechamento', type: 'relation', collectionId: fechamentosId, maxSelect: 1 },
          {
            name: 'empresa',
            type: 'relation',
            required: true,
            collectionId: empresasId,
            maxSelect: 1,
          },
          { name: 'competencia', type: 'text', max: 7 }, // MM/YYYY
          { name: 'data', type: 'date' },
          { name: 'valor', type: 'number' },
          { name: 'forma', type: 'text', max: 60 }, // pix, boleto, transferência...
          { name: 'observacoes', type: 'text' },
          ...AUTO,
        ],
        indexes: ['CREATE INDEX idx_pagamentos_empresa ON pagamentos (empresa)'],
      }),
    )

    // ---------- DOCUMENTOS: recriar com os tipos completos ----------
    // (coleção sem dados — seguro deletar e recriar com a forma definitiva)
    app.delete(app.findCollectionByNameOrId('documentos'))
    app.save(
      new Collection({
        name: 'documentos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: [
              'recibo',
              'fatura',
              'contrato',
              'termo_entrega',
              'termo_devolucao',
              'relatorio_equipamento',
              'boleto',
              'nfse',
            ],
            maxSelect: 1,
          },
          { name: 'fechamento', type: 'relation', collectionId: fechamentosId, maxSelect: 1 }, // obrigatório p/ recibo/fatura/boleto/nfse
          { name: 'contrato', type: 'relation', collectionId: contratosId, maxSelect: 1 }, // obrigatório p/ contrato/termos
          { name: 'competencia', type: 'text', max: 7 }, // MM/YYYY (recibo, relatório)
          {
            name: 'arquivo',
            type: 'file',
            required: true,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
          },
          { name: 'numero', type: 'text', max: 40 },
          ...AUTO,
        ],
        indexes: ['CREATE INDEX idx_documentos_fechamento ON documentos (fechamento)'],
      }),
    )

    // ---------- id_legado (rastreabilidade da importação do dump antigo) ----------
    for (const name of ['empresas', 'contratos', 'equipamentos', 'leituras']) {
      const col = app.findCollectionByNameOrId(name)
      if (!col.fields.getByName('id_legado')) {
        col.fields.add(new NumberField({ name: 'id_legado', onlyInt: true }))
      }
      app.save(col)
    }
  },
  (app) => {
    for (const name of ['pagamentos', 'templates', 'servicos']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    // down de id_legado
    for (const name of ['empresas', 'contratos', 'equipamentos', 'leituras']) {
      try {
        const col = app.findCollectionByNameOrId(name)
        if (col.fields.getByName('id_legado')) {
          col.fields.removeByName('id_legado')
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
