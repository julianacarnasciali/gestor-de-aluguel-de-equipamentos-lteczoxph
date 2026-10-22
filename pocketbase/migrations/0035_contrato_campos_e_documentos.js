/// <reference path="../pb_data/types.d.ts" />
// 0035 — geração de contrato/aditivo com conferência do agente de IA (pedido
// dela 22/10): campos de contrato na empresa + coleção de rascunhos.
// Fluxo: preenche campos → botão → hook roda $ai.chat (conferência: campos
// preenchidos + ortografia) → gera o documento → grava em documentos_contrato.
migrate(
  (app) => {
    // campos de contrato na empresa
    const emp = app.findCollectionByNameOrId('empresas')
    const add = (f) => {
      if (!emp.fields.getByName(f['name'])) emp.fields.add(f)
    }
    add(new TextField({ name: 'resp_cargo', max: 60 }))
    add(new TextField({ name: 'end_instalacao', max: 300 }))
    add(new TextField({ name: 'prazo_meses', max: 10 }))
    add(new TextField({ name: 'mes_reajuste', max: 20 }))
    add(new TextField({ name: 'indice_reajuste', max: 20 }))
    add(new TextField({ name: 'sla_atendimento', max: 60 }))
    add(new TextField({ name: 'sla_resolucao', max: 60 }))
    add(new TextField({ name: 'clausula_consumiveis', max: 500 }))
    add(new TextField({ name: 'testemunha1', max: 120 }))
    add(new TextField({ name: 'testemunha2', max: 120 }))
    app.save(emp)

    // coleção de rascunhos de documentos
    try {
      app.findCollectionByNameOrId('documentos_contrato')
      return
    } catch (_) {}
    app.save(
      new Collection({
        name: 'documentos_contrato',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'empresa', type: 'relation', required: true, collectionId: emp.id, maxSelect: 1 },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['contrato', 'aditivo_renovacao', 'aditivo_inclusao', 'aditivo_exclusao'],
          },
          { name: 'dados', type: 'json' },
          { name: 'conferencia', type: 'json' },
          { name: 'texto', type: 'text', max: 60000 },
          {
            name: 'status',
            type: 'select',
            maxSelect: 1,
            values: ['rascunho', 'conferido', 'gerado', 'assinado'],
            required: true,
          },
          { name: 'numero', type: 'text', max: 30 },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_doccontrato_empresa ON documentos_contrato (empresa)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('documentos_contrato'))
    } catch (_) {}
  },
)
