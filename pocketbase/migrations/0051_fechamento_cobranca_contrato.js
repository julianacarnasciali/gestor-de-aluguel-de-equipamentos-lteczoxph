/// <reference path="../pb_data/types.d.ts" />
// 0051 — Cobrança mensal pelo VALOR DO CONTRATO (pedido 05/11/2026)
//
// Pedido dela: um botão na tela de Leituras que lance a cobrança do mês pelo
// valor do contrato, sem cobrar página excedente, e um relatório que mostre
// SOMENTE esse valor — sem número de leitura e sem páginas impressas.
//
// Por que um campo (e não deduzir pelos números): um fechamento normal também
// pode ter páginas 0 e excedente 0, e aí o relatório dele ficaria sem a tabela
// de máquinas por engano. O documento é diferente de natureza:
//   cobranca_contrato = false → relatório detalhado (máquinas, leituras, págs)
//   cobranca_contrato = true  → relatório só com o valor mensal do contrato
//
// O que NÃO muda: o fluxo de cobrança continua o mesmo (boleto/NF passam pelos
// hooks existentes, com a janela de segurança de 60 min).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fechamentos')
    if (!col.fields.getByName('cobranca_contrato')) {
      col.fields.add(
        new BoolField({ name: 'cobranca_contrato', required: false, presentable: false }),
      )
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fechamentos')
      const f = col.fields.getByName('cobranca_contrato')
      if (f) col.fields.removeById(f.id)
      app.save(col)
    } catch (_) {}
  },
)
