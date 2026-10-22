// Hook: chamados técnicos via QR code do patrimônio (pedido 13/10).
// Rota PÚBLICA (o cliente escaneia a etiqueta e não tem login):
//   POST /backend/v1/chamado  { equipamento: "<id>", contato, descricao }
//   multipart aceito: campo "video" (mp4/mov/webm, máx 50MB) opcional.
// O equipamento traz empresa/setor/patrimônio — prioridade derivada do setor
// (produção/urgente > administrativo/média). E-mail p/ Luiz via Brevo.
// NOTA JSVM: lógica inline no callback; try/catch total — nunca derruba o POST.
routerAdd('POST', '/backend/v1/chamado', (e) => {
  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const eqId = String(body.equipamento || '')
  const contato = String(body.contato || '').slice(0, 120)
  const descricao = String(body.descricao || '').slice(0, 2000)

  if (!eqId || !descricao) {
    return e.badRequestError('equipamento e descricao obrigatorios')
  }

  let eq = null
  try {
    eq = $app.findRecordById('equipamentos', eqId)
  } catch (_) {}
  if (!eq) return e.badRequestError('equipamento nao encontrado')

  const empresaId = String(eq.getString('empresa') || '')
  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', empresaId)
  } catch (_) {}

  const patrimonio = String(eq.getString('patrimonio') || '')
  const setor = String(eq.getString('setor') || '')
  const nomeEmp = empresa ? empresa.getString('nome') : '—'
  const respEmail = empresa ? String(empresa.getString('responsavel_email') || '') : ''

  // prioridade por setor: produção/linha/etiqueta = urgente; demais = média
  const s = setor.toUpperCase()
  let prioridade = 'media'
  if (/(PRODUCAO|PRODUÇÃO|LINHA|ETIQUETA|PCP|DIGITAL|CORTE|ACABAMENTO|ESTOQUE|LOGIST)/.test(s)) {
    prioridade = 'urgente'
  } else if (/(RECEPCAO|RECEPÇÃO|REUNIAO|REUNIÃO|DIRETORIA)/.test(s)) {
    prioridade = 'alta'
  }

  // 1) cria o chamado (arquivo de vídeo via multipart form)
  const nova = new Record($app.findCollectionByNameOrId('chamados'))
  nova.set('equipamento', eqId)
  nova.set('empresa', empresaId)
  nova.set('patrimonio', patrimonio)
  nova.set('setor', setor)
  nova.set('contato', contato)
  nova.set('descricao', descricao)
  nova.set('prioridade', prioridade)
  nova.set('status', 'aberto')

  // video/foto precisam existir FORA do try (usados no e-mail depois —
  // lição 13/10 valia só p/ video; foto escapou e derrubava o e-mail c/
  // ReferenceError em TODO chamado — achado no teste E2E 22/10)
  let video = null
  let foto = null
  try {
    const files = (info && info.files) || {}
    video = files['video'] || null
    if (video) nova.set('video', video)
    foto = files['foto'] || null
    if (foto) nova.set('foto', foto)
  } catch (errF) {
    console.warn('[chamado] midia nao anexada', errF)
  }

  $app.save(nova)
  console.log(
    '[chamado] criado',
    nova.id,
    '|',
    nomeEmp,
    '|',
    patrimonio,
    '|',
    setor,
    '| prio:',
    prioridade,
  )

  // 2) e-mail p/ Luiz (Brevo) — não bloqueia a resposta em caso de erro
  try {
    const apiKey = $secrets.get('BREVO_API_KEY')
    const sender = $secrets.get('BREVO_SENDER_EMAIL') || 'financeiro@lccatech.com'
    const senderName = $secrets.get('BREVO_SENDER_NAME') || 'LCCA Tech'
    if (apiKey) {
      const esc = (t) =>
        String(t || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      const corVideo =
        video && foto
          ? '<p style="color:#0D9488">🎥 Vídeo + 📷 foto anexados — veja no painel (Chamados).</p>'
          : video
            ? '<p style="color:#0D9488">🎥 <b>Vídeo anexado</b> — veja no painel (Chamados).</p>'
            : foto
              ? '<p style="color:#0D9488">📷 <b>Foto anexada</b> — veja no painel (Chamados).</p>'
              : '<p style="color:#94a3b8">Sem foto/vídeo anexado.</p>'
      const html =
        '<div style="max-width:640px;font-family:Arial">' +
        '<div style="background:#0F2A43;padding:14px 20px;border-radius:8px 8px 0 0">' +
        '<div style="color:#fff;font-weight:bold;font-size:18px">🔧 NOVO CHAMADO TÉCNICO</div>' +
        '<div style="color:#94a3b8;font-size:12px">aberto via QR code do patrimônio</div></div>' +
        '<div style="border:1px solid #e2e8f0;border-top:none;padding:16px 20px;border-radius:0 0 8px 8px">' +
        '<table style="width:100%;font-size:14px;color:#0F2A43">' +
        '<tr><td style="padding:4px 0;color:#64748b;width:130px">Empresa</td><td><b>' +
        esc(nomeEmp) +
        '</b></td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748b">Patrimônio</td><td style="font-family:monospace;font-weight:bold;color:#0D9488">' +
        esc(patrimonio) +
        '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748b">Setor</td><td>' +
        esc(setor || '—') +
        '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748b">Prioridade</td><td><b style="color:' +
        (prioridade === 'urgente' ? '#dc2626' : '#0D9488') +
        '">' +
        prioridade.toUpperCase() +
        '</b> (derivada do setor)</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748b">Contato</td><td>' +
        esc(contato || '—') +
        '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748b">E-mail resp.</td><td>' +
        esc(respEmail || '—') +
        '</td></tr>' +
        '</table>' +
        '<div style="margin-top:12px;padding:10px 14px;background:#f1f5f9;border-radius:6px">' +
        '<div style="color:#64748b;font-size:12px;margin-bottom:4px">Defeito relatado:</div>' +
        '<div style="color:#0F2A43;font-size:14px">' +
        esc(descricao).replace(/\n/g, '<br>') +
        '</div></div>' +
        corVideo +
        '<p style="color:#94a3b8;font-size:11px">Painel do sistema → Chamados → atender/marcar resolvido.</p>' +
        '</div></div>'
      const dados = {
        sender: { name: senderName, email: sender },
        to: [{ email: 'lcca.informatica@gmail.com', name: 'Luiz Carlos' }],
        cc: [{ email: 'adm@lccatech.com' }],
        subject:
          '🔧 Chamado ' + prioridade.toUpperCase() + ' — ' + nomeEmp + ' (' + patrimonio + ')',
        htmlContent: html,
      }
      const r = $http.send({
        url: 'https://api.brevo.com/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(dados),
      })
      if (r.statusCode === 201) {
        nova.set('email_notificado', true)
        $app.save(nova)
        console.log('[chamado] email enviado p/ Luiz', nova.id)
      } else {
        console.warn(
          '[chamado] email falhou',
          r.statusCode,
          JSON.stringify(r.json || {}).slice(0, 200),
        )
      }
    }
  } catch (errE) {
    console.warn('[chamado] erro email', errE)
  }

  // 3) PUSH ntfy (pedido dela 22/10 "os dois": aviso além do e-mail) — banner
  // no celular de quem assina o tópico (Luiz + Juliana). Falha não bloqueia.
  try {
    const topico = $secrets.get('NTFY_CHAMADOS_TOPIC')
    if (topico) {
      const msgPush =
        '🔧 ' +
        prioridade.toUpperCase() +
        ' — ' +
        nomeEmp +
        '\nPatrimônio: ' +
        patrimonio +
        (setor ? ' · Setor: ' + setor : '') +
        '\n' +
        String(descricao || '').slice(0, 160)
      const rN = $http.send({
        url: 'https://ntfy.sh/' + topico,
        method: 'POST',
        headers: {
          Title: 'Chamado ' + prioridade.toUpperCase() + ' — ' + nomeEmp,
          Priority: prioridade === 'urgente' ? 'high' : 'default',
          Tags: 'rotating_light',
        },
        body: msgPush,
      })
      console.log('[chamado] ntfy push', rN.statusCode, nova.id)
    } else {
      console.warn('[chamado] sem NTFY_CHAMADOS_TOPIC — push não enviado')
    }
  } catch (errP) {
    console.warn('[chamado] erro ntfy', errP)
  }

  // 4) WHATSAPP — TextMeBot (preferido: sai do número próprio vinculado,
  // qualquer destinatário; demo grátis 2 dias, US$ 1/mês depois) com fallback
  // CallMeBot (grátis, só quem ativou o bot). Pedido dela 22/10: demo no
  // WhatsApp do Luiz. Segredos: TEXTMEBOT_APIKEY + TEXTMEBOT_PHONE (destino)
  // ou CALLMEBOT_PHONE + CALLMEBOT_APIKEY. Sem config, pula.
  try {
    const tmKey = $secrets.get('TEXTMEBOT_APIKEY')
    const tmDest = $secrets.get('TEXTMEBOT_PHONE')
    const waFone = $secrets.get('CALLMEBOT_PHONE')
    const waKey = $secrets.get('CALLMEBOT_APIKEY')
    const msgWa =
      '🔧 CHAMADO ' +
      prioridade.toUpperCase() +
      ' — ' +
      nomeEmp +
      '\nPatrimônio: ' +
      patrimonio +
      (setor ? '\nSetor: ' + setor : '') +
      '\nDefeito: ' +
      String(descricao || '').slice(0, 200)
    if (tmKey && tmDest) {
      const urlTm =
        'https://api.textmebot.com/send.php?recipient=' +
        encodeURIComponent(tmDest) +
        '&apikey=' +
        encodeURIComponent(tmKey) +
        '&text=' +
        encodeURIComponent(msgWa)
      const rT = $http.send({ url: urlTm, method: 'GET' })
      console.log('[chamado] whatsapp textmebot', rT.statusCode, nova.id)
    } else if (waFone && waKey) {
      const urlWa =
        'https://api.callmebot.com/whatsapp.php?phone=' +
        encodeURIComponent(waFone) +
        '&apikey=' +
        encodeURIComponent(waKey) +
        '&text=' +
        encodeURIComponent(msgWa)
      const rW = $http.send({ url: urlWa, method: 'GET' })
      console.log('[chamado] whatsapp callmebot', rW.statusCode, nova.id)
    } else {
      console.warn('[chamado] sem whatsapp configurado (TEXTMEBOT ou CALLMEBOT) — não enviado')
    }
  } catch (errW) {
    console.warn('[chamado] erro whatsapp', errW)
  }

  return e.json(200, { ok: true, id: nova.id, prioridade: prioridade })
})

