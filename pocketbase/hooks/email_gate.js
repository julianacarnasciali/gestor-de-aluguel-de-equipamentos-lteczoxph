// TRAVA ÚNICA DE E-MAIL COM COBRANÇA (08/11/2026 — pedido da Juliana)
//
// REGRA PERMANENTE, nas palavras dela:
//   "Coloque essa mesma trava que hoje existe no fechamento no serviço avulso
//    ou qualquer outro tipo de serviço que venha a ser criado. Algo que tenha
//    boleto e nota tem que sair tudo junto. E-mail."
//
// O QUE ACONTECEU PARA ELA PEDIR ISSO: o e-mail do serviço avulso SA 2026/0003
// saiu com a nota ainda SCHEDULED (agendada), porque o hook `email_servico.js`
// nunca teve a checagem que o `email_fechamento.js` já tinha. O cliente recebeu
// cobrança sem a nota.
//
// POR QUE UMA ROTA E NÃO UMA CÓPIA EM CADA HOOK: o JSVM não compartilha funções
// entre arquivos de hook — cada arquivo é um escopo isolado. Se a regra fosse
// copiada, a primeira correção deixaria uma cópia velha para trás (que é
// exatamente como esse bug nasceu: duas travas, uma só foi escrita). Aqui a
// regra mora em UM lugar, e todo hook de e-mail novo consulta esta rota.
//
// CONTRATO
//   GET /backend/v1/email/pode-enviar?colecao=<fechamentos|servicos|...>&id=<rec>
//   200 { ok: true,  motivos: [] }                  -> pode enviar
//   200 { ok: false, motivos: ["...", "..."] }      -> NÃO enviar (e o porquê)
//
// SOMENTE LEITURA. Esta rota não grava NADA de propósito: gravá-la dispararia
// os próprios hooks de e-mail (que rodam em onRecordAfterUpdateSuccess) e
// criaria laço. Se precisar mudar dados, não é aqui.
//
// FAIL-CLOSED: quem chama tem de tratar resposta ausente/erro como "não
// enviar". É melhor não mandar do que mandar incompleto.
routerAdd('GET', '/backend/v1/email/pode-enviar', (e) => {
  const tokenQuery = String(e.request.url.query().get('t') || '')
  const tokenHeader = String(e.request.header.get('x-maestro-token') || '')
  let ok = false
  try {
    if (e.auth && e.auth.id) ok = true
  } catch (_) {}
  if (!ok) {
    const secret = $secrets.get('MAESTRO_TOKEN') || ''
    if (secret && (tokenQuery === secret || tokenHeader === secret)) ok = true
  }
  if (!ok) return e.unauthorizedError('acesso negado')

  const q = e.request.url.query()
  const colecao = String(q.get('colecao') || '')
  const id = String(q.get('id') || '')
  if (!colecao) return e.badRequestError('colecao obrigatoria')
  if (!id) return e.badRequestError('id obrigatorio')

  let rec = null
  try {
    rec = $app.findRecordById(colecao, id)
  } catch (_) {
    return e.notFoundError('registro nao encontrado')
  }

  const motivos = []

  // ---------- 1) BOLETO ----------
  // Sem cobrança não é e-mail de cobrança. Exige o id do pagamento no Asaas;
  // a URL do boleto/linha digitável é o que o cliente clica, então também
  // entra — boleto sem link é boleto que não chega.
  let paymentId = ''
  let boletoUrl = ''
  let linha = ''
  try {
    paymentId = String(rec.getString('asaas_payment_id') || '')
  } catch (_) {}
  try {
    boletoUrl = String(rec.getString('asaas_boleto_url') || '')
  } catch (_) {}
  try {
    linha = String(rec.getString('asaas_linha_digitavel') || '')
  } catch (_) {}
  if (!paymentId) motivos.push('sem boleto (asaas_payment_id vazio)')
  else if (!boletoUrl && !linha) motivos.push('boleto sem link nem linha digitavel')

  // ---------- 2) NOTA FISCAL ----------
  // Quem decide se este registro emite nota é o campo `emite_nf` do PRÓPRIO
  // registro quando ele existe (decisão de 08/10: a NF é por serviço, não por
  // empresa). Se a coleção não tem o campo — caso de `fechamentos` — vale o
  // `emite_nf` da empresa.
  let emiteNF = false
  let origemEmiteNF = 'empresa'
  try {
    const campos = rec.collection().fields
    if (campos.getByName('emite_nf')) {
      emiteNF = rec.getBool('emite_nf')
      origemEmiteNF = 'registro'
    }
  } catch (_) {}
  if (origemEmiteNF === 'empresa') {
    try {
      const emp = $app.findRecordById('empresas', rec.getString('empresa'))
      emiteNF = emp.getBool('emite_nf')
    } catch (_) {}
  }

  let nfStatus = ''
  let nfId = ''
  try {
    nfStatus = String(rec.getString('asaas_invoice_status') || '')
  } catch (_) {}
  try {
    nfId = String(rec.getString('asaas_invoice_id') || '')
  } catch (_) {}
  if (emiteNF) {
    if (!nfId) {
      motivos.push('emite nota mas nao tem nota criada (asaas_invoice_id vazio)')
    } else if (nfStatus !== 'AUTHORIZED' && nfStatus !== 'ERROR') {
      // SCHEDULED entra aqui: nota apenas AGENDADA não é nota emitida.
      motivos.push('nota ainda nao autorizada (status ' + (nfStatus || 'vazio') + ')')
    }
  }

  // ---------- 3) RELATÓRIO ----------
  // `relatorio_html` arquivado (serviços) ou o PDF já gravado (fechamentos).
  // Fechamento que ainda não tem o PDF pode gerar na hora pelo hook — por isso
  // a ausência aqui não bloqueia; o hook tem a própria checagem e não envia
  // sem anexo. Este bloco só reporta o estado, para auditoria.
  let temRelatorio = false
  try {
    temRelatorio =
      String(rec.getString('relatorio_html') || '') !== '' ||
      String(rec.getString('pdf') || '') !== ''
  } catch (_) {}

  return e.json(200, {
    ok: motivos.length === 0,
    motivos: motivos,
    detalhe: {
      colecao: colecao,
      id: rec.id,
      boleto: paymentId ? true : false,
      emite_nf: emiteNF,
      origem_emite_nf: origemEmiteNF,
      nf_id: nfId,
      nf_status: nfStatus,
      relatorio_arquivado: temRelatorio,
    },
  })
})
