// NEUTRALIZADO (30/10) — este arquivo continha uma rota TEMPORÁRIA de
// demonstração usada para validar o Relatório de Tempos. Ela foi usada e os
// dados criados por ela foram apagados (contato = 'DEMO TEMPOS').
//
// O hook fica aqui apenas como registro EXAUSTO vazio: qualquer chamada
// responde 410 (Gone) e NÃO toca no banco. Nunca mais cria nem apaga nada.
//
// Por que ficou aqui em vez de ser apagado: apagar o arquivo fez o QA do
// Skip falhar com "file not found on pod" e o pod continuou servindo a versão
// antiga por vários minutos — o que é pior (rota capaz de apagar registros
// viva). Um arquivo inócuo é aplicado de forma limpa e substitui a versão
// antiga com certeza.
routerAdd('POST', '/backend/v1/manutencao/seed-tempos', (e) => {
  return e.json(410, {
    ok: false,
    erro: 'rota de demonstracao desativada em 30/10/2026',
  })
})
