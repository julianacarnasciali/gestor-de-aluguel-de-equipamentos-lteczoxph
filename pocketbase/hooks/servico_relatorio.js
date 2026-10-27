// Rota: GET /backend/v1/servico/relatorio?id=<servico_id>
// Devolve o HTML do relatório arquivado do serviço (pedido dela 26/10:
// "uma vez emitido, não consegui visualizar" — histórico navegável 6+ meses).
// Autenticação: aceita (1) usuário logado do sistema OU (2) token de manutenção
// (x-maestro-token = secret MAESTRO_TOKEN) OU (3) ?t=<MAESTRO_TOKEN> (p/ link do e-mail).
// O link enviado ao cliente leva o token — sem ele, 401.
routerAdd('GET', '/backend/v1/servico/relatorio', (e) => {
  const id = String(e.request.url.query().get('id') || '')
  if (!id) return e.badRequestError('id is required')

  // autenticação: sessão OU token de manutenção (query ?t= ou header)
  const tokenQuery = String(e.request.url.query().get('t') || '')
  const tokenHeader = String(e.request.header('x-maestro-token') || '')
  let ok = false
  try {
    if (e.auth && e.auth.id) ok = true
  } catch (_) {}
  if (!ok) {
    const secret = $secrets.get('MAESTRO_TOKEN') || ''
    if (secret && (tokenQuery === secret || tokenHeader === secret)) ok = true
  }
  if (!ok) return e.unauthorizedError('acesso negado')

  let rec = null
  try {
    rec = $app.findRecordById('servicos', id)
  } catch (_) {
    return e.notFoundError('servico nao encontrado')
  }
  const html = String(rec.getString('relatorio_html') || '')
  if (!html) {
    return e.json(200, {
      html:
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório</title>' +
        '<style>body{font-family:Arial,sans-serif;background:#f1f5f9;padding:40px;text-align:center;color:#334155}' +
        '.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px}</style></head>' +
        '<body><div class="card"><h2 style="color:#0F2A43">Relatório ainda não arquivado</h2>' +
        '<p>Este serviço ainda não tem relatório arquivado (o arquivo é gerado quando o e-mail da cobrança é enviado).</p>' +
        '<p style="color:#64748b;font-size:13px">Se o serviço foi criado antes de 26/10/2026, o relatório não foi arquivado — o histórico começa nessa data.</p></div></body></html>',
    })
  }
  e.request.url.query().set('t', '') // não ecoa token
  return e.json(200, { html })
})
