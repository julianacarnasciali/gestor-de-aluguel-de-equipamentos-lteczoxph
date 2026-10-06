// Cron: gerar fechamentos recorrentes (contratos sem impressora).
// Todo dia 06:00 — cria fechamento do mês anterior se ainda não existir.
// Regras: só contratos ativos com recorrente=true, dentro do período do contrato;
// valor = fixo do contrato (mensalidade+disp+serv+servicos), sem excedentes;
// vencimento = dia_vencimento do mês da competência; status "emitido".
// O hook asaas_boleto.js dispara em seguida (boleto + NF p/ emite_nf).
cronAdd('recorrencia_fechamentos', '0 6 1 * *', () => {
  const hoje = new Date()
  const mes = hoje.getMonth() // 0-based
  const ano = hoje.getFullYear()
  const anterior =
    mes === 0
      ? `${String(12).padStart(2, '0')}/${ano - 1}`
      : `${String(mes).padStart(2, '0')}/${ano}`
  const competencia = anterior
  const [cMes, cAno] = competencia.split('/')

  const contratos = $app.findRecordsByFilter(
    'contratos',
    'ativo = true && recorrente = true',
    '',
    0,
    0,
  )
  for (const k of contratos) {
    try {
      // período do contrato (mes_ini/mes_fim em MM/AAAA)
      const ini = String(k.getString('mes_ini') || '')
      const fim = String(k.getString('mes_fim') || '')
      if (!ini || !fim) continue
      const [iM, iA] = ini.split('/')
      const [fM, fA] = fim.split('/')
      const iniNum = Number(iA) * 12 + Number(iM)
      const fimNum = Number(fA) * 12 + Number(fM)
      const compNum = Number(cAno) * 12 + Number(cMes)
      if (compNum < iniNum || compNum > fimNum) continue

      // já existe fechamento desta competência?
      const existentes = $app.countRecordsByFilter(
        'fechamentos',
        "contrato = '" + k.id + "' && competencia = '" + competencia + "'",
      )
      if (existentes > 0) continue

      const mensalidade = Number(k.getFloat('mensalidade') || 0)
      const disp = Number(k.getFloat('vlr_dispositivos') || 0)
      const serv = Number(k.getFloat('vlr_servidores') || 0)
      const servicos = Number(k.getFloat('vlr_servicos') || 0)
      const total = mensalidade + disp + serv + servicos
      if (total <= 0) continue

      // dia de vencimento (clamp 28)
      const diaVenc = Math.min(Number(k.getInt('dia_vencimento') || 5), 28)
      const venc = `${cAno}-${cMes}-${String(diaVenc).padStart(2, '0')}`
      const emissao = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

      const col = $app.findCollectionByNameOrId('fechamentos')
      const novo = new Record(col, {
        contrato: k.id,
        empresa: k.getString('empresa'),
        competencia: competencia,
        paginas_consumidas: 0,
        paginas_excedentes: 0,
        vlr_impressoras: mensalidade,
        vlr_excedentes: 0,
        vlr_dispositivos: disp,
        vlr_servidores: serv,
        vlr_servicos: servicos,
        desconto: 0,
        total: total,
        valor_final: total,
        desconto_percentual: 0,
        desconto_valor: 0,
        tipo_documento: (function () {
          try {
            const emp = $app.findRecordById('empresas', k.getString('empresa'))
            return emp.getBool('emite_nf') ? 'fatura' : 'documento'
          } catch (_) {
            return 'documento'
          }
        })(),
        data_emissao: emissao,
        data_vencimento: venc,
        forma_pgto: 'boleto',
        mostrar_periodo: true,
        periodo_de: '01/' + competencia,
        periodo_ate: '28/' + competencia,
        status: 'emitido',
        observacoes: 'Cobrança recorrente automática (sem impressora no contrato)',
      })
      $app.save(novo)
      console.log('[recorrencia] fechamento criado', competencia, 'contrato', k.id)
    } catch (err) {
      console.warn('[recorrencia] erro no contrato', k.id, err)
    }
  }
})
