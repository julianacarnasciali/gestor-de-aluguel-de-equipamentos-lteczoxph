/// <reference path="../pb_data/types.d.ts" />
// 0033 — valor mensal negociado POR EQUIPAMENTO (pedido da Juliana 21/10:
// o Luiz precifica cada máquina individualmente, sem tabela; no fechamento,
// se houver máquinas com valor lançado, o total de impressoras vira a soma
// delas; se nenhuma tiver, mantém a mensalidade do contrato como era)
migrate(
  (app) => {
    const e = app.findCollectionByNameOrId('equipamentos')
    if (!e.fields.getByName('vlr_mensal')) {
      e.fields.add(new NumberField({ name: 'vlr_mensal' }))
    }
    app.save(e)
  },
  (app) => {},
)