// Info pública MÍNIMA do equipamento (só o que o cliente vê na etiqueta):
//   GET /backend/v1/chamado-info?eq=<id> -> { patrimonio, setor, empresa }
// O cadastro completo continua só logado (viewRule intacta).
routerAdd('GET', '/backend/v1/chamado-info', (e) => {
  const eqId = String(e.request.url.query().get('eq') || '')
  if (!eqId) return e.badRequestError('eq obrigatorio')
  let eq = null
  try {
    eq = $app.findRecordById('equipamentos', eqId)
  } catch (_) {}
  if (!eq) return e.badRequestError('equipamento nao encontrado')
  let nomeEmp = ''
  try {
    const emp = $app.findRecordById('empresas', String(eq.getString('empresa') || ''))
    if (emp) nomeEmp = emp.getString('nome')
  } catch (_) {}
  return e.json(200, {
    patrimonio: String(eq.getString('patrimonio') || ''),
    setor: String(eq.getString('setor') || ''),
    empresa: nomeEmp,
  })
})

// Leitura pelo celular (2ª frente, pedido 14/10): o QR da etiqueta leva à
// página /leitura?eq=<id> → digita o contador do visor → grava a leitura do
// mês direto no sistema (pronta para o fechamento). Foto do visor opcional.
//   POST /backend/v1/leitura  (multipart aceito: campo "arquivo" = foto do visor)
//   { equipamento, leitura_atual }
routerAdd('POST', '/backend/v1/leitura', (e) => {
  const info = e.requestInfo()
  const body = (info && info.body) || {}
  const eqId = String(body.equipamento || '')
  const atual = Number(body.leitura_atual)
  if (!eqId || !Number.isFinite(atual) || atual < 0) {
    return e.badRequestError('equipamento e leitura_atual obrigatorios')
  }
  let eq = null
  try {
    eq = $app.findRecordById('equipamentos', eqId)
  } catch (_) {}
  if (!eq) return e.badRequestError('equipamento nao encontrado')

  // competência atual em horário de Brasília (JSVM roda em UTC — menos 3h)
  const d = new Date(Date.now() - 3 * 3600 * 1000)
  const competencia = String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear()

  // última leitura lançada = leitura_anterior (de qualquer competência)
  // NOTA JSVM: findFirstRecordByFilter falhou silenciosamente (unicidade
  // violada) — findRecordsByFilter é a forma comprovada no projeto
  let ultima = null
  try {
    const ultimas = $app.findRecordsByFilter(
      'leituras',
      "equipamento = '" + eqId + "'",
      '-created',
      1,
      0,
    )
    if (ultimas.length > 0) ultima = ultimas[0]
  } catch (_) {}
  const anterior = ultima ? Number(ultima.getInt('leitura_atual')) || 0 : 0
  if (atual < anterior) {
    return e.badRequestError(
      'leitura ' + atual + ' menor que a anterior (' + anterior + ') — confira o visor',
    )
  }
  const paginas = atual - anterior

  // mesma competência = re-lançamento (atualiza); senão cria nova
  let rec = null
  if (ultima && ultima.getString('competencia') === competencia) {
    rec = ultima
  } else {
    rec = new Record($app.findCollectionByNameOrId('leituras'))
    rec.set('equipamento', eqId)
    rec.set('contrato', String(eq.getString('contrato') || ''))
    rec.set('competencia', competencia)
    rec.set('leitura_anterior', anterior)
    rec.set('origem', 'contador')
  }
  rec.set('leitura_atual', atual)
  rec.set('paginas_mes', paginas)

  try {
    const files = (info && info.files) || {}
    const foto = files['arquivo'] || null
    if (foto) rec.set('arquivo', foto)
  } catch (errF) {
    console.warn('[leitura] foto do visor nao anexada', errF)
  }

  $app.save(rec)
  console.log(
    '[leitura] registrada via celular:',
    String(eq.getString('patrimonio') || ''),
    competencia,
    anterior,
    '->',
    atual,
    '(' + paginas + ' págs)',
  )
  return e.json(200, {
    ok: true,
    id: rec.id,
    competencia: competencia,
    leitura_anterior: anterior,
    leitura_atual: atual,
    paginas_mes: paginas,
  })
})
