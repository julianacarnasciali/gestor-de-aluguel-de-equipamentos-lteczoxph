/// <reference path="../pb_data/types.d.ts" />
// 0042 — CORREÇÃO: campo `foto` em chamados (30/10, bug real encontrado)
//
// A migração 0031 nunca criou o campo: ela fazia
//   try { col.fields.getByName('foto'); return } catch (_) {}
// e como getByName devolve null (não lança) quando o campo não existe,
// o `return` executava SEMPRE — a migração ficou marcada como aplicada e o
// campo nunca foi adicionado. Resultado: TODA foto enviada pelo QR era
// descartada em silêncio (5/5 chamados sem mídia).
//
// Fix no padrão da 0040 (que funciona): if (!c.fields.getByName(...)) add.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('chamados')
    if (!c.fields.getByName('foto')) {
      c.fields.add(
        new FileField({
          name: 'foto',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
        }),
      )
    }
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId('chamados')
    if (c.fields.getByName('foto')) c.fields.removeByName('foto')
    app.save(c)
  },
)
