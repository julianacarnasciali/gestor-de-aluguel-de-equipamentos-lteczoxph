/// <reference path="../pb_data/types.d.ts" />
// 0013 — campos do fechamento (modal "Lançar Fatura" do sistema antigo)
migrate(
  (app) => {
    const f = app.findCollectionByNameOrId('fechamentos')
    const add = (field) => {
      if (!f.fields.getByName(field['name'])) f.fields.add(field)
    }
    add(
      new SelectField({
        name: 'forma_pgto',
        maxSelect: 1,
        values: ['boleto', 'pix', 'dinheiro', 'transferencia', 'cartao'],
      }),
    )
    add(new BoolField({ name: 'mostrar_periodo' }))
    add(new NumberField({ name: 'desconto_percentual' }))
    add(new NumberField({ name: 'desconto_valor' }))
    add(new NumberField({ name: 'valor_final' }))
    add(new TextField({ name: 'periodo_de' }))
    add(new TextField({ name: 'periodo_ate' }))
    app.save(f)
  },
  (app) => {},
)
