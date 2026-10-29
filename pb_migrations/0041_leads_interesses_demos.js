// 0041 — novos interesses de lead para o catálogo de demonstrações.
// O formulário de pedido de demonstração grava na mesma coleção `leads`,
// então o select precisa aceitar os nichos novos.
//
// Valores finais: impressoras | computadores | servidores | infra_completa |
//                 software_cupom | nao_sei | food |
//                 locacao | juridico | demonstracao
migrate((app) => {
  const leads = app.findCollectionByNameOrId('leads')
  const interesse = leads.fields.getByName('interesse')

  if (interesse) {
    interesse.values = [
      'impressoras',
      'computadores',
      'servidores',
      'infra_completa',
      'software_cupom',
      'nao_sei',
      'food',
      'locacao',
      'juridico',
      'demonstracao',
    ]
  }

  app.save(leads)
})
