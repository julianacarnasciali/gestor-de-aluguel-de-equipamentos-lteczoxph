// GERAÇÃO DE PROPOSTA COMERCIAL com revisão da IA (pedido dela 23/10).
// Rota: POST /backend/v1/proposta/gerar (autenticada). Esta rota também é a
// porta de entrada da AUTOMAÇÃO futura: um webhook de WhatsApp chamará aqui
// com origem:'whatsapp' e a mensagem crua do cliente em 'descricao' — a IA
// transforma em proposta. Body: { proposta_id?, empresa_id?, cliente_nome,
// cliente_doc?, cliente_email?, cliente_telefone?, tipo:
// 'locacao'|'venda'|'servico', titulo, descricao, itens:
// [{descricao,qtd,valor_unit}], validade_dias?, condicoes?, respostas? }
routerAdd('POST', '/backend/v1/proposta/gerar', (e) => {
  if (!e.auth) return e.unauthorizedError('login necessario')
  const body = e.requestInfo().body || {}
  const tipo = String(body.tipo || 'servico')
  if (!['locacao', 'venda', 'servico'].includes(tipo)) {
    return e.badRequestError('tipo invalido')
  }
  const descricao = String(body.descricao || '').trim()
  const titulo = String(body.titulo || '').trim()
  const clienteNome = String(body.cliente_nome || '').trim()
  if (!descricao || !titulo || !clienteNome) {
    return e.badRequestError('cliente_nome, titulo e descricao sao obrigatorios')
  }

  try {
    // ---- itens + total ----
    const itensIn = Array.isArray(body.itens) ? body.itens : []
    const itens = []
    let total = 0
    for (const it of itensIn) {
      const d = String((it && it.descricao) || '').trim()
      const q = Number((it && it.qtd) || 1) || 1
      const v = Number((it && it.valor_unit) || 0)
      if (!d && !v) continue
      const sub = q * v
      total += sub
      itens.push({ descricao: d, qtd: q, valor_unit: v, total: sub })
    }

    const rotuloTipo =
      tipo === 'locacao'
        ? 'locação de equipamentos'
        : tipo === 'venda'
          ? 'venda de produtos/equipamentos'
          : 'prestação de serviços'

    // ---- REVISÃO DA IA (ortografia + clareza + perguntas + texto final) ----
    const dadosIA = {
      tipo: rotuloTipo,
      titulo: titulo,
      rascunho_luiz: descricao,
      itens: itens,
    }
    const origemWhats = String(body.origem || '') === 'whatsapp'
    const prompt =
      'Você é redator comercial da LCCA Tech (empresa de TI de Curitiba: locação de impressoras, infraestrutura e serviços de TI). ' +
      (origemWhats
        ? 'A "descrição" abaixo é a mensagem CRUA que o cliente mandou no WhatsApp — interprete o que ele precisa e transforme em proposta. '
        : 'O técnico Luiz escreveu um rascunho de proposta comercial de ' + rotuloTipo + '. ') +
      'TAREFA: (1) corrija ortografia e gramática; (2) melhore clareza e tom profissional SEM inventar fatos, números, prazos ou promessas que não estejam no rascunho; ' +
      '(3) se faltar informação essencial para o cliente entender a oferta (o que exatamente será fornecido, quantidades, prazo de entrega, garantia, escopo), liste PERGUNTAS objetivas para o Luiz; ' +
      '(4) escreva o TEXTO FINAL da proposta: 1 a 2 parágrafos objetivos apresentando a oferta ao cliente (o que será fornecido, o que está incluso, diferencial da LCCA), pronto para ir ao cliente — sem valores (valores ficam na tabela de itens). ' +
      (String(body.respostas || '')
        ? 'Perguntas anteriores do sistema: "' +
          String(body.respostas) +
          '" — o Luiz já as tratou no rascunho atualizado; NÃO repita essas perguntas. '
        : '') +
      'Responda APENAS com JSON válido: {"ok": true|false, "perguntas": [{"campo":"...","pergunta":"..."}], "correcoes": [{"de":"...","para":"..."}], "sugestoes": ["..."], "texto_final": "..."}. ' +
      'ok=false apenas se o rascunho estiver incompreensível ou não descrever nenhuma oferta. Dados: ' +
      JSON.stringify(dadosIA)

    const respAI = $ai.chat({
      model: 'fast',
      messages: [{ role: 'user', content: prompt }],
    })
    let ia = { ok: true, perguntas: [], correcoes: [], sugestoes: [], texto_final: '' }
    const txtAI = String(
      (respAI.choices && respAI.choices[0] && respAI.choices[0].message.content) || '',
    ).trim()
    const m = txtAI.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        ia = JSON.parse(m[0])
      } catch (_) {
        ia = {
          ok: false,
          perguntas: [],
          correcoes: [],
          sugestoes: [],
          texto_final: '',
          erro: 'resposta da IA ilegível',
        }
      }
    } else {
      ia = {
        ok: false,
        perguntas: [],
        correcoes: [],
        sugestoes: [],
        texto_final: '',
        erro: 'IA não respondeu JSON',
      }
    }

    // ---- grava (create ou update quando proposta_id vem) ----
    const col = $app.findCollectionByNameOrId('propostas_comerciais')
    let rec = null
    if (body.proposta_id) {
      try {
        rec = $app.findRecordById('propostas_comerciais', String(body.proposta_id))
      } catch (_) {
        rec = null
      }
    }
    let numero = ''
    if (rec) {
      numero = rec.getString('numero')
    } else {
      const ano = new Date().getFullYear()
      const n = $app.countRecordsByFilter('propostas_comerciais', "id != ''") + 1
      numero = 'PROP-' + ano + '-' + String(n).padStart(3, '0')
    }

    const origem = ['manual', 'whatsapp', 'ia'].includes(String(body.origem || ''))
      ? String(body.origem)
      : 'manual'

    if (rec) {
      rec.set('empresa', String(body.empresa_id || ''))
      rec.set('cliente_nome', clienteNome)
      rec.set('cliente_doc', String(body.cliente_doc || ''))
      rec.set('cliente_email', String(body.cliente_email || ''))
      rec.set('cliente_telefone', String(body.cliente_telefone || ''))
      rec.set('tipo', tipo)
      rec.set('titulo', titulo)
      rec.set('descricao', descricao)
      rec.set('itens', itens)
      rec.set('valor_total', total)
      rec.set('validade_dias', Number(body.validade_dias || 15) || 15)
      rec.set('condicoes', String(body.condicoes || ''))
      rec.set('revisao_ia', {
        perguntas: ia.perguntas || [],
        correcoes: ia.correcoes || [],
        sugestoes: ia.sugestoes || [],
      })
      rec.set('origem', origem)
      if (ia.ok && ia.texto_final) rec.set('texto_final', String(ia.texto_final))
      $app.save(rec)
    } else {
      rec = new Record(col)
      rec.set('numero', numero)
      rec.set('empresa', String(body.empresa_id || ''))
      rec.set('cliente_nome', clienteNome)
      rec.set('cliente_doc', String(body.cliente_doc || ''))
      rec.set('cliente_email', String(body.cliente_email || ''))
      rec.set('cliente_telefone', String(body.cliente_telefone || ''))
      rec.set('tipo', tipo)
      rec.set('titulo', titulo)
      rec.set('descricao', descricao)
      rec.set('itens', itens)
      rec.set('valor_total', total)
      rec.set('validade_dias', Number(body.validade_dias || 15) || 15)
      rec.set('condicoes', String(body.condicoes || ''))
      rec.set('texto_final', ia.ok && ia.texto_final ? String(ia.texto_final) : '')
      rec.set('revisao_ia', {
        perguntas: ia.perguntas || [],
        correcoes: ia.correcoes || [],
        sugestoes: ia.sugestoes || [],
      })
      rec.set('status', 'rascunho')
      rec.set('origem', origem)
      $app.save(rec)
    }

    console.log(
      '[proposta/gerar]',
      numero,
      '| ok:',
      ia.ok !== false,
      '| perguntas:',
      (ia.perguntas || []).length,
    )
    return e.json(200, {
      ok: ia.ok !== false,
      id: rec.id,
      numero: numero,
      perguntas: ia.perguntas || [],
      correcoes: ia.correcoes || [],
      sugestoes: ia.sugestoes || [],
      texto_final: String(ia.texto_final || ''),
    })
  } catch (err) {
    console.warn('[proposta/gerar] erro', err)
    return e.json(500, { error: String(err) })
  }
})
