// Régua única de tempo dos chamados (30/10).
// Usada pela tela de Chamados e pelo Relatório de Tempos — se as duas
// calculassem por conta própria, um dia dariam números diferentes.
//
// TRÊS TEMPOS DIFERENTES (e o que cada um prova para o cliente):
//  1. resposta  = aberto → iniciado    "quanto o técnico demorou para pegar"
//  2. execução  = iniciado → resolvido "quanto tempo de mão de obra levou"
//  3. total     = aberto → resolvido   "do problema à solução"
//
// `tempo_estimado` marca os chamados anteriores ao SLA: neles os horários
// vieram do campo `updated` (aproximação), não de clique real. Esses NUNCA
// entram nas médias oficiais — só aparecem separados, para não vender
// estimativa como medição.

export interface ChamadoTempo {
  id: string
  empresa: string
  patrimonio: string
  setor: string
  prioridade: string
  status: string
  created: string
  iniciado_em: string
  resolvido_em: string
  iniciado_por: string
  resolvido_por: string
  sla_horas: number
  prazo_em: string
  tempo_estimado: boolean
  expand?: { empresa?: { nome?: string } }
}

const HORA = 3600 * 1000

const ms = (s: string): number | null => {
  if (!s) return null
  const t = new Date(s.replace(' ', 'T')).getTime()
  return isNaN(t) ? null : t
}

