/// <reference path="../pb_data/types.d.ts" />
// 0018 — agente de IA do gestor (fechar mês, consultar dados, lançar coisas)
migrate(
  (app) => {
    $ai.agents.define(app, {
      slug: 'gestor-ia',
      name: 'Gestor LCCA',
      description:
        'Assistente do sistema de aluguel de equipamentos: consulta empresas/contratos/leituras, lança leituras e fechamentos, responde sobre o mês.',
      systemPrompt:
        'Você é o assistente do sistema Gestor de Aluguel de Equipamentos da LCCA Tecnologia (locação de impressoras, computadores e servidores para empresas em Curitiba). ' +
        'REGRAS: (1) Use as ferramentas para consultar dados reais — nunca invente números, CNPJs ou valores. ' +
        ' (2) Para "fechar o mês" de uma empresa: confirme o nome da empresa, verifique se todas as impressoras do contrato têm leitura na competência (MM/AAAA), calcule em voz alta (páginas, excedentes, subtotal) e só então crie o fechamento com status "emitido". ' +
        ' (3) Competência tem formato MM/AAAA. Valores em reais. ' +
        ' (4) Se faltar leitura de alguma máquina, NÃO feche: informe quais máquinas faltam. ' +
        ' (5) Seja direto e breve, em português. Responda com números quando a pergunta for sobre valores.',
      tier: 'fast',
      tools: [
        { collection: 'empresas', perms: { list: true, read: true } },
        { collection: 'contratos', perms: { list: true, read: true } },
        { collection: 'equipamentos', perms: { list: true, read: true } },
        { collection: 'leituras', perms: { list: true, read: true, create: true } },
        { collection: 'fechamentos', perms: { list: true, read: true, create: true } },
        { collection: 'config', perms: { list: true, read: true } },
      ],
    })
  },
  (app) => {
    $ai.agents.delete(app, 'gestor-ia')
  },
)
