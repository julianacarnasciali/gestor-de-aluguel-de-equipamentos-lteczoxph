// Aviso mensal de REAJUSTE e VENCIMENTO de contratos (pedido dela 23/10).
// Todo dia 1º 06:15 — confere os contratos ativos e envia e-mail (Brevo) para
// Juliana + Luiz quando:
//  - o mês do aniversário do reajuste é o MÊS QUE VEM (a marca dos 11 meses:
//    hora de definir o % e avisar o cliente), ou
//  - o contrato vence (mes_fim) no mês que vem ou em 2 meses.
// Sem nada a avisar, não envia nada (sem spam).
// Formatos aceitos em reajuste_mes: 'MM' (novo, via tela) ou 'MM/AAAA' (legado
// do sistema antigo) — pega a parte do mês antes da '/'.
cronAdd('aviso_reajuste', '15 6 1 * *', () => {
  try {
    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = hoje.getMonth() + 1 // 1-based
    const nm = mes === 12 ? 1 : mes + 1
    const ny = mes === 12 ? ano + 1 : ano
    const nmPad = String(nm).padStart(2, '0')
    const nomes = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ]

    const numMes = (s) => {
      const p = String(s || '').split('/')
      return Number(p[1]) * 12 + Number(p[0])
    }
    const atualNum = ano * 12 + mes

    const contratos = $app.findRecordsByFilter('contratos', 'ativo = true', '', 0, 0)
    const reajustes = []
    const vencendo = []
    for (const k of contratos) {
      let emp = null
      try {
        emp = $app.findRecordById('empresas', k.getString('empresa'))
      } catch (_) {
        continue
      }
      if (!emp || !emp.getBool('ativo')) continue

      // mês do reajuste: campo reajuste_mes ('MM' ou 'MM/AAAA') ou, na falta,
      // o mês do início do contrato (aniversário)
      let mesReaj = String(k.getString('reajuste_mes') || '').split('/')[0]
      if (!mesReaj) mesReaj = String(k.getString('mes_ini') || '').split('/')[0] || ''
      if (/^\d{2}$/.test(mesReaj) && mesReaj === nmPad) {
        const pct = Number(k.getFloat('reajuste_percentual') || 0)
        reajustes.push(
          '- <b>' +
            emp.getString('nome') +
            '</b> — reajuste em ' +
            nomes[nm - 1] +
            '/' +
            ny +
            ' · % definido no sistema: ' +
            (pct > 0 ? pct + '%' : '<b style="color:#b45309">NENHUM — definir!</b>'),
        )
      }

      const fim = String(k.getString('mes_fim') || '')
      if (/^\d{2}\/\d{4}$/.test(fim)) {
        const diff = numMes(fim) - atualNum
        if (diff === 1)
          vencendo.push(
            '- <b>' + emp.getString('nome') + '</b> — vence em ' + fim + ' (mês que vem)',
          )
        else if (diff === 2)
          vencendo.push(
            '- <b>' + emp.getString('nome') + '</b> — vence em ' + fim + ' (em 2 meses)',
          )
      }
    }

    if (reajustes.length === 0 && vencendo.length === 0) {
      console.log('[aviso-reajuste] nada a avisar este mês')
      return
    }

    const apiKey = $secrets.get('BREVO_API_KEY')
    if (!apiKey) {
      console.warn('[aviso-reajuste] sem BREVO_API_KEY')
      return
    }
    const senderEmail = $secrets.get('BREVO_SENDER_EMAIL') || 'julianacrc@icloud.com'
    const senderName = $secrets.get('BREVO_SENDER_NAME') || 'LCCA Tech'
    const copias = String($secrets.get('BREVO_COPIA_EMAILS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (copias.length === 0) {
      console.warn('[aviso-reajuste] sem BREVO_COPIA_EMAILS')
      return
    }

    let corpo =
      '<p>Bom dia,</p>' +
      '<p>Checklist de contratos para o <strong>mês que vem (' +
      nomes[nm - 1] +
      '/' +
      ny +
      ')</strong>:</p>'
    if (reajustes.length) {
      corpo +=
        '<h3 style="margin-bottom:4px">📅 Reajustes (marca dos 11 meses — hora de definir o % e avisar o cliente)</h3><ul>' +
        reajustes.join('') +
        '</ul>'
    }
    if (vencendo.length) {
      corpo +=
        '<h3 style="margin-bottom:4px">📄 Contratos vencendo — hora de renovar</h3><ul>' +
        vencendo.join('') +
        '</ul>'
    }
    corpo +=
      '<p style="color:#64748b;font-size:12px">Aviso automático do gestor LCCA — gerado no dia 1º, olhando o mês seguinte. Defina o % e a vigência no cadastro da empresa (seção Vigência e reajuste).</p>'

    const payload = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: copias[0] }],
      subject: '📅 Contratos — reajustes e vencimentos de ' + nomes[nm - 1] + '/' + ny,
      htmlContent: corpo,
    }
    if (copias.length > 1) payload.bcc = copias.slice(1).map((m) => ({ email: m }))

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
      console.log('[aviso-reajuste] e-mail enviado | messageId:', r.json.messageId)
    } else {
      console.warn('[aviso-reajuste] falhou', r.statusCode, JSON.stringify(r.json).slice(0, 300))
    }
  } catch (err) {
    console.warn('[aviso-reajuste] erro geral', err)
  }
})