/** duração legível: "2h 15min", "1d 4h", "—" */
export const duracao = (v: number): string => {
  if (!isFinite(v) || v < 0) return '—'
  const min = Math.round(v / 60000)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

export const duracaoHoras = (v: number): number =>
  isFinite(v) && v > 0 ? Math.round((v / HORA) * 10) / 10 : 0

// ESCALA DO GRÁFICO (correção 31/10): arredondar para 1 casa em horas fazia
// um atendimento de 2min virar 0h e a barra desaparecer — o gráfico aparecia
// só com os eixos e parecia não existir. Regra: até 90min a escala é em
// MINUTOS; acima disso, em horas.
export interface EscalaGrafico {
  unidade: 'min' | 'h'
  fator: number // divide o ms para chegar no número da barra
  sufixo: string
  rotulo: string
}

export const escolherEscala = (valoresMs: number[]): EscalaGrafico => {
  const maior = Math.max(0, ...valoresMs.filter((v) => isFinite(v) && v > 0))
  if (maior < 90 * 60000) {
    return { unidade: 'min', fator: 60000, sufixo: 'min', rotulo: 'minutos' }
  }
  return { unidade: 'h', fator: HORA, sufixo: 'h', rotulo: 'horas' }
}

/** valor da barra na unidade da escala, com precisão suficiente para não zerar */
export const valorNaEscala = (ms: number, escala: EscalaGrafico): number => {
  if (!isFinite(ms) || ms <= 0) return 0
  const v = ms / escala.fator
  if (escala.unidade === 'min') return Math.max(1, Math.round(v))
  return Math.max(0.1, Math.round(v * 10) / 10)
}

export interface Tempos {
  resposta: number | null // aberto → iniciado
  execucao: number | null // iniciado → resolvido
  total: number | null // aberto → resolvido
  dentroDoPrazo: boolean | null
  estimado: boolean
}

/** os três tempos de um chamado, em ms */
export const temposDe = (c: ChamadoTempo): Tempos => {
  const abertura = ms(c.created)
  const inicio = ms(c.iniciado_em)
  const fim = ms(c.resolvido_em)
  let prazo = ms(c.prazo_em)
  if (prazo === null && abertura !== null && c.sla_horas > 0) {
    prazo = abertura + c.sla_horas * HORA
  }
  return {
    resposta: abertura !== null && inicio !== null ? Math.max(0, inicio - abertura) : null,
    execucao: inicio !== null && fim !== null ? Math.max(0, fim - inicio) : null,
    total: abertura !== null && fim !== null ? Math.max(0, fim - abertura) : null,
    dentroDoPrazo: fim !== null && prazo !== null ? fim <= prazo : null,
    estimado: !!c.tempo_estimado,
  }
}

/** situação do SLA (badge da tela) */
export type Situacao =
  | 'no_prazo'
  | 'em_risco'
  | 'atrasado'
  | 'concluido'
  | 'concluido_atraso'
  | 'sem_meta'

export const situacaoSla = (
  c: ChamadoTempo,
  agora = Date.now(),
): { tipo: Situacao; rotulo: string; cls: string; detalhe: string } => {
  const abertura = ms(c.created)
  let prazo = ms(c.prazo_em)
  if (prazo === null && abertura !== null && c.sla_horas > 0) {
    prazo = abertura + c.sla_horas * HORA
  }
  if (prazo === null) {
    return { tipo: 'sem_meta', rotulo: 'sem meta', cls: 'bg-slate-300', detalhe: '' }
  }
  const fim = ms(c.resolvido_em)
  if (c.status === 'resolvido') {
    if (fim === null) {
      return { tipo: 'concluido', rotulo: 'resolvido', cls: 'bg-slate-500', detalhe: '' }
    }
    const dentro = fim <= prazo
    return {
      tipo: dentro ? 'concluido' : 'concluido_atraso',
      rotulo: dentro ? '✓ no prazo' : '✗ fora do prazo',
      cls: dentro ? 'bg-emerald-600' : 'bg-rose-700',
      detalhe: `levou ${duracao(fim - (abertura ?? fim))} · meta ${c.sla_horas}h`,
    }
  }
  const restante = prazo - agora
  if (restante < 0) {
    return {
      tipo: 'atrasado',
      rotulo: `atrasado ${duracao(-restante)}`,
      cls: 'bg-rose-600',
      detalhe: `venceu em ${new Date(prazo).toLocaleString('pt-BR')}`,
    }
  }
  const total = c.sla_horas * HORA
  const risco = total > 0 && restante / total < 0.25
  return {
    tipo: risco ? 'em_risco' : 'no_prazo',
    rotulo: `faltam ${duracao(restante)}`,
    cls: risco ? 'bg-amber-500' : 'bg-teal-600',
    detalhe: `prazo ${new Date(prazo).toLocaleString('pt-BR')}`,
  }
}

export interface Resumo {
  chamados: number
  resolvidos: number
  emAberto: number
  respostaMedia: number | null
  execucaoMedia: number | null
  totalMedio: number | null
  totalMediano: number | null
  pctNoPrazo: number | null
  maisLongo: number | null
}

/** média só do que foi MEDIDO (nunca inclui tempo estimado) */
export const resumir = (lista: ChamadoTempo[]): Resumo => {
  const medidos = lista.filter((c) => !c.tempo_estimado)
  const resolvidos = medidos.filter((c) => c.status === 'resolvido' && ms(c.resolvido_em))
  const respostas = resolvidos
    .map((c) => temposDe(c).resposta)
    .filter((v): v is number => v !== null)
  const execucoes = resolvidos
    .map((c) => temposDe(c).execucao)
    .filter((v): v is number => v !== null)
  const totais = resolvidos.map((c) => temposDe(c).total).filter((v): v is number => v !== null)
  const media = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  const mediana = (arr: number[]) => {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    const meio = Math.floor(s.length / 2)
    return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2
  }
  const comPrazo = resolvidos
    .map((c) => temposDe(c).dentroDoPrazo)
    .filter((v): v is boolean => v !== null)
  return {
    chamados: medidos.length,
    resolvidos: resolvidos.length,
    emAberto: medidos.filter((c) => c.status !== 'resolvido').length,
    respostaMedia: media(respostas),
    execucaoMedia: media(execucoes),
    totalMedio: media(totais),
    totalMediano: mediana(totais),
    pctNoPrazo: comPrazo.length
      ? Math.round((comPrazo.filter(Boolean).length / comPrazo.length) * 100)
      : null,
    maisLongo: totais.length ? Math.max(...totais) : null,
  }
}

/** agrupa por chave arbitrária e resume cada grupo */
export const agrupar = (
  lista: ChamadoTempo[],
  chave: (c: ChamadoTempo) => string,
): { nome: string; itens: ChamadoTempo[]; resumo: Resumo }[] => {
  const mapa = new Map<string, ChamadoTempo[]>()
  for (const c of lista) {
    const k = chave(c) || '—'
    const arr = mapa.get(k) || []
    arr.push(c)
    mapa.set(k, arr)
  }
  return Array.from(mapa.entries())
    .map(([nome, itens]) => ({ nome, itens, resumo: resumir(itens) }))
    .sort((a, b) => (b.resumo.totalMedio ?? 0) - (a.resumo.totalMedio ?? 0))
}

export const nomeEmpresa = (c: ChamadoTempo) => c.expand?.empresa?.nome || '—'

/** mês de abertura no formato AAAA-MM (para filtrar período) */
export const mesDe = (c: ChamadoTempo) => (c.created || '').slice(0, 7)

export const fmtData = (s: string) => {
  const t = ms(s)
  return t === null ? '—' : new Date(t).toLocaleString('pt-BR')
}
