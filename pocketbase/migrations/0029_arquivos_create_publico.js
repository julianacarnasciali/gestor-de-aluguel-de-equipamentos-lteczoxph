/// <reference path="../pb_data/types.d.ts" />
// 0029 — arquivos: createRule público de verdade (string vazia = anyone).
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('arquivos')
    c.createRule = ''
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId('arquivos')
    c.createRule = null
    app.save(c)
  },
)
