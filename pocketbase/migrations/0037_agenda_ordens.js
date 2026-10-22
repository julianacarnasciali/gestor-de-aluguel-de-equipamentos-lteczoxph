/// <reference path="../pb_data/types.d.ts" />
// 0037 — AGENDA + ORDENS DE SERVIÇO (pedido dela 22/10, módulos que caminham
// juntos): a visita agendada (Luiz + Juliana: técnica, entrega/instalação,
// comercial) gera a OS; a OS pode virar cobrança (reaproveita o hook
// servico_avulso.js → boleto + Pix + NFS-e) ou ficar só como registro.
migrate(
  (app) => {
    const empresasId = app.findCollectionByNameOrId('empresas').id

    if (!app.findCollectionByNameOrId('agenda')) {
      const agenda = new Collection({
        name: 'agenda',
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
            collectionId: empresasId,
            maxSelect: 1,
          },
          { name: 'titulo', type: 'text', required: true, max: 200 },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['visita_tecnica', 'entrega_instalacao', 'comercial', 'outro'],
          },
          { name: 'data', type: 'date', required: true },
          { name: 'hora', type: 'text', max: 5 },
          { name: 'duracao_min', type: 'number' },
          {
            name: 'responsavel',
            type: 'select',
            maxSelect: 1,
            values: ['luiz', 'juliana', 'ambos'],
          },
          { name: 'endereco', type: 'text', max: 300 },
          { name: 'descricao', type: 'text', max: 2000 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['agendado', 'realizado', 'cancelado'],
          },
          { name: 'os_gerada', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_agenda_data ON agenda (data)'],
      })
      app.save(agenda)
    }

    if (!app.findCollectionByNameOrId('ordens_servico')) {
      const os = new Collection({
        name: 'ordens_servico',
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
            required: true,
            collectionId: empresasId,
            maxSelect: 1,
          },
          {
            name: 'agenda',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('agenda').id,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['manutencao', 'instalacao', 'entrega', 'visita_tecnica', 'outro'],
          },
          { name: 'data', type: 'date', required: true },
          { name: 'descricao', type: 'text', required: true, max: 5000 },
          { name: 'tecnico', type: 'text', max: 120 },
          { name: 'valor_pecas', type: 'number' },
          { name: 'valor_servico', type: 'number' },
          { name: 'valor_total', type: 'number' },
          { name: 'gerar_cobranca', type: 'bool' },
          { name: 'cobranca_gerada', type: 'bool' },
          { name: 'servico_id', type: 'text', max: 30 },
          { name: 'data_vencimento', type: 'date' },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['aberta', 'aguardando_assinatura', 'assinada', 'faturada', 'cancelada'],
          },
          { name: 'assinatura_nome', type: 'text', max: 120 },
          { name: 'assinatura_cargo', type: 'text', max: 120 },
          { name: 'assinatura_imagem', type: 'text', maxSize: 2000000 },
          { name: 'assinado_em', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_os_empresa ON ordens_servico (empresa)'],
      })
      app.save(os)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('ordens_servico'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('agenda'))
    } catch (_) {}
  },
)
