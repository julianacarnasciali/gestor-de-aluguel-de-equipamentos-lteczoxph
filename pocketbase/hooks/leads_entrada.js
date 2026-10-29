// Hook: captura de leads da landing page pública (/lcca).
// POST /backend/v1/leads — rota PÚBLICA (visitante não tem login).
// Fluxo: valida -> grava na coleção "leads" -> e-mail de notificação
// para Juliana+Luiz via Brevo (mesma assinatura dos e-mails do sistema).
// Kommo: coleção tem flag kommo_enviado — quando as credenciais da API
// chegarem, o envio ao CRM é ligado aqui (Kommo = destino, nunca fonte).
// NOTA JSVM: toda a lógica INLINE no callback.
routerAdd('POST', '/backend/v1/leads', (e) => {
  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {
    return e.badRequestError('corpo invalido')
  }
  const nome = String((body && body.nome) || '').trim()
  const empresaTxt = String((body && body.empresa) || '').trim()
  const whatsapp = String((body && body.whatsapp) || '').trim()
  const email = String((body && body.email) || '').trim()
  const interesse = String((body && body.interesse) || '').trim()
  const mensagem = String((body && body.mensagem) || '')
    .trim()
    .slice(0, 1000)
  const origem = String((body && body.origem) || 'landing-page')
    .trim()
    .slice(0, 60)

  if (!nome || !empresaTxt || !whatsapp) {
    return e.badRequestError('Preencha nome, empresa e WhatsApp.')
  }
  if (email && !email.includes('@')) {
    return e.badRequestError('E-mail inválido.')
  }

  // interesse: aceita o texto do select da página e guarda normalizado
  const mapa = [
    ['impressora', 'impressoras'],
    ['computador', 'computadores'],
    ['servidor', 'servidores'],
    ['infra', 'infra_completa'],
    ['cupom', 'software_cupom'],
    ['software', 'software_cupom'],
    ['churrascaria', 'food'],
    ['assados', 'food'],
    ['espetinho', 'food'],
    ['food truck', 'food'],
    ['locacao', 'locacao'],
    ['locação', 'locacao'],
    ['advogad', 'juridico'],
    ['juridic', 'juridico'],
    ['jurídic', 'juridico'],
    ['processo', 'juridico'],
    ['nao sei', 'nao_sei'],
  ]
  let interesseNorm = ''
  const inteiroLower = interesse.toLowerCase()
  for (const [chave, valor] of mapa) {
    if (inteiroLower.indexOf(chave) !== -1) {
      interesseNorm = valor
      break
    }
  }
  if (!interesseNorm) interesseNorm = 'nao_sei'

  // grava o lead
  const col = $app.findCollectionByNameOrId('leads')
  const rec = new Record(col)
  rec.set('nome', nome.slice(0, 120))
  rec.set('empresa', empresaTxt.slice(0, 120))
  rec.set('whatsapp', whatsapp.slice(0, 30))
  rec.set('email', email.slice(0, 160))
  rec.set('interesse', interesseNorm)
  rec.set('mensagem', mensagem)
  rec.set('origem', origem)
  rec.set('email_notificado', false)
  rec.set('kommo_enviado', false)
  $app.save(rec)
  console.log('[leads] lead gravado', rec.id, '|', nome, '|', empresaTxt)

  // e-mail de notificação (não falha a resposta se a Brevo cair)
  try {
    const apiKey = $secrets.get('BREVO_API_KEY')
    const senderEmail = $secrets.get('BREVO_SENDER_EMAIL') || 'financeiro@lccatech.com'
    const senderName = $secrets.get('BREVO_SENDER_NAME') || 'LCCA Tech — Site'
    const copias = String($secrets.get('BREVO_COPIA_EMAILS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (apiKey) {
      const rotulos = {
        impressoras: 'Impressoras / multifuncionais',
        computadores: 'Computadores e monitores',
        servidores: 'Servidores',
        infra_completa: 'Infraestrutura completa',
        software_cupom: 'Software + impressora de cupom',
        food: 'Sistema para churrascaria / assados (nicho food)',
        locacao: 'Gestor de locação de impressoras',
        juridico: 'Software para advogados',
        nao_sei: 'Ainda não sei — quer conversar',
      }
      const interesseTxt = rotulos[interesseNorm] || interesse
      const assunto = '🚀 Lead do site — ' + empresaTxt + ' (' + nome + ')'
      let corpo =
        '<p><strong>Novo lead da landing page LCCA Tech</strong></p>' +
        '<table style="border-collapse:collapse;margin-top:12px">' +
        '<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px">Nome</td><td style="font-size:14px"><strong>' +
        nome +
        '</strong></td></tr>' +
        '<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px">Empresa</td><td style="font-size:14px">' +
        empresaTxt +
        '</td></tr>' +
        '<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px">WhatsApp</td><td style="font-size:14px"><strong>' +
        whatsapp +
        '</strong></td></tr>'
      if (email) {
        corpo +=
          '<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px">E-mail</td><td style="font-size:14px">' +
          email +
          '</td></tr>'
      }
      corpo +=
        '<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px">Interesse</td><td style="font-size:14px">' +
        interesseTxt +
        '</td></tr>'
      if (mensagem) {
        corpo +=
          '<tr><td style="padding:4px 14px 4px 0;color:#64748b;font-size:13px;vertical-align:top">Mensagem</td><td style="font-size:14px">' +
          mensagem +
          '</td></tr>'
      }
      corpo += '</table>'
      corpo +=
        '<div style="margin-top:20px;font-family:Arial,Helvetica,sans-serif">' +
        '<div style="background:#0F2A43;color:#ffffff;padding:10px 16px;border-radius:8px 8px 0 0">' +
        '<span style="font-size:15px;font-weight:bold;letter-spacing:2px">LCCA TECH</span>' +
        '<span style="font-size:11px;color:#9fb3c8"> &nbsp;·&nbsp; Locação e suporte de TI</span>' +
        '</div>' +
        '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#f8fafc;padding:12px 16px">' +
        '<div style="font-size:12px;color:#64748b">Lead capturado em ' +
        new Date().toISOString().slice(0, 10).split('-').reverse().join('/') +
        ' · origem: ' +
        origem +
        '</div>' +
        '</div></div>'

      const dests = [{ email: 'lcca.informatica@gmail.com', name: 'Luiz Carnasciali' }]
      const payload = {
        sender: { email: senderEmail, name: senderName },
        to: dests,
        subject: assunto,
        htmlContent: corpo,
      }
      if (copias.length > 0) payload.bcc = copias.map((m) => ({ email: m }))

      const r = $http.send({
        url: 'https://api.brevo.com/v3/smtp/email',
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (r.statusCode === 200 || r.statusCode === 201) {
        rec.set('email_notificado', true)
        $app.save(rec)
        console.log('[leads] notificação enviada | messageId:', r.json.messageId)
      } else {
        console.warn(
          '[leads] notificação falhou',
          r.statusCode,
          JSON.stringify(r.json).slice(0, 300),
        )
      }
    } else {
      console.warn('[leads] sem BREVO_API_KEY — lead gravado sem notificação')
    }
  } catch (err) {
    console.warn('[leads] erro na notificação', err)
  }

  return e.json(200, { ok: true, id: rec.id })
})
