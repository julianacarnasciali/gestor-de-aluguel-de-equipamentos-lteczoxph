// status_importacao — contagens das coleções (verificação da importação)
// + healthcheck das rotas /backend/v1 (diagnóstico 08/10)
routerAdd('GET', '/backend/v1/status-importacao', (e) => {
  const out = {}
  for (const n of ['empresas', 'contratos', 'equipamentos', 'leituras']) {
    try {
      const rows = $app.findRecordsByFilter(n, 'id != ""', '', 0, 0)
      out[n] = rows.length
    } catch (err) {
      out[n] = 'erro: ' + String(err)
    }
  }
  return e.json(200, out)
})

// Diagnóstico: quais rotas este pod conhece (o skip registra por arquivo;
// se um hook novo falhar ao carregar, ele NÃO aparece aqui)
routerAdd('GET', '/backend/v1/rotas', (e) => {
  return e.json(200, {
    rotas: ['status-importacao', 'webhooks/asaas', 'reemitir-nf?', 'manutencao/usuario?'],
    nota: 'rota de diagnóstico — se reemitir-nf responde 404 mas esta rota responde, o hook reemitir_nf.js não carregou',
  })
})
