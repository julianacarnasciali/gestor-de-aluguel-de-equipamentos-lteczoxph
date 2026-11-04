// RELATÓRIO DO FECHAMENTO — gerador de PDF no servidor (04/11/2026)
//
// Por que existe: até 04/11 o e-mail de fechamento saía SEM o relatório. O PDF
// só era gerado no navegador (src/lib/pdf-fechamento.ts, botão "Ver PDF"), então
// o servidor não tinha como anexá-lo. O cliente recebia o link do boleto e nada
// mais — foi a reclamação da Jandira Reserva.
//
// jsPDF não instala no JSVM (o pnpm barra o build script do core-js), então o
// PDF é montado aqui na mão, em PDF 1.4 puro, com as fontes padrão Helvetica
// (não precisam ser embutidas). Mesmo layout do gerador do navegador.
//
// ROTA
//   GET /backend/v1/fechamento/relatorio?id=<fechamento>&salvar=1&t=<token>
//     Devolve o PDF (application/pdf). Autentica por sessão OU x-maestro-token/
//     ?t= (para o cron e para o e-mail).
//     salvar=1 grava o arquivo no campo `pdf` do fechamento.
//
// REGRA DE NEGÓCIO (04/11): todo fechamento que gera boleto gera relatório, e
// nenhum e-mail sai sem o PDF anexado.
//
// TUDO dentro do callback: o JSVM isola escopos e funções de topo não são
// compartilhadas com os callbacks (lição registrada em licoes-codigo-e-demo.md).
routerAdd('GET', '/backend/v1/fechamento/relatorio', (e) => {
  // ---------- helpers ----------
  const MAPA = {
    0x2014: 0x97,
    0x2013: 0x96,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2026: 0x85,
    0x00a0: 0x20,
  }
  const latin = (s) => {
    const str = String(s == null ? '' : s)
    const o = []
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i)
      if (c > 255) c = MAPA[c] !== undefined ? MAPA[c] : 63
      o.push(c)
    }
    return o
  }
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\r\n\t]/g, ' ')

  // ---------- autenticação ----------
  const q = e.request.url.query()
  const tokenQuery = String(q.get('t') || '')
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

  const id = String(q.get('id') || '')
  if (!id) return e.badRequestError('id obrigatorio')

  let fech = null
  try {
    fech = $app.findRecordById('fechamentos', id)
  } catch (_) {
    return e.notFoundError('fechamento nao encontrado')
  }

  let empresa = null
  try {
    empresa = $app.findRecordById('empresas', fech.getString('empresa'))
  } catch (_) {}

  let config = null
  try {
    const cfgs = $app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
    if (cfgs.length > 0) config = cfgs[0]
  } catch (_) {}
  const cfg = {
    nome_fantasia: config
      ? config.getString('nome_fantasia') || 'LCCA Tecnologia'
      : 'LCCA Tecnologia',
    razao_social: config ? config.getString('razao_social') : '',
    cnpj: config ? config.getString('cnpj') : '',
    endereco: config ? config.getString('endereco') : '',
    cidade_uf: config ? config.getString('cidade_uf') : '',
    telefone: config ? config.getString('telefone') : '',
    email: config ? config.getString('email') : '',
    rodape_legal: config ? config.getString('rodape_legal') : '',
  }
  const emp = {
    nome: empresa ? empresa.getString('nome') : '',
    cnpj_cpf: empresa ? empresa.getString('cnpj_cpf') : '',
    endereco: empresa ? empresa.getString('endereco') : '',
    rodape_legal: empresa ? empresa.getString('rodape_legal') : '',
  }

  // ---------- máquinas + leituras da competência ----------
  const competencia = fech.getString('competencia')
  let maquinas = []
  try {
    const eqs = $app.findRecordsByFilter(
      'equipamentos',
      'contrato = "' + fech.getString('contrato') + '"',
      'patrimonio',
      200,
      0,
    )
    const leituras = $app.findRecordsByFilter(
      'leituras',
      'competencia = "' + competencia + '"',
      '',
      500,
      0,
    )
    for (let i = 0; i < eqs.length; i++) {
      const x = eqs[i]
      if (String(x.getString('tipo')) !== 'impressora') continue
      let l = null
      for (let k = 0; k < leituras.length; k++) {
        if (leituras[k].getString('equipamento') === x.id) {
          l = leituras[k]
          break
        }
      }
      maquinas.push({
        patrimonio: x.getString('patrimonio') || x.getString('descricao') || x.id,
        setor: x.getString('setor') || '',
        leitura_anterior: l ? Number(l.get('leitura_anterior') || 0) : 0,
        leitura_atual: l ? Number(l.get('leitura_atual') || 0) : 0,
        paginas_mes: l ? Number(l.get('paginas_mes') || 0) : 0,
      })
    }
  } catch (err) {
    console.warn('[relatorio] erro ao montar maquinas', err)
  }

  const brl = (v) => {
    const n = Number(v || 0)
    const neg = n < 0
    const abs = Math.abs(n)
    const inteiro = Math.floor(abs + 0.0000001)
    const cent = Math.round((abs - inteiro) * 100)
    let mi = String(inteiro)
    mi = mi.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return (neg ? '-' : '') + 'R$ ' + mi + ',' + String(cent).padStart(2, '0')
  }
  const dataBR = (iso) =>
    String(iso || '')
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/')

  const NAVY = [0.059, 0.165, 0.263]
  const TEAL = [0.051, 0.58, 0.533]
  const CINZA = [0.42, 0.447, 0.502]
  const ZEBRA = [0.957, 0.965, 0.973]
  const ESCURO = [0.102, 0.125, 0.149]
  const BRANCO = [1, 1, 1]
  const CLARO = [0.894, 0.933, 0.953]
  const CINZA_TXT = [0.216, 0.255, 0.318]

  const W = 595
  const H = 842
  const fy = (y) => H - y
  const cor = (c) => c[0] + ' ' + c[1] + ' ' + c[2]

  const ops = []
  const txt = (x, y, size, bold, c, s) => {
    ops.push(
      'BT /' +
        (bold ? 'F2' : 'F1') +
        ' ' +
        size +
        ' Tf ' +
        cor(c) +
        ' rg 1 0 0 1 ' +
        x +
        ' ' +
        fy(y).toFixed(2) +
        ' Tm (' +
        esc(s) +
        ') Tj ET',
    )
  }
  const ret = (x, y, w, h, c) => {
    ops.push(cor(c) + ' rg ' + x + ' ' + (fy(y) - h).toFixed(2) + ' ' + w + ' ' + h + ' re f')
  }

  // faixa navy primeiro (fica atrás de tudo)
  ret(0, 0, W, 80, NAVY)
  txt(40, 38, 20, true, BRANCO, cfg.nome_fantasia)
  txt(40, 55, 9.5, false, CLARO, cfg.razao_social + '  ·  CNPJ ' + cfg.cnpj)
  txt(
    40,
    68,
    9,
    false,
    CLARO,
    cfg.endereco + '  ·  ' + cfg.cidade_uf + '  ·  ' + cfg.telefone + '  ·  ' + cfg.email,
  )

  const ehFatura = String(fech.getString('tipo_documento')) === 'fatura'
  txt(
    40,
    106,
    12.5,
    true,
    NAVY,
    ehFatura ? 'FATURA - COBRANCA DE LOCACAO DE BENS MOVEIS' : 'RECIBO DE LOCACAO DE BENS MOVEIS',
  )

  txt(40, 130, 10.5, true, ESCURO, 'Cliente: ' + emp.nome)
  txt(40, 145, 8.5, false, CINZA, 'CNPJ/CPF: ' + emp.cnpj_cpf)
  if (emp.endereco) txt(40, 158, 8.5, false, CINZA, 'Endereço: ' + emp.endereco)

  let linhaRef = 'Competência: ' + competencia
  if (fech.getBool('mostrar_periodo'))
    linhaRef +=
      '  ·  Período: ' + fech.getString('periodo_de') + ' a ' + fech.getString('periodo_ate')
  linhaRef += '  ·  Vencimento: ' + dataBR(fech.getString('data_vencimento'))
  txt(40, 173, 8.5, false, CINZA, linhaRef)

  let notaLeitura = ''
  const dl = String(fech.getString('data_leitura') || '')
  if (dl) {
    notaLeitura = 'Leitura realizada em ' + dataBR(dl)
    const ref = String(fech.getString('leitura_referencia') || '')
    if (ref) notaLeitura += ' — apurada pelo contador e referente ao uso de ' + ref
  }
  if (notaLeitura) txt(40, 185, 7.8, false, CINZA, notaLeitura)

  let y = notaLeitura ? 198 : 186
  ret(40, y, W - 80, 18, NAVY)
  const cols = [40, 148, 232, 312, 396, 462]
  const heads = ['Máquina', 'Setor', 'Leitura ant.', 'Leitura atual', 'Páginas', 'Excedente']
  for (let i = 0; i < heads.length; i++) txt(cols[i] + 5, y + 12.5, 7.8, true, BRANCO, heads[i])

  y += 18
  for (let idx = 0; idx < maquinas.length; idx++) {
    const m = maquinas[idx]
    if (idx % 2 === 1) ret(40, y, W - 80, 17, ZEBRA)
    txt(cols[0] + 5, y + 12, 7.8, false, ESCURO, String(m.patrimonio || '-').slice(0, 20))
    txt(cols[1] + 5, y + 12, 7.8, false, ESCURO, String(m.setor || '-').slice(0, 16))
    txt(cols[2] + 5, y + 12, 7.8, false, ESCURO, String(m.leitura_anterior))
    txt(cols[3] + 5, y + 12, 7.8, false, ESCURO, String(m.leitura_atual))
    txt(cols[4] + 5, y + 12, 7.8, false, ESCURO, String(m.paginas_mes))
    txt(cols[5] + 5, y + 12, 7.8, false, CINZA, '-')
    y += 17
  }

  const cardY = y + 16
  const cardW = (W - 80 - 30) / 3
  const cards = [
    {
      label: 'Páginas do mês',
      valor: String(Number(fech.get('paginas_consumidas') || 0)),
      c: NAVY,
    },
    { label: 'Excedentes', valor: brl(fech.get('vlr_excedentes')), c: TEAL },
    { label: 'Total', valor: brl(fech.get('valor_final') || fech.get('total')), c: NAVY },
  ]
  for (let i = 0; i < cards.length; i++) {
    const x = 40 + i * (cardW + 15)
    ret(x, cardY, cardW, 56, cards[i].c)
    txt(x + 10, cardY + 17, 9.5, true, CLARO, cards[i].label)
    txt(x + 10, cardY + 40, 14, true, BRANCO, cards[i].valor)
  }

  let yy = cardY + 78
  const linhas = [
    ['Impressoras (mensalidade)', fech.get('vlr_impressoras')],
    ['Dispositivos (comodato)', fech.get('vlr_dispositivos')],
    ['Servidores', fech.get('vlr_servidores')],
    ['Serviços', fech.get('vlr_servicos')],
    [
      'Excedentes (' + Number(fech.get('paginas_excedentes') || 0) + ' págs)',
      fech.get('vlr_excedentes'),
    ],
  ]
  for (let i = 0; i < linhas.length; i++) {
    const lbl = linhas[i][0]
    const v = linhas[i][1]
    if (Number(v || 0) === 0 && lbl.indexOf('Excedentes') < 0) continue
    txt(40, yy, 8.8, false, CINZA, lbl)
    txt(250, yy, 8.8, true, ESCURO, brl(v))
    yy += 13.5
  }
  const desc = Number(fech.get('desconto') || 0)
  if (desc > 0) {
    txt(40, yy, 8.8, false, CINZA, 'Desconto')
    txt(250, yy, 8.8, true, [0.8, 0.2, 0.2], '- ' + brl(desc))
    yy += 13.5
  }

  const forma = String(fech.getString('forma_pgto') || '')
  if (forma) {
    txt(40, yy + 4, 8, false, CINZA, 'Forma de pagamento: ' + forma)
    yy += 14
    const bol = String(fech.getString('asaas_boleto_url') || '')
    if (bol) {
      txt(40, yy + 2, 8, false, CINZA, 'Boleto: ' + bol)
      yy += 14
    }
  }

  // rodapé legal — o da empresa vale mais que o global
  const rodape = String(emp.rodape_legal || '').trim() || String(cfg.rodape_legal || '')
  if (rodape) {
    const words = rodape.split(' ')
    let line = ''
    let ry = H - 60
    for (let i = 0; i < words.length; i++) {
      if ((line + words[i]).length > 78) {
        txt(40, ry, 8, false, CINZA_TXT, line)
        ry += 10.5
        line = ''
      }
      line += words[i] + ' '
    }
    if (line.trim()) txt(40, ry, 8, false, CINZA_TXT, line)
  }

  // ---------- monta o PDF ----------
  const partes = []
  let pos = 0
  const push = (a) => {
    for (let i = 0; i < a.length; i++) partes.push(a[i])
    pos += a.length
  }
  const pushS = (s) => push(latin(s))
  const offsets = []
  const obj = (n, corpo) => {
    offsets[n] = pos
    pushS(n + ' 0 obj\n' + corpo + '\nendobj\n')
  }

  pushS('%PDF-1.4\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
  )
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const cont = []
  for (let i = 0; i < ops.length; i++) {
    const b = latin(ops[i])
    for (let k = 0; k < b.length; k++) cont.push(b[k])
    cont.push(10)
  }
  offsets[6] = pos
  pushS('6 0 obj\n<< /Length ' + cont.length + ' >>\nstream\n')
  push(cont)
  pushS('\nendstream\nendobj\n')

  const xref = pos
  pushS('xref\n0 7\n0000000000 65535 f \n')
  for (let i = 1; i <= 6; i++) pushS(('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n')
  pushS('trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n')

  // ---------- grava no registro, se pedido ----------
  let salvou = false
  if (String(q.get('salvar') || '') === '1') {
    try {
      const nome =
        'fechamento-' +
        String(emp.nome || 'cliente')
          .replace(/[^A-Za-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase() +
        '-' +
        String(competencia).replace('/', '-') +
        '.pdf'
      const u8 = new Uint8Array(partes.length)
      for (let i = 0; i < partes.length; i++) u8[i] = partes[i]
      fech.set('pdf', $filesystem.fileFromBytes(u8, nome))
      $app.save(fech)
      salvou = true
      console.log('[relatorio] PDF gravado', fech.id, competencia, partes.length, 'bytes')
    } catch (err) {
      console.warn('[relatorio] falha ao gravar PDF', err)
    }
  }

  const u8out = new Uint8Array(partes.length)
  for (let i = 0; i < partes.length; i++) u8out[i] = partes[i]
  const resp = e.response
  resp.header().set('Content-Type', 'application/pdf')
  resp
    .header()
    .set(
      'Content-Disposition',
      'inline; filename="fechamento-' + String(competencia).replace('/', '-') + '.pdf"',
    )
  resp.header().set('X-Relatorio-Salvo', salvou ? '1' : '0')
  resp.header().set('X-Relatorio-Bytes', String(partes.length))
  return resp.write(u8out)
})
