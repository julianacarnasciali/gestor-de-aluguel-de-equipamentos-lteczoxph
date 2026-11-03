/// <reference path="../pb_data/types.d.ts" />
// 0050 — Contrato recorrente sem leitura de contador (pedido 03/11/2026)
//
// O problema que ela apontou:
// Contratos de cobrança recorrente (a empresa emite boleto e nota todo dia 1º,
// sem contador instalado) vinham recebendo uma LEITURA de 1.000 páginas todo mês
// — exatamente a franquia. Efeito: o histórico do contador sobe artificialmente
// e, no dia em que a máquina der manutenção, o contador real fica muito abaixo do
// registrado. Além disso o relatório mensal mostrava "1.000 impressões" de uma
// máquina que talvez nem tenha impresso.
//
// Como fica: o contrato recorrente tem tipo_cobranca = "media" e NÃO recebe
// leitura. A cobrança dele (mensalidade fixa + boleto + NF) vem da recorrência,
// não do contador. O relatório mensal não mostra linha de leitura para ele,
// porque não existe leitura para mostrar.
//
// Campo sem_leitura:
//   true  = não gera/aparece leitura de contador (recorrente fixo)
//   false = fluxo normal (leitura do mês entra no fechamento e no relatório)
//
// Colocado no CONTRATO (não no equipamento) porque a decisão é comercial:
// "este cliente não tem contador".
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('contratos')
    if (!col.fields.getByName('sem_leitura')) {
      col.fields.add(new BoolField({ name: 'sem_leitura', required: false, presentable: false }))
    }
    app.save(col)

    // marca os contratos recorrentes que hoje estão como "leitura":
    // recorrente = cobrança fixa automática, então não deveria pedir contador.
    // Exceção conhecida: nenhuma até agora — se algum recorrente tiver contador
    // de verdade, é só desmarcar sem_leitura na tela do contrato.
    try {
      const lista = app.findRecordsByFilter(
        'contratos',
        'recorrente = true && ativo = true',
        '',
        500,
        0,
      )
      for (const c of lista) {
        c.set('sem_leitura', true)
        // tipo "media" = cobrança pela média, sem leitura mensal
        if (c.getString('tipo_cobranca') === 'leitura') {
          c.set('tipo_cobranca', 'media')
        }
        app.save(c)
      }
    } catch (err) {
      console.warn('[0050] nao consegui marcar os contratos', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('contratos')
      const f = col.fields.getByName('sem_leitura')
      if (f) col.fields.removeById(f.id)
      app.save(col)
    } catch (_) {}
  },
)
