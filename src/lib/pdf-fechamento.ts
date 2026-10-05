import { jsPDF } from 'jspdf'
import type { Fechamento, Empresa, Contrato } from '@/services/gestor'

const NAVY: [number, number, number] = [15, 42, 67]
const TEAL: [number, number, number] = [13, 148, 136]
const CINZA: [number, number, number] = [107, 114, 128]
const ZEBRA: [number, number, number] = [244, 246, 248]

export const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function gerarPdfFechamento(
  fech: Fechamento,
  empresa: Empresa | undefined,
  contrato: Contrato | undefined,
  config: {
    nome_fantasia?: string
    razao_social?: string
    cnpj?: string
    endereco?: string
    cidade_uf?: string
    telefone?: string
    email?: string
    rodape_legal?: string
  },
  maquinas: {
    patrimonio: string
    setor: string
    leitura_anterior: number
    leitura_atual: number
    paginas_mes: number
  }[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const W = 595
  const H = 842

  // faixa superior navy
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 80, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(config.nome_fantasia || 'LCCA Tecnologia', 40, 38)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(190, 205, 215)
  doc.text(`${config.razao_social || ''}  ·  CNPJ ${config.cnpj || ''}`, 40, 55)
  doc.setFontSize(7.5)
  doc.text(
    `${config.endereco || ''}  ·  ${config.cidade_uf || ''}  ·  ${config.telefone || ''}  ·  ${config.email || ''}`,
    40,
    68,
  )

  // título
  const ehFatura = fech.tipo_documento === 'fatura'
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.text(
    ehFatura ? 'FATURA - COBRANCA DE LOCACAO DE BENS MOVEIS' : 'RECIBO DE LOCACAO DE BENS MOVEIS',
    40,
    106,
  )

  // destinatário
  doc.setFontSize(10.5)
  doc.setTextColor(26, 32, 38)
  doc.text('Cliente: ' + (empresa?.nome ?? ''), 40, 130)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...CINZA)
  doc.text('CNPJ/CPF: ' + (empresa?.cnpj_cpf ?? ''), 40, 145)
  if (empresa?.endereco) doc.text('Endereço: ' + empresa.endereco, 40, 158)
  let linhaRef = 'Competência: ' + fech.competencia
  if (fech.mostrar_periodo) linhaRef += `  ·  Período: ${fech.periodo_de} a ${fech.periodo_ate}`
  linhaRef +=
    '  ·  Vencimento: ' +
    String(fech.data_vencimento || '')
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/')
  doc.text(linhaRef, 40, 173)

  // tabela de leituras
  let y = 186
  doc.setFillColor(...NAVY)
  doc.rect(40, y, W - 80, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.8)
  const cols = [40, 148, 232, 312, 396, 462]
  const heads = ['Máquina', 'Setor', 'Leitura ant.', 'Leitura atual', 'Páginas', 'Excedente']
  heads.forEach((h, i) => doc.text(h, cols[i] + 5, y + 12.5))

  y += 18
  maquinas.forEach((m, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(...ZEBRA)
      doc.rect(40, y, W - 80, 17, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(26, 32, 38)
    doc.text((m.patrimonio || '-').slice(0, 20), cols[0] + 5, y + 12)
    doc.text((m.setor || '-').slice(0, 16), cols[1] + 5, y + 12)
    doc.text(String(m.leitura_anterior), cols[2] + 5, y + 12)
    doc.text(String(m.leitura_atual), cols[3] + 5, y + 12)
    doc.text(String(m.paginas_mes), cols[4] + 5, y + 12)
    doc.setTextColor(...CINZA)
    doc.text('-', cols[5] + 5, y + 12)
    y += 17
  })

  // cards de resumo
  const cardY = y + 16
  const cardW = (W - 80 - 30) / 3
  const cards = [
    { label: 'Páginas do mês', valor: String(fech.paginas_consumidas ?? 0), cor: NAVY },
    { label: 'Excedentes', valor: brl(fech.vlr_excedentes), cor: TEAL },
    { label: 'Total', valor: brl(fech.valor_final || fech.total), cor: NAVY },
  ]
  cards.forEach((c, i) => {
    const x = 40 + i * (cardW + 15)
    doc.setFillColor(...c.cor)
    doc.rect(x, cardY, cardW, 50, 'F')
    doc.setTextColor(215, 228, 235)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.text(c.label, x + 10, cardY + 16)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(c.valor, x + 10, cardY + 38)
  })

  // composição
  let yy = cardY + 78
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  const linhas: [string, number][] = [
    ['Impressoras (mensalidade)', fech.vlr_impressoras],
    ['Dispositivos (comodato)', fech.vlr_dispositivos],
    ['Servidores', fech.vlr_servidores],
    ['Serviços', fech.vlr_servicos],
    [`Excedentes (${fech.paginas_excedentes ?? 0} págs)`, fech.vlr_excedentes],
  ]
  for (const [lbl, v] of linhas) {
    if ((Number(v) || 0) === 0 && !lbl.includes('Excedentes')) continue
    doc.setTextColor(...CINZA)
    doc.text(lbl, 40, yy)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 32, 38)
    doc.text(brl(v), 250, yy)
    doc.setFont('helvetica', 'normal')
    yy += 13.5
  }
  const desc = Number(fech.desconto) || 0
  if (desc > 0) {
    doc.setTextColor(...CINZA)
    doc.text('Desconto', 40, yy)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(204, 51, 51)
    doc.text('- ' + brl(desc), 250, yy)
    doc.setFont('helvetica', 'normal')
    yy += 13.5
  }

  if (fech.forma_pgto) {
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text('Forma de pagamento: ' + fech.forma_pgto, 40, yy + 4)
    yy += 14
    if (fech.asaas_boleto_url) {
      doc.text('Boleto: ' + fech.asaas_boleto_url, 40, yy + 2, { maxWidth: W - 80 })
      yy += 14
    }
  }

  // rodapé legal
  if (config.rodape_legal) {
    const words = config.rodape_legal.split(' ')
    let line = ''
    let ry = H - 55
    doc.setFontSize(6.5)
    doc.setTextColor(...CINZA)
    for (const w of words) {
      if ((line + w).length > 95) {
        doc.text(line, 40, ry)
        ry += 8.5
        line = ''
      }
      line += w + ' '
    }
    if (line.trim()) doc.text(line, 40, ry)
  }

  doc.save(`fechamento-${empresa?.nome ?? 'cliente'}-${fech.competencia.replace('/', '-')}.pdf`)
}
