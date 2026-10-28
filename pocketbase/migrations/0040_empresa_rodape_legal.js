/// <reference path="../pb_data/types.d.ts" />
// 0040 — texto legal do recibo POR CLIENTE (pedido dela 28/10)
// Motivo: o financeiro da Jandira não aceitou o texto novo (não incidência /
// Súmula 31) e exige o texto do sistema antigo ("ISENTO DO ISS — ITEM 3.01").
// Em vez de voltar o texto errado para todos, cada empresa pode ter o SEU
// rodapé; quando vazio, vale o rodapé legal global da config.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('empresas')
    if (!c.fields.getByName('rodape_legal')) {
      c.fields.add(new TextField({ name: 'rodape_legal', max: 1200 }))
    }
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId('empresas')
    if (c.fields.getByName('rodape_legal')) c.fields.removeByName('rodape_legal')
    app.save(c)
  },
)
