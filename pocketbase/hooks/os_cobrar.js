// Gera COBRANÇA da OS: cria registro em 'servicos' → o hook servico_avulso.js
// existente faz o resto (boleto + Pix + NFS-e se a empresa emite). Pedido dela
// 22/10: OS às vezes cobra, às vezes é só registro — o flag gerar_cobranca
// decide. Rota: POST /backend/v1/os/cobrar (autenticada).
// Body: { os_id } — idempotente: se cobranca_gerada já é true, não refaz.
routerAdd('POST', '/backend/v1/os/cobrar', (e) => {
  if (!e.auth) return e.unauthorizedError('login necessario')
  const body = e.requestInfo().body || {}
  const osId = String(body.os_id || '')
  if (!osId) return e.badRequestError('os_id is required')

  try {
    const os = $app.findRecordById('ordens_servico', osId)
    if (os.getBool('cobranca_gerada')) {
      return e.json(200, { ok: true, ja_gerada: true, servico_id: os.getString('servico_id') })
    }
    const total = Number(os.getFloat('valor_total') || 0)
    if (total <= 0) return e.badRequestError('OS sem valor — nada a cobrar')

    const col = $app.findCollectionByNameOrId('servicos')
    const serv = new Record(col)
    serv.set('empresa', os.getString('empresa'))
    serv.set(
      'descricao',
      'OS ' +
        (os.getString('numero') || os.id) +
        ' — ' +
        String(os.getString('descricao') || '').slice(0, 380),
    )
    serv.set('valor', total)
    serv.set('data_servico', String(os.getString('data') || '').slice(0, 10))
    serv.set(
      'data_vencimento',
      String(os.getString('data_vencimento') || new Date().toISOString().slice(0, 10)),
    )
    serv.set('status', 'emitido')
    serv.set(
      'emite_nf',
      (function () {
        try {
          return $app.findRecordById('empresas', os.getString('empresa')).getBool('emite_nf')
        } catch (_) {
          return false
        }
      })(),
    )
    $app.save(serv)

    os.set('cobranca_gerada', true)
    os.set('servico_id', serv.id)
    os.set('status', 'faturada')
    $app.save(os)

    console.log('[os/cobrar] servico criado', serv.id, 'p/ OS', osId)
    return e.json(200, { ok: true, servico_id: serv.id })
  } catch (err) {
    console.warn('[os/cobrar] erro', err)
    return e.json(500, { error: String(err) })
  }
})
