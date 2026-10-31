import { jsPDF } from 'jspdf'
import {
  duracao,
  escolherEscala,
  temposDe,
  valorNaEscala,
  type ChamadoTempo,
  type Resumo,
} from '@/lib/sla'

const NAVY: [number, number, number] = [15, 42, 67]
const TEAL: [number, number, number] = [13, 148, 136]
const CINZA: [number, number, number] = [107, 114, 128]
const ZEBRA: [number, number, number] = [244, 246, 248]

const fmtData = (s: string) => {
  if (!s) return '—'
  const t = new Date(s.replace(' ', 'T'))
  return isNaN(t.getTime())
    ? '—'
    : t.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

interface Args {
  periodo: string
  resumo: Resumo
  grupos: { nome: string; itens: ChamadoTempo[]; resumo: Resumo }[]
  chamados: ChamadoTempo[]
  agrupamento: 'empresa' | 'responsavel' | 'prioridade'
  incluirEstimados: boolean
}

// PDF do relatório de tempos — documento de apresentação ao cliente.
// jsPDF NÃO aceita URL remota em addImage: a logo entra como dataURL
// (lição de 23/10, aplicada aqui).
export async function gerarPdfTempos(args: Args) {
  const { periodo, resumo, grupos, chamados, agrupamento, incluirEstimados } = args
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const W = 595
  const H = 842
  const M = 40

  const logoDataUrl = await carregarLogo()

  const cabecalho = (titulo: string) => {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, W, 82, 'F')
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', M, 18, 165, 42)
      } catch {
        /* logo opcional */
      }
    }
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(titulo, M, 74)
  }

  const rodape = (pagina: number) => {
    doc.setFillColor(...NAVY)
    doc.rect(0, H - 40, W, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(
      'LCCA INFORMATICA LTDA · CNPJ 07.667.971/0001-39 · Curitiba/PR · (41) 98406-4557 · contato@lccatech.com',
      M,
      H - 24,
    )
    doc.setTextColor(180, 200, 210)
    doc.text(`Tempos medidos pelo sistema · página ${pagina}`, M, H - 12)
  }

  // ---------- PÁGINA 1: RESUMO ----------
  cabecalho('RELATÓRIO DE TEMPOS DE ATENDIMENTO')

  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Tempos de atendimento técnico', M, 116)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...CINZA)
  doc.text(`Período: ${periodo}`, M, 134)
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, M, 147)

  // cards de resumo
  const cardsY = 170
  const cardW = (W - 2 * M - 3 * 10) / 4
  const cards = [
    {
      label: 'Tempo médio total',
      valor: resumo.totalMedio !== null ? duracao(resumo.totalMedio) : '—',
    },
    {
      label: '1ª resposta (média)',
      valor: resumo.respostaMedia !== null ? duracao(resumo.respostaMedia) : '—',
    },
    {
      label: 'Mão de obra (média)',
      valor: resumo.execucaoMedia !== null ? duracao(resumo.execucaoMedia) : '—',
    },
    { label: 'Resolvidos', valor: String(resumo.resolvidos) },
  ]
  cards.forEach((c, i) => {
    const x = M + i * (cardW + 10)
    doc.setFillColor(i === 0 ? 15 : 240, i === 0 ? 42 : 244, i === 0 ? 67 : 248)
    doc.rect(x, cardsY, cardW, 54, 'F')
    doc.setTextColor(...(i === 0 ? ([255, 255, 255] as [number, number, number]) : CINZA))
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(c.label, x + 8, cardsY + 15)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...(i === 0 ? ([255, 255, 255] as [number, number, number]) : NAVY))
    doc.text(c.valor, x + 8, cardsY + 38)
  })

  // linhas de contexto
  let y = cardsY + 78
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(26, 32, 38)
  const linha = (rotulo: string, valor: string) => {
    doc.setTextColor(...CINZA)
    doc.text(rotulo, M, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 32, 38)
    doc.text(valor, M + 210, y)
    doc.setFont('helvetica', 'normal')
    y += 15
  }
  linha('Chamados medidos no período', String(resumo.chamados))
  linha('Chamados em aberto', String(resumo.emAberto))
  linha('Mediana do tempo total', resumo.totalMediano !== null ? duracao(resumo.totalMediano) : '—')
  linha('Atendimento mais longo', resumo.maisLongo !== null ? duracao(resumo.maisLongo) : '—')
  linha(
    'Resolvidos dentro da meta',
    resumo.pctNoPrazo !== null ? `${resumo.pctNoPrazo}%` : 'sem meta comparada',
  )

  // como os tempos são medidos — transparência que sustenta o número
  y += 8
  doc.setFontSize(7.5)
  doc.setTextColor(...CINZA)
  const nota =
    'Como os tempos são medidos: cada chamado é aberto pelo QR code do equipamento e o técnico ' +
    'clica "Iniciar atendimento" ao começar e "Marcar resolvido" ao terminar. A 1ª resposta é o ' +
    'intervalo entre a abertura e o início; a mão de obra, entre o início e a conclusão; o tempo ' +
    'total vai da abertura à conclusão. São medições registradas pelo próprio sistema, não estimativas.'
  const notaFinal = incluirEstimados
    ? nota +
      ' Este relatório inclui chamados antigos com horário aproximado, sinalizados como estimados.'
    : nota
  const linhasNota = doc.splitTextToSize(notaFinal, W - 2 * M)
  doc.text(linhasNota, M, y)

  rodape(1)

  // ---------- PÁGINA 2: GRÁFICO + POR GRUPO ----------
  const tituloGrupo =
    agrupamento === 'empresa'
      ? 'cliente'
      : agrupamento === 'responsavel'
        ? 'responsável'
        : 'prioridade'
  doc.addPage()
  cabecalho('TEMPOS POR ' + tituloGrupo.toUpperCase())
  let gy = 112

  // GRÁFICO DE BARRAS (pedido dela 31/10: "não criou gráfico, somente um
  // relatório"). Desenhado com retângulos vetoriais do próprio jsPDF.
  const comTempo = grupos.filter((g) => g.resumo.totalMedio !== null && g.resumo.totalMedio > 0)
  if (comTempo.length > 0) {
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Tempo médio total por ${tituloGrupo}`, M, gy)
    gy += 8

    const escala = escolherEscala(comTempo.map((g) => g.resumo.totalMedio as number))
    const areaX = M + 88
    const areaW = W - M - areaX - 10
    const areaY = gy + 12
    const linhaH = 20
    const areaH = Math.min(comTempo.length, 8) * linhaH + 26
    const maior = Math.max(
      ...comTempo.map((g) => valorNaEscala(g.resumo.totalMedio as number, escala)),
    )
    const itens = comTempo.slice(0, 8)

    // grade + eixos
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    const passos = 4
    for (let i = 0; i <= passos; i++) {
      const x = areaX + (areaW * i) / passos
      doc.line(x, areaY, x, areaY + itens.length * linhaH)
      doc.setTextColor(...CINZA)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      const v = (maior * i) / passos
      doc.text(
        `${Math.round(v * 10) / 10}${escala.sufixo}`,
        x - 6,
        areaY + itens.length * linhaH + 9,
      )
    }

    itens.forEach((g, i) => {
      const yy = areaY + i * linhaH
      // nome do grupo (truncado)
      doc.setTextColor(26, 32, 38)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.text(String(g.nome).slice(0, 24), M, yy + 10)
      // barra
      const valor = valorNaEscala(g.resumo.totalMedio as number, escala)
      const larg = maior > 0 ? (valor / maior) * areaW : 0
      doc.setFillColor(...TEAL)
      doc.rect(areaX, yy + 2, Math.max(2, larg), linhaH - 7, 'F')
      // valor na ponta
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(...NAVY)
      doc.text(duracao(g.resumo.totalMedio as number), areaX + larg + 3, yy + 10)
    })

    gy = areaY + itens.length * linhaH + 24
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.5)
    doc.setTextColor(...CINZA)
    doc.text(
      `Escala em ${escala.rotulo}. Cada barra é a média de tempo total (abertura até conclusão) do grupo.`,
      M,
      gy,
    )
    gy += 22
  }

  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`Detalhe por ${tituloGrupo}`, M, gy)
  gy += 20

  const colG = [M, M + 170, M + 235, M + 300, M + 365, M + 435]
  const headsG = ['Grupo', 'Chamados', 'Resolv.', '1ª resp.', 'Mão de obra', 'Total']
  doc.setFillColor(...NAVY)
  doc.rect(M, gy, W - 2 * M, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7.5)
  headsG.forEach((h, i) => doc.text(h, colG[i] + 4, gy + 12))
  gy += 18

  grupos.forEach((g, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(...ZEBRA)
      doc.rect(M, gy, W - 2 * M, 16, 'F')
    }
    doc.setTextColor(26, 32, 38)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(String(g.nome).slice(0, 32), colG[0] + 4, gy + 11)
    doc.text(String(g.resumo.chamados), colG[1] + 4, gy + 11)
    doc.text(String(g.resumo.resolvidos), colG[2] + 4, gy + 11)
    doc.text(
      g.resumo.respostaMedia !== null ? duracao(g.resumo.respostaMedia) : '—',
      colG[3] + 4,
      gy + 11,
    )
    doc.text(
      g.resumo.execucaoMedia !== null ? duracao(g.resumo.execucaoMedia) : '—',
      colG[4] + 4,
      gy + 11,
    )
    doc.setFont('helvetica', 'bold')
    doc.text(
      g.resumo.totalMedio !== null ? duracao(g.resumo.totalMedio) : '—',
      colG[5] + 4,
      gy + 11,
    )
    gy += 16
    if (gy > H - 80) {
      rodape(doc.getNumberOfPages())
      doc.addPage()
      cabecalho('TEMPOS POR ' + tituloGrupo.toUpperCase())
      gy = 116
    }
  })

  // ---------- PÁGINA 3+: CHAMADO A CHAMADO ----------
  rodape(doc.getNumberOfPages())
  doc.addPage()
  cabecalho('DETALHE CHAMADO A CHAMADO')
  let cy = 116
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Cada atendimento', M, cy)
  cy += 20

  const colC = [M, M + 88, M + 190, M + 265, M + 330, M + 395, M + 460]
  const headsC = ['Aberto', 'Cliente', 'Patrim.', 'Atendeu', '1ª resp.', 'M. obra', 'Total']
  const desenhaCab = () => {
    doc.setFillColor(...NAVY)
    doc.rect(M, cy, W - 2 * M, 18, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7)
    headsC.forEach((h, i) => doc.text(h, colC[i] + 3, cy + 12))
    cy += 18
  }
  desenhaCab()

  chamados.forEach((c, idx) => {
    const t = temposDe(c)
    if (idx % 2 === 1) {
      doc.setFillColor(...ZEBRA)
      doc.rect(M, cy, W - 2 * M, 15, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(26, 32, 38)
    doc.text(fmtData(c.created), colC[0] + 3, cy + 10)
    doc.text(String(c.expand?.empresa?.nome || '—').slice(0, 22), colC[1] + 3, cy + 10)
    doc.text(String(c.patrimonio || '—').slice(0, 13), colC[2] + 3, cy + 10)
    doc.text(String(c.resolvido_por || c.iniciado_por || '—').slice(0, 12), colC[3] + 3, cy + 10)
    doc.text(t.resposta !== null ? duracao(t.resposta) : '—', colC[4] + 3, cy + 10)
    doc.text(t.execucao !== null ? duracao(t.execucao) : '—', colC[5] + 3, cy + 10)
    doc.setFont('helvetica', 'bold')
    doc.text(t.total !== null ? duracao(t.total) : '—', colC[6] + 3, cy + 10)
    cy += 15
    if (cy > H - 60) {
      rodape(doc.getNumberOfPages())
      doc.addPage()
      cabecalho('DETALHE CHAMADO A CHAMADO')
      cy = 116
      desenhaCab()
    }
  })

  rodape(doc.getNumberOfPages())
  doc.save(`relatorio-tempos-${periodo.replace(/[/\s]/g, '-')}.pdf`)
}

/** baixa a logo e converte para dataURL (jsPDF não aceita URL remota) */
async function carregarLogo(): Promise<string> {
  try {
    const r = await fetch(
      'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/ib0smsxri8sw6q2/full_branco_y8024354gz.png',
    )
    if (!r.ok) return ''
    const blob = await r.blob()
    return await new Promise<string>((res) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}
