/// <reference path="../pb_data/types.d.ts" />
// 0041 — nichos novos no catálogo de demonstrações (29/10)
// Adiciona "locacao" (gestor de locação de impressoras) e "juridico"
// (software para advogados) ao select "interesse" da coleção leads.
// O formulário de pedido de demonstração grava na mesma coleção.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('leads')
    const f = col.fields.getByName('interesse')
    for (const novo of ['locacao', 'juridico']) {
      if (!f.values.includes(novo)) f.values.push(novo)
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('leads')
    const f = col.fields.getByName('interesse')
    f.values = f.values.filter((v) => v !== 'locacao' && v !== 'juridico')
    app.save(col)
  },
)
