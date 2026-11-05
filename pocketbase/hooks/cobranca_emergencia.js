// FECHAMENTO DE EMERGÊNCIA — cobrança mensal pelo valor do contrato, com senha.
//
// Pedido dela (05/11/2026):
//   "Este botão força um fechamento imediato do contrato. Vai ser usado quando eu
//    precisar antecipar o contrato ou quando o dia 1º deu erro e não lançou a
//    cobrança recorrente. Preciso de um botão de emergência, e somente eu posso
//    fazer isso: clicar nesse botão. Ele pede uma senha de fechamento toda vez."
//
// POR QUE A SENHA É VALIDADA AQUI (servidor) E NÃO NA TELA:
//   tudo o que a tela chama fica no bundle JavaScript, que qualquer usuário logado
//   baixa e abre. Uma senha comparada no navegador é decoração. Aqui ela é
//   comparada no servidor, contra `SENHA_FECHAMENTO` (secret) ou o padrão 9750.
//
// O QUE A ROTA FAZ — nesta ordem, e só isso:
//   1. exige sessão de usuário logado
//   2. confere a senha; errada = 400, nada acontece
//   3. recusa se já existe fechamento do contrato naquela competência
//      (não cobra duas vezes, inclusive do que a recorrência do dia 1º criou)
//   4. cria o fechamento pelo VALOR DO CONTRATO, sem página excedente
//   5. FORÇA a geração agora: boleto + relatório + NF, sem esperar a janela de
//      60 min. É o "imediato" que ela pediu — o fluxo normal continua com a janela.
//
// A geração em si é a MESMA rota do fluxo normal (/backend/v1/cobranca/processar),
// chamada com forcar=true. Não existe uma segunda cópia da lógica de cobrança.
routerAdd('POST', '/backend/v1/cobranca/emergencia', (e) => {
  // ---------- 1. sessão ----------
  let logado = false
  try {
    if (e.auth && e.auth.id) logado = true
  } catch (_) {}
  if (!logado) return e.unauthorizedError('login necessario')

  let body = null
  try {
    body = e.requestInfo().body
  } catch (_) {}
  if (!body) return e.badRequestError('corpo invalido')

  // ---------- 2. senha ----------
  const senhaInformada = String(body.senha || '')
  const senhaCorreta = String($secrets.get('SENHA_FECHAMENTO') || '9750')
  if (senhaInformada !== senhaCorreta) {
    console.warn(
      '[emergencia] senha incorreta | usuario:',
      (e.auth && e.auth.email) || e.auth.id,
      '| contrato:',
      String(body.contratoId || ''),
    )
    return e.badRequestError('Senha de fechamento incorreta.')
  }

  const contratoId = String(body.contratoId || '')
  const competencia = String(body.competencia || '')
  if (!contratoId) return e.badRequestError('contratoId obrigatorio')
  if (!/^\d{2}\/\d{4}$/.test(competencia)) return e.badRequestError('competencia invalida')

  let contrato = null
  try {
    contrato = $app.findRecordById('contratos', contratoId)
  } catch (_) {}
  if (!contrato) return e.badRequestError('contrato nao encontrado')
  if (!contrato.getBool('ativo')) return e.badRequestError('contrato inativo')

  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', contrato.getString('empresa'))
  } catch (_) {}
  if (!empresa) return e.badRequestError('empresa nao encontrada')

  const valor =
    Number(contrato.getFloat('mensalidade') || 0) +
    Number(contrato.getFloat('vlr_dispositivos') || 0) +
    Number(contrato.getFloat('vlr_servidores') || 0) +
    Number(contrato.getFloat('vlr_servicos') || 0)
  if (valor <= 0) return e.badRequestError('contrato sem valor mensal definido')

  // ---------- 3. já existe cobrança nesta competência? ----------
  let existente = null
  try {
    const achados = $app.findRecordsByFilter(
      'fechamentos',
      'contrato = "' + contratoId + '" && competencia = "' + competencia + '"',
      '-created',
      1,
      0,
    )
    if (achados.length > 0) existente = achados[0]
  } catch (_) {}
  if (existente) {
    return e.badRequestError(
      'Já existe cobrança de ' +
        competencia +
        ' para este contrato (' +
        existente.id +
        '). Não criei outra para não cobrar duas vezes.',
    )
  }

  // ---------- 4. cria o fechamento pelo valor do contrato ----------
  // vencimento no mês SEGUINTE ao da competência (regra dela 31/10)
  const partesComp = competencia.split('/')
  const mesComp = Number(partesComp[0])
  const anoComp = Number(partesComp[1])
  const diaVenc = Number(contrato.getInt('dia_vencimento') || 5)
  const ultimoDoVenc = new Date(anoComp, mesComp + 1, 0).getDate()
  const dataVencObj = new Date(anoComp, mesComp, Math.min(diaVenc, ultimoDoVenc))
  const dois = (n) => String(n).padStart(2, '0')
  const vencimento =
    dataVencObj.getFullYear() +
    '-' +
    dois(dataVencObj.getMonth() + 1) +
    '-' +
    dois(dataVencObj.getDate())

  const agora = new Date()
  const hojeISO =
    agora.getFullYear() + '-' + dois(agora.getMonth() + 1) + '-' + dois(agora.getDate())
  const ultimoDiaMes = new Date(anoComp, mesComp, 0).getDate()
  const periodoAte = dois(ultimoDiaMes) + '/' + dois(mesComp) + '/' + anoComp

  let novo = null
  try {
    const col = $app.findCollectionByNameOrId('fechamentos')
    novo = new Record(col, {
      contrato: contratoId,
      empresa: contrato.getString('empresa'),
      competencia: competencia,
      paginas_consumidas: 0,
      paginas_excedentes: 0,
      vlr_impressoras: Number(contrato.getFloat('mensalidade') || 0),
      vlr_excedentes: 0,
      vlr_dispositivos: Number(contrato.getFloat('vlr_dispositivos') || 0),
      vlr_servidores: Number(contrato.getFloat('vlr_servidores') || 0),
      vlr_servicos: Number(contrato.getFloat('vlr_servicos') || 0),
      desconto: 0,
      total: valor,
      valor_final: valor,
      desconto_percentual: 0,
      desconto_valor: 0,
      tipo_documento: empresa.getBool('emite_nf') ? 'fatura' : 'documento',
      data_emissao: hojeISO,
      data_vencimento: vencimento,
      forma_pgto: 'boleto',
      mostrar_periodo: true,
      periodo_de: '01/' + competencia,
      periodo_ate: periodoAte,
      status: 'emitido',
      observacoes: 'Cobrança de emergência pelo valor do contrato (sem excedente de páginas)',
      cobranca_contrato: true,
    })
    $app.save(novo)
  } catch (err) {
    console.warn('[emergencia] falha ao criar fechamento', err)
    return e.badRequestError('Nao consegui criar o fechamento: ' + String(err).slice(0, 300))
  }

  const fechamentoId = novo.id
  console.log(
    '[emergencia] fechamento criado',
    fechamentoId,
    competencia,
    'contrato',
    contratoId,
    'valor',
    valor,
    'por',
    (e.auth && e.auth.email) || e.auth.id,
  )

  // ---------- 5. FORÇA a geração agora ----------
  // A fila normal usaria a janela de 60 min. Aqui é emergência: forcar=true.
  // Quem decide o resto (boleto, relatório obrigatório, NF, e-mail) é a MESMA
  // rota do fluxo normal — não há cópia da lógica aqui.
  const token = $secrets.get('MAESTRO_TOKEN') || ''
  const appUrl = 'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev'
  let geracao = null
  try {
    const r = $http.send({
      url: appUrl + '/backend/v1/cobranca/processar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-maestro-token': token },
      body: JSON.stringify({ colecao: 'fechamentos', id: fechamentoId, forcar: true }),
      timeout: 120,
    })
    const corpo = r.json || {}
    geracao = {
      status: r.statusCode,
      ok: r.statusCode === 200 && corpo.ok === true,
      paymentId: corpo.paymentId || '',
      boletoUrl: corpo.boletoUrl || '',
      invoiceId: corpo.invoiceId || '',
      invoiceStatus: corpo.invoiceStatus || '',
      relatorio: corpo.relatorio === true,
      mensagem: corpo.message || corpo.mensagem || '',
    }
    if (!geracao.ok) {
      console.warn('[emergencia] geracao falhou', r.statusCode, String(r.body || '').slice(0, 300))
    }
  } catch (err) {
    console.warn('[emergencia] erro ao chamar processar', err)
    geracao = { ok: false, status: 0, mensagem: String(err) }
  }

  return e.json(200, {
    ok: true,
    fechamentoId: fechamentoId,
    competencia: competencia,
    empresa: empresa.getString('nome'),
    valor: valor,
    vencimento: vencimento,
    cobranca_contrato: true,
    geracao: geracao,
  })
})
