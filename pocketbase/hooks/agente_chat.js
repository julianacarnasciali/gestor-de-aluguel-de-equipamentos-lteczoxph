// Rota de chat com o agente gestor-ia. Autenticada: usa e.auth.id como user_id.
routerAdd('POST', '/backend/v1/agente/chat', (e) => {
  if (!e.auth) return e.unauthorizedError('login necessario')
  const body = e.requestInfo().body || {}
  const msg = String(body.message || '').trim()
  if (!msg) return e.badRequestError('message is required')
  try {
    const result = $ai.agent('gestor-ia').chat({
      user_id: e.auth.id,
      conversation_id: body.conversation_id || null,
      message: msg,
    })
    return e.json(200, {
      reply: result.content,
      conversation_id: result.conversationId || body.conversation_id || null,
    })
  } catch (err) {
    console.warn('[agente] erro no chat', err)
    return e.json(500, { error: String(err) })
  }
})
