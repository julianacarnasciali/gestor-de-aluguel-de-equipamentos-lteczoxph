// TEMPORÁRIO (30/10) — popula chamados de demonstração com datas
// retroativas para validar o Relatório de Tempos com números.
// Só roda com o token do Maestro. SERÁ REMOVIDO e os dados APAGADOS
// logo depois do teste (rota /backend/v1/manutencao/seed-tempos com
// { limpar: true } apaga tudo que ela criou).
routerAdd('POST', '/backend/v1/manutencao/seed-tempos', (e) => {
  const tok = String(e.request.header.get('x-maestro-token') || '')
  const esperado = $secrets.get('MAESTRO_TOKEN')
  if (!esperado || tok !== esperado) return e.unauthorizedError('token')

  const info = e.requestInfo()
  const body = (info && info.body) || {}

  // limpeza: apaga todos os chamados marcados como demonstração
  if (body.limpar) {
    let apagados = 0
    try {
      const demos = $app.findRecordsByFilter('chamados', "contato = 'DEMO TEMPOS'", '', 0, 0)
      for (const r of demos) {
        $app.delete(r)
        apagados++
      }
    } catch (err) {
      console.warn('[seed] erro ao limpar', err)
    }
    return e.json(200, { ok: true, apagados })
  }

  const equip = [
    'q00000000000022',
    'q00000000000024',
    'q00000000000025',
    'q00000000000023',
    'q00000000000019',
  ]
  // [dias atrás, min até iniciar, min de execução, prioridade, técnico]
  const casos = [
    [12, 25, 40, 'urgente', 'Luiz'],
    [12, 95, 55, 'media', 'Luiz'],
    [9, 15, 30, 'urgente', 'Luiz'],
    [9, 240, 90, 'media', 'Juliana'],
    [7, 50, 35, 'alta', 'Luiz'],
    [7, 310, 120, 'baixa', 'Juliana'],
    [5, 18, 25, 'urgente', 'Luiz'],
    [5, 130, 65, 'media', 'Luiz'],
    [3, 40, 45, 'alta', 'Juliana'],
    [3, 180, 75, 'media', 'Luiz'],
    [1, 12, 20, 'urgente', 'Luiz'],
    [1, 80, 50, 'media', 'Juliana'],
  ]
  const slaDe = { urgente: 4, alta: 8, media: 24, baixa: 48 }
  const iso = (d) => d.toISOString().replace('T', ' ').replace('Z', 'Z')
  const criados = []
  const agora = Date.now()

  for (let i = 0; i < casos.length; i++) {
    const [dias, minResp, minExec, prio, tec] = casos[i]
    const eqId = equip[i % equip.length]
    let eq = null
    try {
      eq = $app.findRecordById('equipamentos', eqId)
    } catch (_) {
      continue
    }
    const abertura = agora - dias * 86400000 - i * 37 * 60000
    const inicio = abertura + minResp * 60000
    const fim = inicio + minExec * 60000
    const sla = slaDe[prio]

    const rec = new Record($app.findCollectionByNameOrId('chamados'))
    rec.set('equipamento', eqId)
    rec.set('empresa', String(eq.getString('empresa') || ''))
    rec.set('patrimonio', String(eq.getString('patrimonio') || ''))
    rec.set('setor', String(eq.getString('setor') || ''))
    rec.set('contato', 'DEMO TEMPOS')
    rec.set('descricao', 'Demonstração para validar o relatório de tempos (apagar)')
    rec.set('prioridade', prio)
    rec.set('status', 'resolvido')
    rec.set('sla_horas', sla)
    rec.set('prazo_em', iso(new Date(abertura + sla * 3600000)))
    rec.set('iniciado_em', iso(new Date(inicio)))
    rec.set('resolvido_em', iso(new Date(fim)))
    rec.set('iniciado_por', tec)
    rec.set('resolvido_por', tec)
    rec.set('tempo_estimado', false)
    $app.save(rec)

    // `created` é campo autodate: o PocketBase IGNORA o valor no save e grava
    // a hora atual (descoberto no teste 30/10 — os tempos davam 0min).
    // Para o dado de demonstração ficar coerente, força via SQL.
    try {
      const db = $app.db()
      db.newQuery('UPDATE chamados SET created = {:c} WHERE id = {:id}')
        .bind({ c: iso(new Date(abertura)), id: rec.id })
        .execute()
    } catch (errC) {
      console.warn('[seed] nao consegui ajustar created', errC)
    }
    criados.push(rec.id)
  }

  console.log('[seed] chamados de demonstração criados:', criados.length)
  return e.json(200, { ok: true, criados: criados.length })
})
