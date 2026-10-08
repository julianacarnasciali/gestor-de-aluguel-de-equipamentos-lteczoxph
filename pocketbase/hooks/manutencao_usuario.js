// Rota de MANUTENÇÃO: cria/sincroniza o usuário técnico "manutencao" (só o
// Maestro usa). Só aceita chamada com SUPERUSER (o painel Skip/chamadas
// internas da plataforma) — usuário comum não cria nem lista nada aqui.
routerAdd('POST', '/backend/v1/manutencao/usuario', (e) => {
  if (!e.hasSuperuserAuth()) {
    return e.unauthorizedError('somente superuser')
  }
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  const senha = String((body && body.senha) || '')
  if (senha.length < 8) return e.badRequestError('senha curta')

  const email = 'manutencao@lccatech.com'
  let rec = null
  try {
    rec = $app.findFirstRecordByFilter('users', "email = '" + email + "'")
  } catch (_) {}

  if (!rec) {
    const col = $app.findCollectionByNameOrId('users')
    rec = new Record(col)
    rec.set('email', email)
    rec.set('name', 'Manutenção (Maestro)')
    rec.set('perfil', 'tecnico_master')
    rec.set('ativo', true)
    rec.setPassword(senha)
    $app.save(rec)
    console.log('[manutencao] usuario criado')
  } else {
    rec.setPassword(senha)
    rec.set('ativo', true)
    $app.save(rec)
    console.log('[manutencao] senha sincronizada')
  }
  return e.json(200, { ok: true, email })
})
