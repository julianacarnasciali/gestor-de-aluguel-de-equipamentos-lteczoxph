// Hook: envia o e-mail do fechamento ao cliente (cópia p/ Juliana+Luiz).
//
// HISTÓRICO
//  - Antes de 04/11/2026 o e-mail levava SÓ o link do boleto: o PDF do relatório
//    nunca era anexado (o gerador vivia apenas no navegador). O cliente recebia
//    a cobrança sem saber o que estava pagando — foi a reclamação da Jandira
//    Reserva, que abriu o e-mail em 28/10 e não achou o relatório.
//
// REGRA NOVA (04/11, pedido da Juliana): "Nenhum fechamento pode sair sem
// relatório. Alguns não vão dar nota, mas relatório é obrigatório. Cada vez que
// gerar um boleto, tem que gerar o relatório."
//   → este hook SEMPRE anexa o PDF. Se o PDF não puder ser gerado, o e-mail
//     NÃO sai (melhor não mandar do que mandar sem relatório).
//
// TRÊS ARMADILHAS QUE JÁ MORDERAM (04/11) — leia antes de mexer:
//  1. LAÇO INFINITO. Este hook roda em `onRecordAfterUpdateSuccess`: qualquer
//     `$app.save(rec)` aqui dentro dispara o hook OUTRA VEZ. Salvar quando o
//     envio FALHA (status ainda "emitido") gera tentativa → falha → salva →
//     tentativa... Na 1ª versão isso mandou 48 e-mails de teste em 14s. Por
//     isso, ao falhar, aqui só se escreve no log: NADA é salvo.
//     A única gravação permitida é a de SUCESSO (status = "enviado"), que na
//     volta seguinte cai no primeiro `if` e encerra.
//  2. HOST ERRADO. A rota do relatório tem de ser chamada no host INTERNO
//     `.shrd00.internal.goskip.dev`. Pelo host público / APP_URL a resposta é
//     200 com o HTML do frontend ("<!DOCTYPE html> template for the frontend
//     react app") — o `statusCode` engana e o anexo vem vazio.
//  3. GRAVAR O PDF AQUI. Chamar a rota com `salvar=1` faz a rota gravar o
//     fechamento, o que dispara este hook de novo. O e-mail pede o PDF SEM
//     salvar (formato=json); quem grava é cobranca_processar.js, antes de
//     virar "gerada".
onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    const status = rec.getString('status')
    // já enviado antes? não reenvia (checa ANTES de aceitar 'enviado')
    if (status === 'enviado') {
      e.next()
      return
    }
    if (status !== 'emitido') {
      e.next()
      return
    }

    // JANELA DE SEGURANÇA (02/11): só envia depois que a cobrança foi GERADA
    // pela fila. Antes disso o boleto/NF podem nem existir, e um status mexido
    // por engano (foi o caso da MID HOME) mandaria e-mail ao cliente.
    //
    // COMPATIBILIDADE COM O PASSADO: os fechamentos criados ANTES de 02/11 não
    // têm cobranca_status (campo da migração 0049) — com a checagem rígida eles
    // nunca mais conseguiriam enviar e-mail ("funcionava em outubro e parou").
    // Aceita vazio SÓ quando já existe boleto no registro.
    const cobStatus = String(rec.getString('cobranca_status') || '')
    const temBoleto = String(rec.getString('asaas_payment_id') || '') !== ''
    const podeEnviar = cobStatus === 'gerada' || (cobStatus === '' && temBoleto)
    if (!podeEnviar) {
      e.next()
      return
    }
    // ---------- TRAVA ÚNICA (08/11/2026) ----------
    // A regra "boleto + nota juntos" saiu daqui e virou a rota
    // /backend/v1/email/pode-enviar (hook email_gate.js), para valer também no
    // serviço avulso e em qualquer tipo de cobrança novo — o e-mail do
    // SA 2026/0003 saiu sem nota justamente porque a regra existia só neste
    // arquivo. Aqui fica só a chamada; a lógica é uma só.
    //
    // FAIL-CLOSED: sem resposta da trava, NÃO envia.
    let liberado = false
    const motivosTrava = []
    try {
      const rGate = $http.send({
        url:
          'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev' +
          '/backend/v1/email/pode-enviar?colecao=fechamentos&id=' +
          encodeURIComponent(rec.id) +
          '&t=' +
          encodeURIComponent($secrets.get('MAESTRO_TOKEN') || ''),
        method: 'GET',
        timeout: 30,
      })
      if (rGate.statusCode === 200 && rGate.json && rGate.json.ok === true) {
        liberado = true
      } else if (rGate.json && rGate.json.motivos) {
        const lista = rGate.json.motivos
        for (let i = 0; i < lista.length; i++) motivosTrava.push(String(lista[i]))
      } else {
        motivosTrava.push('trava de e-mail nao respondeu (' + rGate.statusCode + ')')
      }
    } catch (errGate) {
      motivosTrava.push('trava de e-mail indisponivel: ' + String(errGate))
    }
    if (!liberado) {
      // NÃO SALVA (salvar aqui = laço). Só loga: o registro continua "emitido"
      // e ela pode reenviar depois, quando a nota estiver pronta.
      console.warn(
        '[email-fechamento] BLOQUEADO pela trava',
        rec.id,
        rec.getString('competencia'),
        '| motivos:',
        motivosTrava.join(' · '),
      )
      e.next()
      return
    }

    const apiKey = $secrets.get('BREVO_API_KEY')
    const senderEmail = $secrets.get('BREVO_SENDER_EMAIL') || 'julianacrc@icloud.com'
    const senderName = $secrets.get('BREVO_SENDER_NAME') || 'LCCA Tecnologia'
    const copias = String($secrets.get('BREVO_COPIA_EMAILS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!apiKey) {
      console.warn('[email-fechamento] sem BREVO_API_KEY')
      e.next()
      return
    }

    // destinatários: contatos da empresa (JSON contatos + responsavel_email)
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', rec.getString('empresa'))
    } catch (_) {}
    if (!empresa) {
      e.next()
      return
    }
    const dests = []
    const vistos = new Set()
    const addDest = (email, nome) => {
      const mail = String(email || '')
        .trim()
        .toLowerCase()
      if (!mail || !mail.includes('@') || vistos.has(mail)) return
      vistos.add(mail)
      dests.push({ email: mail, name: String(nome || empresa.getString('nome') || '') })
    }
    try {
      const contatos = JSON.parse(empresa.getString('contatos') || '[]')
      for (const c of contatos) addDest(c.email, c.nome)
    } catch (_) {}
    addDest(empresa.getString('responsavel_email'), empresa.getString('responsavel_nome'))
    addDest(empresa.getString('email'), empresa.getString('nome'))
    if (dests.length === 0) {
      console.warn('[email-fechamento] sem destinatarios p/ empresa', empresa.getString('nome'))
      e.next()
      return
    }

    const competencia = rec.getString('competencia')
    // JSVM (goja) não suporta toLocaleString com opções — formata na mão
    const valor = Number(rec.getFloat('valor_final') || rec.getFloat('total') || 0)
    const inteiro = Math.floor(valor)
    const centavos = Math.round((valor - inteiro) * 100)
    const milhar = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const brl = 'R$ ' + milhar + ',' + String(centavos).padStart(2, '0')
    const venc = String(rec.getString('data_vencimento') || '')
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/')
    const boletoUrl = String(rec.getString('asaas_boleto_url') || '')
    const nfUrl = String(rec.getString('asaas_invoice_url') || '')

    // ---------- RELATÓRIO (obrigatório desde 04/11) ----------
    // HOST INTERNO fixo: pelo host público a resposta é 200 com o HTML do
    // frontend. NÃO usa salvar=1 (gravaria o fechamento e reentraria no hook).
    const token = $secrets.get('MAESTRO_TOKEN') || ''
    const appUrl = 'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev'
    let anexo = null
    try {
      const rRel = $http.send({
        url:
          appUrl +
          '/backend/v1/fechamento/relatorio?id=' +
          encodeURIComponent(rec.id) +
          '&formato=json',
        method: 'GET',
        headers: { 'x-maestro-token': token },
        timeout: 60,
      })
      const parecePdf =
        rRel.json && typeof rRel.json.base64 === 'string' && rRel.json.base64.length > 1000
      if (rRel.statusCode === 200 && parecePdf) {
        anexo = {
          name: String(rRel.json.nome || 'relatorio.pdf'),
          content: String(rRel.json.base64),
        }
      } else {
        console.warn(
          '[email-fechamento] relatorio indisponivel',
          rRel.statusCode,
          'json?',
          !!rRel.json,
          'base64?',
          rRel.json ? String(rRel.json.base64 || '').length : 0,
        )
      }
    } catch (err) {
      console.warn('[email-fechamento] erro ao pedir relatorio', err)
    }

    // SEM RELATÓRIO NÃO ENVIA. E NÃO SALVA (salvar aqui = laço): só loga. O
    // registro continua "emitido" e ela pode reenviar depois pela tela.
    if (!anexo) {
      console.warn('[email-fechamento] BLOQUEADO sem relatorio', rec.id, competencia)
      e.next()
      return
    }

    const assunto = `Fechamento ${competencia} — ${empresa.getString('nome')} (${brl})`
    let corpo =
      '<p>Olá,</p>' +
      `<p>Segue o fechamento da competência <strong>${competencia}</strong> de locação e serviços de TI.</p>` +
      `<p><strong>Valor: ${brl}</strong> · Vencimento: <strong>${venc}</strong></p>`
    if (boletoUrl) {
      corpo += `<p><a href="${boletoUrl}" style="background:#0d9488;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">📄 Visualizar boleto</a></p>`
    }
    if (nfUrl) {
      corpo += `<p><a href="${nfUrl}">🧾 Nota fiscal de serviço (PDF)</a></p>`
    }
    // deixa explícito que o relatório está no anexo — foi a dúvida do cliente.
    // MODO CONTRATO (05/11): nesse tipo de cobrança não existe leitura nem
    // páginas, então o texto não pode falar delas (pedido da Juliana).
    const modoContrato = rec.getBool('cobranca_contrato') === true
    corpo += modoContrato
      ? '<p>O <strong>relatório</strong> com o valor mensal do contrato está ' +
        '<strong>anexado</strong> a este e-mail.</p>'
      : '<p>O <strong>relatório completo</strong> (máquinas, leituras e páginas do mês) está ' +
        '<strong>anexado</strong> a este e-mail.</p>'
    corpo +=
      '<p style="color:#64748b;font-size:12px">Qualquer dúvida, responda este e-mail ou fale conosco.</p>' +
      '<div style="margin-top:20px;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="background:#0F2A43;color:#ffffff;padding:14px 16px;border-radius:8px 8px 0 0">' +
      '<img src="https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/ib0smsxri8sw6q2/full_branco_y8024354gz.png" alt="LCCA Tech" width="150" style="display:block;border:0" />' +
      '</div>' +
      '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#f8fafc;padding:12px 16px">' +
      '<div style="font-size:13px;font-weight:bold;color:#0F2A43">Luiz Carlos Carnasciali</div>' +
      '<div style="font-size:12px;color:#64748b">Proprietário &amp; Técnico Responsável</div>' +
      '<div style="font-size:12px;color:#0D9488;margin-top:4px"><strong>📱 (41) 98406-4557</strong> · WhatsApp</div>' +
      '</div>' +
      '</div>'

    const payload = {
      sender: { email: senderEmail, name: senderName },
      to: dests,
      subject: assunto,
      htmlContent: corpo,
      attachment: [anexo],
    }
    if (copias.length > 0) payload.bcc = copias.map((m) => ({ email: m }))

    const r = $http.send({
      url: 'https://api.brevo.com/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (r.statusCode === 200 || r.statusCode === 201) {
      // ÚNICA gravação permitida: na volta seguinte o primeiro `if` encerra.
      rec.set('status', 'enviado')
      $app.save(rec)
      console.log(
        '[email-fechamento] enviado c/ relatorio p/',
        empresa.getString('nome'),
        '| anexo:',
        anexo.name,
        '| messageId:',
        r.json.messageId,
      )
    } else {
      console.warn(
        '[email-fechamento] Brevo recusou',
        r.statusCode,
        JSON.stringify(r.json || {}).slice(0, 250),
      )
    }
  } catch (err) {
    console.warn('[email-fechamento] erro geral', err)
  }
  e.next()
}, 'fechamentos')
