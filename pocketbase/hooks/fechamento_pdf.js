// @deps pdf-lib@1.17.1
// Rota: GET /backend/v1/fechamentos/:id/pdf
// Gera o PDF do fechamento (recibo ou fatura) no layout LCA Tecnologia.
// Autenticada: só usuários logados do sistema.
routerAdd(
  'GET',
  '/backend/v1/fechamentos/{id}/pdf',
  (e) => {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

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

    const navy = rgb(0.059, 0.165, 0.263)
    const teal = rgb(0.051, 0.58, 0.533)
    const cinza = rgb(0.42, 0.45, 0.5)
    const zebra = rgb(0.96, 0.97, 0.98)
    const branco = rgb(1, 1, 1)
    const preto = rgb(0.1, 0.12, 0.14)

    const doc = PDFDocument.create()
    const font = doc.embedFont(StandardFonts.Helvetica)
    const fontB = doc.embedFont(StandardFonts.HelveticaBold)
    const page = doc.addPage([842, 595]) // A4 landscape (recibo mensal)
    const W = 842

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
    page.drawRectangle({ x: 0, y: 515, width: W, height: 80, color: navy })
    page.drawText(nomeFantasia, { x: 40, y: 555, size: 22, font: fontB, color: branco })
    page.drawText(razao + '  ·  CNPJ ' + cnpjCfg, {
      x: 40,
      y: 538,
      size: 8.5,
      font,
      color: rgb(0.75, 0.82, 0.87),
    })
    page.drawText(endCfg + '  ·  ' + cidCfg + '  ·  ' + foneCfg + '  ·  ' + emailCfg, {
      x: 40,
      y: 525,
      size: 8,
      font,
      color: rgb(0.75, 0.82, 0.87),
    })

    // título do documento
    const ehFatura = fech.getString('tipo_documento') === 'fatura'
    const titulo = ehFatura
      ? 'FATURA — COBRANÇA DE LOCAÇÃO DE BENS MÓVEIS'
      : 'RECIBO DE LOCAÇÃO DE BENS MÓVEIS'
    page.drawText(titulo, { x: 40, y: 492, size: 13, font: fontB, color: navy })

    // ---- bloco destinatário ----
    page.drawText('Cliente: ' + nomeEmp, { x: 40, y: 468, size: 10.5, font: fontB, color: preto })
    page.drawText('CNPJ/CPF: ' + docEmp + (endEmp ? '   ·   Endereço: ' + endEmp : ''), {
      x: 40,
      y: 454,
      size: 9,
      font,
      color: cinza,
    })
    const comp = fech.getString('competencia')
    const mostraPeriodo = fech.getBool('mostrar_periodo')
    let linhaRef = 'Competência: ' + comp
    if (mostraPeriodo)
      linhaRef +=
        '   ·   Período: ' + fech.getString('periodo_de') + ' a ' + fech.getString('periodo_ate')
    linhaRef += '   ·   Vencimento: ' + fmt(fech.getString('data_vencimento'))
    page.drawText(linhaRef, { x: 40, y: 440, size: 9, font, color: cinza })

    // ---- tabela de leituras por impressora ----
    const eqs = $app.findRecordsByFilter(
      'equipamentos',
      "contrato = '" + contrato.id + "' && tipo = 'impressora'",
      'patrimonio',
      100,
      0,
    )
    const leituras = $app.findRecordsByFilter(
      'leituras',
      "contrato = '" + contrato.id + "' && competencia = '" + comp + "'",
      '',
      200,
      0,
    )
    const leitPorEq = {}
    for (const l of leituras) leitPorEq[l.getString('equipamento')] = l

    let y = 415
    page.drawRectangle({ x: 40, y: y - 6, width: W - 80, height: 20, color: navy })
    const cols = [40, 190, 320, 470, 570, 670, 762]
    const heads = ['Máquina', 'Setor', 'Leitura ant.', 'Leitura atual', 'Páginas', '']
    page.drawText('Máquina', { x: cols[0] + 6, y, size: 8.5, font: fontB, color: branco })
    page.drawText('Setor', { x: cols[1] + 6, y, size: 8.5, font: fontB, color: branco })
    page.drawText('Leitura ant.', { x: cols[2] + 6, y, size: 8.5, font: fontB, color: branco })
    page.drawText('Leitura atual', { x: cols[3] + 6, y, size: 8.5, font: fontB, color: branco })
    page.drawText('Páginas', { x: cols[4] + 6, y, size: 8.5, font: fontB, color: branco })
    page.drawText('Excedente', { x: cols[5] + 6, y, size: 8.5, font: fontB, color: branco })

    y -= 24
    let zebraIdx = 0
    for (const eq of eqs) {
      const l = leitPorEq[eq.id]
      if (zebraIdx % 2 === 1)
        page.drawRectangle({ x: 40, y: y - 5, width: W - 80, height: 18, color: zebra })
      page.drawText(eq.getString('patrimonio') || eq.id, {
        x: cols[0] + 6,
        y,
        size: 8.5,
        font,
        color: preto,
      })
      page.drawText(eq.getString('setor') || '—', {
        x: cols[1] + 6,
        y,
        size: 8.5,
        font,
        color: preto,
      })
      page.drawText(l ? String(l.getNumber('leitura_anterior')) : '—', {
        x: cols[2] + 6,
        y,
        size: 8.5,
        font,
        color: preto,
      })
      page.drawText(l ? String(l.getNumber('leitura_atual')) : '—', {
        x: cols[3] + 6,
        y,
        size: 8.5,
        font,
        color: preto,
      })
      page.drawText(l ? String(l.getNumber('paginas_mes')) : '—', {
        x: cols[4] + 6,
        y,
        size: 8.5,
        font,
        color: preto,
      })
      page.drawText('—', { x: cols[5] + 6, y, size: 8.5, font, color: cinza })
      y -= 18
      zebraIdx++
    }

    // ---- cards de resumo ----
    const cardY = y - 30
    const cardW = (W - 80 - 40) / 3
    const cards = [
      {
        label: 'Páginas do mês',
        valor: String(fech.getNumber('paginas_consumidas') || 0),
        cor: navy,
      },
      { label: 'Excedentes', valor: brl(fech.getNumber('vlr_excedentes')), cor: teal },
      {
        label: 'Total',
        valor: brl(fech.getNumber('valor_final') || fech.getNumber('total')),
        cor: navy,
      },
    ]
    for (let i = 0; i < 3; i++) {
      const x = 40 + i * (cardW + 20)
      page.drawRectangle({ x, y: cardY - 40, width: cardW, height: 55, color: cards[i].cor })
      page.drawText(cards[i].label, {
        x: x + 12,
        y: cardY - 8,
        size: 8.5,
        font,
        color: rgb(0.85, 0.9, 0.93),
      })
      page.drawText(cards[i].valor, {
        x: x + 12,
        y: cardY - 30,
        size: 15,
        font: fontB,
        color: branco,
      })
    }

    // ---- composição do valor ----
    let yy = cardY - 70
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
    for (const [lbl, val] of linhas) {
      const v = Number(val) || 0
      if (v === 0 && lbl.indexOf('Excedentes') < 0) continue
      page.drawText(lbl, { x: 40, y: yy, size: 9, font, color: cinza })
      page.drawText(brl(v), { x: 200, y: yy, size: 9, font: fontB, color: preto })
      yy -= 14
    }
    const desc = Number(fech.getNumber('desconto')) || 0
    if (desc > 0) {
      page.drawText('Desconto', { x: 40, y: yy, size: 9, font, color: cinza })
      page.drawText('- ' + brl(desc), {
        x: 200,
        y: yy,
        size: 9,
        font: fontB,
        color: rgb(0.8, 0.2, 0.2),
      })
      yy -= 14
    }

    // forma de pagamento + boleto
    const fp = fech.getString('forma_pgto')
    const boletoUrl = fech.getString('asaas_boleto_url')
    if (fp) {
      page.drawText(
        'Forma de pagamento: ' + fp + (boletoUrl ? '   ·   Boleto: ' + boletoUrl : ''),
        { x: 40, y: yy - 4, size: 8.5, font, color: cinza },
      )
      yy -= 18
    }

    // ---- rodapé legal ----
    if (rodape) {
      const words = rodape.split(' ')
      let line = ''
      let ry = 40
      for (const w of words) {
        if ((line + w).length > 110) {
          page.drawText(line, { x: 40, y: ry, size: 6.8, font, color: cinza })
          ry -= 9
          line = ''
        }
        line += w + ' '
      }
      if (line.trim()) page.drawText(line, { x: 40, y: ry, size: 6.8, font, color: cinza })
    }

    const bytes = doc.save()
    const file = $filesystem.fileFromBytes(bytes, 'fechamento-' + id + '.pdf')
    return e.blob(200, 'application/pdf', bytes)
  },
  $apis.requireAuth(),
)
