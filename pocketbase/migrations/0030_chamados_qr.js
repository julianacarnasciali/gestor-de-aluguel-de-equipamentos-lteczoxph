/// <reference path="../pb_data/types.d.ts" />
// 0030 — coleção chamados (QR code do patrimônio → chamado técnico, pedido 13/10)
// Cliente escaneia o QR da etiqueta → abre a página PÚBLICA /chamado?eq=<id>
// → descreve o defeito + sobe vídeo curto. Sem login (createRule público).
// Leitura/painel: só logados. Prioridade: derivada do setor (ver hook/rota).
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('chamados')
      return
    } catch (_) {}
    app.save(
      new Collection({
        name: 'chamados',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'equipamento', type: 'relation', collectionId: 'equipamentos', maxSelect: 1 },
          { name: 'empresa', type: 'relation', collectionId: 'empresas', maxSelect: 1 },
          { name: 'setor', type: 'text', max: 120 },
          { name: 'patrimonio', type: 'text', max: 60 },
          { name: 'contato', type: 'text', max: 120 },
          { name: 'descricao', type: 'text', required: true, max: 2000 },
          {
            name: 'video',
            type: 'file',
            maxSelect: 1,
            maxSize: 52428800,
            mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
          },
          {
            name: 'prioridade',
            type: 'select',
            maxSelect: 1,
            values: ['baixa', 'media', 'alta', 'urgente'],
            required: true,
          },
          {
            name: 'status',
            type: 'select',
            maxSelect: 1,
            values: ['aberto', 'em_atendimento', 'resolvido'],
            required: true,
          },
          { name: 'resolucao', type: 'text', max: 2000 },
          { name: 'email_notificado', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_chamados_created ON chamados (created)',
          'CREATE INDEX idx_chamados_status ON chamados (status)',
        ],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('chamados'))
    } catch (_) {}
  },
)
