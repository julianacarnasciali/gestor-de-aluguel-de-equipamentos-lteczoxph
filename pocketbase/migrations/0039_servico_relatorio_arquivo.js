// Migração 0039: campos p/ arquivamento de relatório + correção IA da descrição
// nos serviços avulso (pedido dela 26/10):
// - relatorio_html (editor/html): snapshot do relatório enviado ao cliente
// - descricao_original (text): o que o Luiz digitou, preservado
// Regras: usuários autenticados leem/editam (mesma política dos negócio).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('servicos')
    if (!col.fields.getByName('relatorio_html')) {
      col.fields.add(new EditorField({ name: 'relatorio_html' }))
    }
    if (!col.fields.getByName('descricao_original')) {
      col.fields.add(new TextField({ name: 'descricao_original' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('servicos')
    if (col.fields.getByName('relatorio_html')) col.fields.removeByName('relatorio_html')
    if (col.fields.getByName('descricao_original')) col.fields.removeByName('descricao_original')
    app.save(col)
  },
)
