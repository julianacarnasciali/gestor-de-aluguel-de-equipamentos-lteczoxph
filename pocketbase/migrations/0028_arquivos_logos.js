/// <reference path="../pb_data/types.d.ts" />
// 0028 — coleção arquivos (hospedagem das logos da landing no gestor).
// Upload público (curl multipart, sem login — só o Maestro usa na prática),
// leitura pública do ARQUIVO (PocketBase serve /api/files/... sempre que o
// registro é visível), listagem só logada.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('arquivos')
      return
    } catch (_) {}
    app.save(
      new Collection({
        name: 'arquivos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true, max: 80 },
          { name: 'arquivo', type: 'file', required: true, maxSelect: 1, maxSize: 5242880 },
          { name: 'created', type: 'autodate', onCreate: true },
        ],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('arquivos'))
    } catch (_) {}
  },
)
