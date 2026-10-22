// Geração de CONTRATO / TERMO ADITIVO com conferência do agente de IA.
// Pedido dela 22/10: campos preenchidos no cadastro da empresa → botão →
// agente confere (todos os campos preenchidos + ortografia) → gera o documento.
// Rota: POST /backend/v1/contrato/gerar (autenticada)
// Body: { empresa_id, tipo: 'contrato' | 'aditivo_renovacao' | 'aditivo_inclusao' | 'aditivo_exclusao', equipamentos?: [{patrimonio, marca, serie}], equip_removidos?: [{patrimonio, marca}], numero?: string }
routerAdd('POST', '/backend/v1/contrato/gerar', (e) => {
  if (!e.auth) return e.unauthorizedError('login necessario')
  const body = e.requestInfo().body || {}
  const empresaId = String(body.empresa_id || '')
  const tipo = String(body.tipo || 'contrato')
  if (!empresaId) return e.badRequestError('empresa_id is required')
  if (!['contrato', 'aditivo_renovacao', 'aditivo_inclusao', 'aditivo_exclusao'].includes(tipo))
    return e.badRequestError('tipo invalido')

  try {
    const emp = app.findRecordById('empresas', empresaId)

    // ---- 1. monta o dicionário de dados a partir da empresa + body ----
    const eqsBody = body.equipamentos || []
    const eqsRem = body.equip_removidos || []
    const dados = {
      tipo,
      numero: String(body.numero || ''),
      razao_locadora: 'LCCA INFORMATICA LTDA',
      cnpj_locadora: '07.667.971/0001-39',
      resp_locadora: 'Luiz Carnasciali',
      cargo_locadora: 'sócio-administrador',
      end_locadora: 'Curitiba/PR',
      email_locadora: 'contato@lccatech.com',
      nome_cli: emp.getString('nome'),
      cnpj_cli: emp.getString('cnpj_cpf'),
      end_cli: emp.getString('endereco'),
      end_instalacao: emp.getString('end_instalacao') || emp.getString('endereco'),
      resp_cli: emp.getString('responsavel_nome'),
      resp_cargo: emp.getString('resp_cargo'),
      email_cli: emp.getString('responsavel_email'),
      prazo_meses: emp.getString('prazo_meses'),
      valor_num: String(body.valor_num ?? ''),
      pag_contratadas: String(body.pag_contratadas ?? ''),
      valor_exc: String(body.valor_exc ?? ''),
      leitura: String(body.leitura ?? ''),
      dia_venc: String(body.dia_venc ?? ''),
      mes_reajuste: emp.getString('mes_reajuste'),
      indice: emp.getString('indice_reajuste'),
      sla_atendimento: emp.getString('sla_atendimento'),
      sla_resolucao: emp.getString('sla_resolucao'),
      clausula_consumiveis: emp.getString('clausula_consumiveis'),
      testemunha1: emp.getString('testemunha1'),
      testemunha2: emp.getString('testemunha2'),
      equipamentos: eqsBody,
      equip_removidos: eqsRem,
    }

    // ---- 2. CONFERÊNCIA DO AGENTE DE IA (campos preenchidos + ortografia) ----
    const promptConferencia =
      'Você é revisor jurídico-fiscal de contratos da LCCA Tech (locação de impressoras). ' +
      'Analise o JSON de dados do documento a seguir. Responda APENAS com um JSON válido, sem texto fora dele, no formato: ' +
      '{"ok": true|false, "problemas": [{"campo": "...", "problema": "...", "sugestao": "..."}], "correcoes_ortografia": [{"campo": "...", "de": "...", "para": "..."}]}. ' +
      'Cheque: (1) campos obrigatórios vazios ou com placeholder; (2) erros de ORTOGRAFIA em nomes, cargos e textos livres (sugira a correção); ' +
      '(3) CNPJ/CPF com formato plausível; (4) valores monetários e números plausíveis; (5) consistência (ex.: aditivo de inclusão exige equipamentos). ' +
      'Se tudo estiver certo, ok=true e arrays vazios. Dados: ' +
      JSON.stringify(dados)

    const respAI = $ai.chat({
      model: 'fast',
      messages: [{ role: 'user', content: promptConferencia }],
    })
    let conferencia = { ok: true, problemas: [], correcoes_ortografia: [] }
    let textoAI = String(
      (respAI.choices && respAI.choices[0] && respAI.choices[0].message.content) || '',
    ).trim()
    // extrai o JSON da resposta (tolerante a ```json ... ```)
    const m = textoAI.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        conferencia = JSON.parse(m[0])
      } catch (_) {
        conferencia = {
          ok: false,
          problemas: [
            {
              campo: 'geral',
              problema: 'Resposta da IA ilegível — tente novamente.',
              sugestao: '',
            },
          ],
          correcoes_ortografia: [],
        }
      }
    } else {
      conferencia = {
        ok: false,
        problemas: [
          {
            campo: 'geral',
            problema: 'A IA não respondeu com JSON — tente novamente.',
            sugestao: '',
          },
        ],
        correcoes_ortografia: [],
      }
    }

    // aplica correções de ortografia sugeridas pela IA
    for (const c of conferencia.correcoes_ortografia || []) {
      if (c && c.campo && c.de != null && c.para != null && typeof dados[c.campo] === 'string') {
        if (dados[c.campo].includes(c.de)) dados[c.campo] = dados[c.campo].split(c.de).join(c.para)
      }
    }

    // ---- 3. se a conferência falhou, NÃO gera: devolve os problemas ----
    if (!conferencia.ok || (conferencia.problemas && conferencia.problemas.length > 0)) {
      return e.json(200, { ok: false, conferencia, documento: null })
    }

    // ---- 4. GERAÇÃO do texto do documento ----
    const fmt = (v) => (v == null || String(v).trim() === '' ? '[PREENCHER]' : String(v))
    const eqsTxt = (dados.equipamentos || [])
      .map((q, i) => `| ${i + 1} | ${fmt(q.patrimonio)} | ${fmt(q.marca)} | ${fmt(q.serie)} |`)
      .join('\n')
    const eqsRemTxt = (dados.equip_removidos || [])
      .map((q, i) => `| ${i + 1} | ${fmt(q.patrimonio)} | ${fmt(q.marca)} |`)
      .join('\n')

    let titulo = 'CONTRATO DE LOCAÇÃO DE EQUIPAMENTOS DE IMPRESSÃO'
    let corpo = ''
    if (tipo === 'contrato') {
      corpo =
        `${titulo} Nº ${fmt(dados.numero)}\n\n` +
        `LOCADORA: ${fmt(dados.razao_locadora)}, inscrita no CNPJ sob o nº ${fmt(dados.cnpj_locadora)}, nome fantasia LCCA Tech, representada por ${fmt(dados.resp_locadora)}, ${fmt(dados.cargo_locadora)}, e-mail ${fmt(dados.email_locadora)}.\n\n` +
        `LOCATÁRIA: ${fmt(dados.nome_cli)}, inscrita no CNPJ sob o nº ${fmt(dados.cnpj_cli)}, sediada a ${fmt(dados.end_cli)}, representada por ${fmt(dados.resp_cli)}, ${fmt(dados.resp_cargo)}, e-mail ${fmt(dados.email_cli)}.\n\n` +
        `As partes têm, entre si, justo e contratado a locação dos equipamentos descritos no Anexo I, mediante as cláusulas seguintes.\n\n` +
        `CLÁUSULA 1ª — OBJETO: os equipamentos do Anexo I, instalados em ${fmt(dados.end_instalacao)}, permanecendo em posse direta da LOCATÁRIA.\n\n` +
        `CLÁUSULA 2ª — PRAZO: ${fmt(dados.prazo_meses)} meses contados da instalação; renovação automática por períodos de 12 meses; denúncia por escrito com 30 dias de antecedência.\n\n` +
        `CLÁUSULA 3ª — VALOR: aluguel mensal de ${fmt(dados.valor_num)}, incluindo franquia de ${fmt(dados.pag_contratadas)} páginas; excedente a ${fmt(dados.valor_exc)} por página; leitura no dia ${fmt(dados.leitura)}; vencimento dia ${fmt(dados.dia_venc)}; pagamento por boleto ou Pix, com NFS-e quando aplicável.\n\n` +
        `CLÁUSULA 4ª — REAJUSTE: anualmente em ${fmt(dados.mes_reajuste)}, pela variação acumulada do ${fmt(dados.indice)} nos 12 meses anteriores.\n\n` +
        `CLÁUSULA 5ª — MANUTENÇÃO: responsabilidade exclusiva da LOCADORA; atendimento em até ${fmt(dados.sla_atendimento)} e solução em até ${fmt(dados.sla_resolucao)}; equipamento substituto equivalente se não houver reparo; excluídos mau uso, intervenção de terceiros e sobretensão.\n\n` +
        `CLÁUSULA 6ª — CONSUMÍVEIS: ${fmt(dados.clausula_consumiveis)}; papel por conta da LOCATÁRIA.\n\n` +
        `CLÁUSULA 7ª — OBRIGAÇÕES DA LOCATÁRIA: uso correto, proibição de sublocação, manutenção no local de instalação, proibição de intervenção por terceiros, comunicação imediata de violações, acesso à LOCADORA para manutenção.\n\n` +
        `CLÁUSULA 8ª — PROPRIEDADE: equipamentos permanecem de propriedade exclusiva da LOCADORA, com identificação de patrimônio.\n\n` +
        `CLÁUSULA 9ª — LEITURA: a LOCATÁRIA fornece a leitura até o dia ${fmt(dados.leitura)} de cada mês; sem leitura, apuração pela média dos 3 últimos meses.\n\n` +
        `CLÁUSULA 10ª — PAGAMENTO E INADIMPLÊNCIA: multa de 2% e juros de 1% ao mês; suspensão da assistência após 15 dias; rescisão após 30 dias.\n\n` +
        `CLÁUSULA 11ª — RESCISÃO: infração com prazo de cura de 15 dias; rescisão antecipada sem justa causa indenizada com 1 mensalidade.\n\n` +
        `CLÁUSULA 12ª — DEVOLUÇÃO: em até 10 dias do encerramento, por Termo de Devolução; posse mantida = aluguel proporcional por dia.\n\n` +
        `CLÁUSULA 13ª — DADOS E LGPD: dados da LOCATÁRIA são dela; sigilo e LGPD (Lei 13.709/2018) observados.\n\n` +
        `CLÁUSULA 14ª — TRIBUTOS: NFS-e quando aplicável; repasse de novos tributos (incl. IBS/CBS) mediante comunicação prévia.\n\n` +
        `CLÁUSULA 15ª — FORO: Comarca de Curitiba/PR; 2 vias; testemunhas: ${fmt(dados.testemunha1)} e ${fmt(dados.testemunha2)}.\n\n` +
        `ANEXO I — EQUIPAMENTOS LOCADOS\n| # | Patrimônio | Marca/Modelo | Nº de série |\n${eqsTxt}\n\n` +
        `Curitiba, ____ de ____________ de 2026.\n\nLOCADORA: ______________________ (${fmt(dados.resp_locadora)})\nLOCATÁRIA: ______________________ (${fmt(dados.resp_cli)})\nTESTEMUNHAS: 1) ${fmt(dados.testemunha1)}  2) ${fmt(dados.testemunha2)}`
    } else if (tipo === 'aditivo_renovacao') {
      titulo = 'TERMO ADITIVO DE RENOVAÇÃO'
      corpo =
        `${titulo} — ao CONTRATO DE LOCAÇÃO Nº ${fmt(dados.numero)}\n\n` +
        `LOCADORA: ${fmt(dados.razao_locadora)} (CNPJ ${fmt(dados.cnpj_locadora)}).\nLOCATÁRIA: ${fmt(dados.nome_cli)} (CNPJ ${fmt(dados.cnpj_cli)}).\n\n` +
        `As partes RENOVAM o contrato pelo prazo de ${fmt(dados.prazo_meses)} meses, mantidas todas as demais cláusulas, incluindo aluguel de ${fmt(dados.valor_num)}, franquia de ${fmt(dados.pag_contratadas)} páginas e reajuste anual em ${fmt(dados.mes_reajuste)} pelo ${fmt(dados.indice)}.\n\n` +
        `Curitiba, ____ de ____________ de 2026.\n\nLOCADORA: ______________________\nLOCATÁRIA: ______________________\nTESTEMUNHAS: 1) ${fmt(dados.testemunha1)}  2) ${fmt(dados.testemunha2)}`
    } else if (tipo === 'aditivo_inclusao') {
      titulo = 'TERMO ADITIVO DE INCLUSÃO DE EQUIPAMENTOS'
      corpo =
        `${titulo} — ao CONTRATO DE LOCAÇÃO Nº ${fmt(dados.numero)}\n\n` +
        `LOCADORA: ${fmt(dados.razao_locadora)} (CNPJ ${fmt(dados.cnpj_locadora)}).\nLOCATÁRIA: ${fmt(dados.nome_cli)} (CNPJ ${fmt(dados.cnpj_cli)}).\n\n` +
        `Ficam INCLUÍDOS ao contrato os equipamentos abaixo, com aluguel adicional de ${fmt(dados.valor_num)} e franquia adicional de ${fmt(dados.pag_contratadas)} páginas; excedente a ${fmt(dados.valor_exc)} por página. Demais cláusulas permanecem inalteradas.\n\n` +
        `EQUIPAMENTOS INCLUÍDOS\n| # | Patrimônio | Marca/Modelo | Nº de série |\n${eqsTxt}\n\n` +
        `Curitiba, ____ de ____________ de 2026.\n\nLOCADORA: ______________________\nLOCATÁRIA: ______________________\nTESTEMUNHAS: 1) ${fmt(dados.testemunha1)}  2) ${fmt(dados.testemunha2)}`
    } else {
      titulo = 'TERMO ADITIVO DE EXCLUSÃO DE EQUIPAMENTOS'
      corpo =
        `${titulo} — ao CONTRATO DE LOCAÇÃO Nº ${fmt(dados.numero)}\n\n` +
        `LOCADORA: ${fmt(dados.razao_locadora)} (CNPJ ${fmt(dados.cnpj_locadora)}).\nLOCATÁRIA: ${fmt(dados.nome_cli)} (CNPJ ${fmt(dados.cnpj_cli)}).\n\n` +
        `Ficam EXCLUÍDOS do contrato os equipamentos abaixo, com redução do aluguel em ${fmt(dados.valor_num)}; a LOCATÁRIA declara devolvê-los em perfeito estado. Demais cláusulas permanecem inalteradas.\n\n` +
        `EQUIPAMENTOS EXCLUÍDOS\n| # | Patrimônio | Marca/Modelo |\n${eqsRemTxt}\n\n` +
        `Curitiba, ____ de ____________ de 2026.\n\nLOCADORA: ______________________\nLOCATÁRIA: ______________________\nTESTEMUNHAS: 1) ${fmt(dados.testemunha1)}  2) ${fmt(dados.testemunha2)}`
    }

    // ---- 5. grava o rascunho ----
    const rec = app.newRecord('documentos_contrato')
    rec.set('empresa', empresaId)
    rec.set('tipo', tipo)
    rec.set('dados', dados)
    rec.set('conferencia', conferencia)
    rec.set('texto', corpo)
    rec.set('status', 'gerado')
    rec.set('numero', dados.numero)
    app.save(rec)

    return e.json(200, { ok: true, conferencia, documento: { id: rec.id, tipo, texto: corpo } })
  } catch (err) {
    console.warn('[contrato/gerar] erro', err)
    return e.json(500, { error: String(err) })
  }
})
