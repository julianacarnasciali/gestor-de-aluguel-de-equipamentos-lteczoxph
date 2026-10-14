/// <reference path="../pb_data/types.d.ts" />
// 0031 — campo foto nos chamados (pedido 13/10: "opção de foto ou vídeo" —
// funcionário tira foto da página impressa, ex.: cor azul não sai).
// Foto via câmera do celular (input accept=image/*) — máx 10MB, jpeg/png/webp.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('chamados')
    try {
      col.fields.getByName('foto')
      return
    } catch (_) {}
    col.fields.add(
      new FileField({
        name: 'foto',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      }),
    )
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('chamados')
    try {
      col.fields.removeByName('foto')
      app.save(col)
    } catch (_) {}
  },
)
