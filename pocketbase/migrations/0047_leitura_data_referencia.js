/// <reference path="../pb_data/types.d.ts" />
// 0047 — Data da leitura e mês de referência no fechamento (pedido 01/11/2026)
//
// Por que existe: a competência é o MÊS DE USO (regra da Juliana, 31/10), mas a
// leitura nem sempre é tirada dentro desse mês. Caso concreto: o sistema entrou
// no ar no começo de outubro e as primeiras leituras — referentes a SETEMBRO —
// foram tiradas em 04-13/10. Sem esses dois campos o recibo não consegue
// explicar por que uma competência de setembro tem data de outubro.
//
// data_leitura      = quando a leitura foi efetivamente tirada
// leitura_referencia = mês de uso a que a leitura se refere (ex.: "setembro/2026")
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fechamentos')

    // getByName devolve null (não lança) quando o campo não existe — é o padrão
    // que uso desde o bug da migração 0031, que falhava em silêncio.
    if (!col.fields.getByName('data_leitura')) {
      col.fields.add(
        new DateField({
          name: 'data_leitura',
          required: false,
          presentable: false,
        }),
      )
    }
    if (!col.fields.getByName('leitura_referencia')) {
      col.fields.add(
        new TextField({
          name: 'leitura_referencia',
          required: false,
          max: 40,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fechamentos')
      const a = col.fields.getByName('data_leitura')
      if (a) col.fields.removeById(a.id)
      const b = col.fields.getByName('leitura_referencia')
      if (b) col.fields.removeById(b.id)
      app.save(col)
    } catch (_) {}
  },
)
