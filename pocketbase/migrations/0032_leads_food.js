/// <reference path="../pb_data/types.d.ts" />
// 0032 — nicho food na captura de leads (landing /food, 20/10)
// Adiciona a opção "food" ao select "interesse" da coleção leads.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('leads')
    const f = col.fields.getByName('interesse')
    if (!f.values.includes('food')) {
      f.values.push('food')
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('leads')
    const f = col.fields.getByName('interesse')
    f.values = f.values.filter((v) => v !== 'food')
    app.save(col)
  },
)
