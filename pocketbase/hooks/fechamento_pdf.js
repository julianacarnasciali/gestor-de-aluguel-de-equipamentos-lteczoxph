// @deps jspdf@2.5.2
// Rota: GET /backend/v1/fechamentos/{id}/pdf
// Gera o PDF do fechamento (recibo ou fatura) no layout LCA Tecnologia.
// jsPDF é síncrono — compatível com o JSVM do PocketBase (sem Promises).
// O PDF é anexado ao registro (campo pdf) e servido por redirect.
routerAdd(
  'GET',
  '/backend/v1/fechamentos/{id}/pdf',
  (e) => {
    const { jsPDF } = require('jspdf')

    const id = e.request.pathValue('id')
    let fech = null
    try {
      fech = $app.findRecordById('fechamentos', id)
    } catch (_) {
      return e.notFoundError('fechamento não encontrado')
    }

    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', fech.getString('empresa'))
    } catch (_) {}
    let contrato = null
    try {
      contrato = $app.findRecordById('contratos', fech.getString('contrato'))
    } catch (_) {}
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('config', 'id != ""')
    } catch (_) {}

    const brl = (v) => {
      const n = Number(v) || 0
      return (
        'R$ ' +
        n
          .toFixed(2)
          .replace('.', ',')
          .replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
      )
    }
    const fmt = (d) => {
      const s = String(d || '')
      return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s
    }

    const NAVY = [15, 42, 67]
    const TEAL = [13, 148, 136]
    const CINZA = [107, 114, 128]
    const ZEBRA = [244, 246, 248]
    const BRANCO = [255, 255, 255]
    const PRETO = [26, 32, 38]

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const W = 842
    const H = 595

    const nomeFantasia = cfg ? cfg.getString('nome_fantasia') : 'LCCA Tecnologia'
    const razao = cfg ? cfg.getString('razao_social') : ''
    const cnpjCfg = cfg ? cfg.getString('cnpj') : ''
    const foneCfg = cfg ? cfg.getString('telefone') : ''
    const emailCfg = cfg ? cfg.getString('email') : ''
    const endCfg = cfg ? cfg.getString('endereco') : ''
    const cidCfg = cfg ? cfg.getString('cidade_uf') : ''
    const rodape = cfg ? cfg.getString('rodape_legal') : ''

    const nomeEmp = empresa ? empresa.getString('nome') : ''
    const docEmp = empresa ? empresa.getString('cnpj_cpf') : ''
    const endEmp = empresa ? empresa.getString('endereco') : ''

    // ---- faixa superior navy ----
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2])
    doc.rect(0, 0, W, 80, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text(nomeFantasia, 40, 40)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(190, 205, 215)
    doc.text(razao + '  ·  CNPJ ' + cnpjCfg, 40, 57)
    doc.setFontSize(8)
    doc.text(endCfg + '  ·  ' + cidCfg + '  ·  ' + foneCfg + '  ·  ' + emailCfg, 40, 70)

    // título
    const ehFatura = fech.getString('tipo_documento') === 'fatura'
    const titulo = ehFatura
      ? 'FATURA - COBRANCA DE LOCACAO DE BENS MOVEIS'
      : 'RECIBO DE LOCACAO DE BENS MOVEIS'
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(titulo, 40, 103)

    // destinatário
    doc.setFontSize(10.5)
    doc.setTextColor(PRETO[0], PRETO[1], PRETO[2])
    doc.text('Cliente: ' + nomeEmp, 40, 127)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    doc.text('CNPJ/CPF: ' + docEmp + (endEmp ? '   ·   Endereço: ' + endEmp : ''), 40, 141)
    const comp = fech.getString('competencia')
    let linhaRef = 'Competência: ' + comp
    if (fech.getBool('mostrar_periodo'))
      linhaRef +=
        '   ·   Período: ' + fech.getString('periodo_de') + ' a ' + fech.getString('periodo_ate')
    linhaRef += '   ·   Vencimento: ' + fmt(fech.getString('data_vencimento'))
    doc.text(linhaRef, 40, 155)

    // ---- tabela de leituras ----
    const contratoId = contrato ? contrato.id : ''
    const eqs = contratoId
      ? $app.findRecordsByFilter(
          'equipamentos',
          "contrato = '" + contratoId + "' && tipo = 'impressora'",
          'patrimonio',
          100,
          0,
        )
      : []
    const leituras = contratoId
      ? $app.findRecordsByFilter(
          'leituras',
          "contrato = '" + contratoId + "' && competencia = '" + comp + "'",
          '',
          200,
          0,
        )
      : []
    const leitPorEq = {}
    for (const l of leituras) leitPorEq[l.getString('equipamento')] = l

    let yTop = 166
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2])
    doc.rect(40, yTop, W - 80, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    const cols = [40, 190, 320, 470, 570, 670]
    const heads = ['Máquina', 'Setor', 'Leitura ant.', 'Leitura atual', 'Páginas', 'Excedente']
    for (let i = 0; i < 6; i++) doc.text(heads[i], cols[i] + 6, yTop + 14)

    yTop += 20
    let zebraIdx = 0
    for (const eq of eqs) {
      const l = leitPorEq[eq.id]
      const baseY = yTop + 13
      if (zebraIdx % 2 === 1) {
        doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2])
        doc.rect(40, yTop, W - 80, 18, 'F')
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(PRETO[0], PRETO[1], PRETO[2])
      doc.text(eq.getString('patrimonio') || eq.id, cols[0] + 6, baseY)
      doc.text(eq.getString('setor') || '-', cols[1] + 6, baseY)
      doc.text(l ? String(l.getNumber('leitura_anterior')) : '-', cols[2] + 6, baseY)
      doc.text(l ? String(l.getNumber('leitura_atual')) : '-', cols[3] + 6, baseY)
      doc.text(l ? String(l.getNumber('paginas_mes')) : '-', cols[4] + 6, baseY)
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
      doc.text('-', cols[5] + 6, baseY)
      yTop += 18
      zebraIdx++
    }

    // ---- cards de resumo ----
    const cardY = yTop + 14
    const cardW = (W - 80 - 40) / 3
    const cards = [
      {
        label: 'Páginas do mês',
        valor: String(fech.getNumber('paginas_consumidas') || 0),
        cor: NAVY,
      },
      { label: 'Excedentes', valor: brl(fech.getNumber('vlr_excedentes')), cor: TEAL },
      {
        label: 'Total',
        valor: brl(fech.getNumber('valor_final') || fech.getNumber('total')),
        cor: NAVY,
      },
    ]
    for (let i = 0; i < 3; i++) {
      const x = 40 + i * (cardW + 20)
      doc.setFillColor(cards[i].cor[0], cards[i].cor[1], cards[i].cor[2])
      doc.rect(x, cardY, cardW, 55, 'F')
      doc.setTextColor(215, 228, 235)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(cards[i].label, x + 12, cardY + 18)
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text(cards[i].valor, x + 12, cardY + 42)
    }

    // ---- composição do valor ----
    let yy = cardY + 80
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const linhas = [
      ['Impressoras (mensalidade)', fech.getNumber('vlr_impressoras')],
      ['Dispositivos (comodato)', fech.getNumber('vlr_dispositivos')],
      ['Servidores', fech.getNumber('vlr_servidores')],
      ['Serviços', fech.getNumber('vlr_servicos')],
      [
        'Excedentes (' + (fech.getNumber('paginas_excedentes') || 0) + ' págs)',
        fech.getNumber('vlr_excedentes'),
      ],
    ]
    for (const par of linhas) {
      const lbl = par[0]
      const v = Number(par[1]) || 0
      if (v === 0 && lbl.indexOf('Excedentes') < 0) continue
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
      doc.text(lbl, 40, yy)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(PRETO[0], PRETO[1], PRETO[2])
      doc.text(brl(v), 200, yy)
      doc.setFont('helvetica', 'normal')
      yy += 14
    }
    const desc = Number(fech.getNumber('desconto')) || 0
    if (desc > 0) {
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
      doc.text('Desconto', 40, yy)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(204, 51, 51)
      doc.text('- ' + brl(desc), 200, yy)
      doc.setFont('helvetica', 'normal')
      yy += 14
    }

    // forma de pagamento + boleto
    const fp = fech.getString('forma_pgto')
    const boletoUrl = fech.getString('asaas_boleto_url')
    if (fp) {
      doc.setFontSize(8.5)
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
      doc.text(
        'Forma de pagamento: ' + fp + (boletoUrl ? '   ·   Boleto: ' + boletoUrl : ''),
        40,
        yy + 4,
      )
    }

    // ---- rodapé legal ----
    if (rodape) {
      const words = String(rodape).split(' ')
      let line = ''
      let ry = H - 40
      doc.setFontSize(6.8)
      doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
      for (const w of words) {
        if ((line + w).length > 115) {
          doc.text(line, 40, ry)
          ry += 9
          line = ''
        }
        line += w + ' '
      }
      if (line.trim()) doc.text(line, 40, ry)
    }

    const bytes = doc.output('arraybuffer')
    const file = $filesystem.fileFromBytes(bytes, 'fechamento-' + id + '.pdf')
    fech.set('pdf', file)
    $app.save(fech)
    return e.redirect(302, '/api/files/fechamentos/' + id + '/fechamento-' + id + '.pdf')
  },
  $apis.requireAuth(),
)
