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
  doc.setFontSize(9.5)
  doc.setTextColor(228, 238, 244)
  doc.text(`${config.razao_social || ''}  ·  CNPJ ${config.cnpj || ''}`, 40, 55)
  doc.setFontSize(9)
  doc.text(
    `${config.endereco || ''}  ·  ${config.cidade_uf || ''}  ·  ${config.telefone || ''}  ·  ${config.email || ''}`,
    40,
    68,
  )

  // título
  // Campos novos (mig 0047) — o cast evita quebrar fechamentos antigos que
  // ainda não têm os valores gravados.
  const fechExt = fech as unknown as { data_leitura?: string; leitura_referencia?: string }
  const ehFatura = fech.tipo_documento === 'fatura'
  // MODO CONTRATO (05/11/2026): cobrança mensal pelo valor do contrato.
  // O documento mostra SÓ o valor mensal — não cita leitura, contador nem
  // páginas impressas, porque nesse modo não existe leitura nenhuma.
  // Fechamentos normais (por leitura) continuam com a tabela de máquinas.
  const somenteContrato =
    (fech as unknown as { cobranca_contrato?: boolean }).cobranca_contrato === true
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
  // Linha de referência do documento. A competência é o MÊS DE USO (regra da
  // Juliana, 31/10), então o período mostrado tem de ser o mês medido — antes
  // aparecia o período da competência com outro nome e o recibo saía
  // inconsistente (ex.: competência 11/2026 com páginas de outubro).
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

  // Nota da data da leitura (pedido 01/11): o sistema entrou no ar no começo de
  // outubro e as primeiras leituras foram tiradas em outubro — mas se referem
  // ao uso de setembro. Deixar isso escrito evita a leitura parecer errada.
  let notaLeitura = ''
  if (!somenteContrato && fechExt.data_leitura) {
    const dl = String(fechExt.data_leitura).slice(0, 10).split('-').reverse().join('/')
    notaLeitura = `Leitura realizada em ${dl}`
    if (fechExt.leitura_referencia)
      notaLeitura += ` — apurada pelo contador e referente ao uso de ${fechExt.leitura_referencia}`
  }
  if (notaLeitura) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(...CINZA)
    doc.text(notaLeitura, 40, 185, { maxWidth: W - 80 })
  }

  // tabela de leituras — NÃO existe no modo contrato (não há máquina/leitura)
  let y = notaLeitura ? 198 : 186
  if (!somenteContrato) {
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
  }

  // cards de resumo
  const cardY = y + 16
  const cardW = (W - 80 - 30) / 3
  // No modo contrato há UM cartão só, com o valor mensal. Nada de páginas nem
  // de excedente: foi o pedido dela (05/11).
  const cards = somenteContrato
    ? [{ label: 'Valor mensal do contrato', valor: brl(fech.valor_final || fech.total), cor: NAVY }]
    : [
        { label: 'Páginas do mês', valor: String(fech.paginas_consumidas ?? 0), cor: NAVY },
        { label: 'Excedentes', valor: brl(fech.vlr_excedentes), cor: TEAL },
        { label: 'Total', valor: brl(fech.valor_final || fech.total), cor: NAVY },
      ]
  const larguraCard = somenteContrato ? W - 80 : cardW
  cards.forEach((c, i) => {
    const x = somenteContrato ? 40 : 40 + i * (cardW + 15)
    doc.setFillColor(...c.cor)
    doc.rect(x, cardY, larguraCard, 56, 'F')
    doc.setTextColor(235, 244, 248)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(c.label, x + 10, cardY + 17)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(somenteContrato ? 18 : 14)
    doc.text(c.valor, x + 10, somenteContrato ? cardY + 42 : cardY + 40)
  })

  // composição
  let yy = cardY + 78
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  // No modo contrato não entra a linha de excedentes: não há excedente cobrado.
  const linhas: [string, number][] = somenteContrato
    ? [
        ['Impressoras (mensalidade)', fech.vlr_impressoras],
        ['Dispositivos (comodato)', fech.vlr_dispositivos],
        ['Servidores', fech.vlr_servidores],
        ['Serviços', fech.vlr_servicos],
      ]
    : [
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

  // rodapé legal (fonte maior p/ leitura impressa — pedido 08/10)
  // POR CLIENTE (28/10): se a empresa tem rodapé próprio, vale o dela; senão
  // cai no texto global da config. Alguns financeiros (Jandira) exigem o texto
  // antigo, e trocar o global mudaria o documento de todos os clientes.
  const rodape = (empresa?.rodape_legal || '').trim() || config.rodape_legal || ''
  if (rodape) {
    const words = rodape.split(' ')
    let line = ''
    let ry = H - 60
    doc.setFontSize(8)
    doc.setTextColor(55, 65, 81)
    for (const w of words) {
      if ((line + w).length > 78) {
        doc.text(line, 40, ry)
        ry += 10.5
        line = ''
      }
      line += w + ' '
    }
    if (line.trim()) doc.text(line, 40, ry)
  }

  doc.save(`fechamento-${empresa?.nome ?? 'cliente'}-${fech.competencia.replace('/', '-')}.pdf`)
}
