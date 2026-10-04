// status_importacao — contagens das coleções (verificação da importação)
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
