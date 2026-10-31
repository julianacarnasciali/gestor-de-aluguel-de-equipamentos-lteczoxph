// ALERTA DE TROCA DE EQUIPAMENTO (pedido dela 31/10 — "sugestão 2".
// Uma máquina que dá muito problema deixa de ser lucrativa: consome visita
// técnica e peça. O alerta aponta as candidatas ANTES de o cliente reclamar.
//
// HONESTIDADE DO CRITÉRIO: não existe número universal de "quantas
// manutenções é demais". Os limiares abaixo são um PONTO DE PARTIDA
// calibrável na tela — a LCCA ajusta com o histórico real dela. O padrão foi
// escolhido de forma conservadora (só aponta o que é claramente excessivo):
//   · 4+ manutenções CORRETIVAS em 12 meses (ajuste ou troca de peça);
//   · ou R$ 500+ em peças em 12 meses.
// Preventiva e instalação NÃO contam: são manutenção sadia, não defeito.

import { type ChamadoTempo } from '@/lib/sla'

export interface ManutencaoAlerta {
  id: string
  equipamento: string
  patrimonio: string
  data: string
  tipo: string
  custo_pecas: number
}

export interface EquipAlerta {
  id: string
  patrimonio: string
  marca_modelo: string
  setor: string
  ativo: boolean
  vlr_mensal: number
  empresa: string
  expand?: { empresa?: { nome?: string } }
}

export interface LimiaresAlerta {
  qtd12m: number
  custo12m: number
}

export const LIMIAR_PADRAO: LimiaresAlerta = { qtd12m: 4, custo12m: 500 }

export type NivelAlerta = 'critico' | 'atencao'

export interface AlertaTroca {
  equipamento: EquipAlerta
  /** manutenções corretivas nos últimos 12 meses */
  corretivas: number
  /** preventivas nos últimos 12 meses (contexto: preventiva em dia é bom) */
  preventivas: number
  /** custo de peças nos últimos 12 meses */
  custoPecas: number
  /** chamados abertos nos últimos 12 meses */
  chamados: number
  /** tempos total acumulado de atendimento, em ms (se medido) */
  tempoTotal: number
  nivel: NivelAlerta
  motivos: string[]
  /** custo das peças ÷ (mensalidade × 12) — "% do que a máquina rende no ano" */
  proporcaoReceita: number | null
  primeiraOcorrencia: string
  ultimaOcorrencia: string
}

const HORA = 3600 * 1000
const DIA = 24 * HORA
const CORRETIVAS = ['ajuste', 'troca_peca']

const ms = (s: string): number | null => {
  if (!s) return null
  const t = new Date(String(s).replace(' ', 'T')).getTime()
  return isNaN(t) ? null : t
}

/**
 * Calcula as máquinas candidatas a troca.
 * @param equipamentos lista de equipamentos (com empresa expandida)
 * @param manutencoes registros de manutenção
 * @param chamados chamados técnicos
 * @param limiares limites calibráveis
 * @param hoje referência de "agora" (para teste)
 */
export const calcularAlertas = (
  equipamentos: EquipAlerta[],
  manutencoes: ManutencaoAlerta[],
  chamados: (ChamadoTempo & { equipamento?: string })[],
  limiares: LimiaresAlerta = LIMIAR_PADRAO,
  hoje = Date.now(),
): AlertaTroca[] => {
  const limite = hoje - 365 * DIA

  // agrupa por equipamento E por patrimônio (chamados antigos podem ter
  // perdido a relação com o equipamento, mas mantêm o patrimônio)
  const porEquip = new Map<string, ManutencaoAlerta[]>()
  const porPatrim = new Map<string, ManutencaoAlerta[]>()
  for (const m of manutencoes) {
    const t = ms(m.data) ?? ms((m as unknown as { created?: string }).created ?? '')
    if (t === null || t < limite) continue
    if (m.equipamento) {
      const a = porEquip.get(m.equipamento) || []
      a.push(m)
      porEquip.set(m.equipamento, a)
    }
    if (m.patrimonio) {
      const a = porPatrim.get(m.patrimonio) || []
      a.push(m)
      porPatrim.set(m.patrimonio, a)
    }
  }

  const chsPorEquip = new Map<string, (ChamadoTempo & { equipamento?: string })[]>()
  const chsPorPatrim = new Map<string, ChamadoTempo[]>()
  for (const c of chamados) {
    const t = ms(c.created)
    if (t === null || t < limite) continue
    if (c.equipamento) {
      const a = chsPorEquip.get(c.equipamento) || []
      a.push(c)
      chsPorEquip.set(c.equipamento, a)
    }
    if (c.patrimonio) {
      const a = chsPorPatrim.get(c.patrimonio) || []
      a.push(c)
      chsPorPatrim.set(c.patrimonio, a)
    }
  }

  const resultado: AlertaTroca[] = []

  for (const eq of equipamentos) {
    const chave = eq.patrimonio || ''
    const mans = [...(porEquip.get(eq.id) || []), ...(chave ? porPatrim.get(chave) || [] : [])]
    // dedup por id (o mesmo registro pode casar pelos dois caminhos)
    const vistos = new Set<string>()
    const listaMans = mans.filter((m) => (vistos.has(m.id) ? false : (vistos.add(m.id), true)))

    const chs = [...(chsPorEquip.get(eq.id) || []), ...(chave ? chsPorPatrim.get(chave) || [] : [])]
    const vistosC = new Set<string>()
    const listaChs = chs.filter((c) => (vistosC.has(c.id) ? false : (vistosC.add(c.id), true)))

    const corretivas = listaMans.filter((m) => CORRETIVAS.includes(m.tipo)).length
    const preventivas = listaMans.filter((m) => m.tipo === 'preventiva').length
    const custoPecas = listaMans.reduce((a, m) => a + (Number(m.custo_pecas) || 0), 0)

    // só entra na lista quem tem algum sinal — não poluir com máquina sã
    if (corretivas === 0 && custoPecas === 0 && listaChs.length === 0) continue

    const motivos: string[] = []
    if (corretivas >= limiares.qtd12m) {
      motivos.push(`${corretivas} manutenções corretivas em 12 meses (limite ${limiares.qtd12m})`)
    }
    if (limiares.custo12m > 0 && custoPecas >= limiares.custo12m) {
      motivos.push(
        `R$ ${custoPecas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em peças em 12 meses (limite R$ ${limiares.custo12m.toLocaleString('pt-BR')})`,
      )
    }

    if (motivos.length === 0) continue

    const receitaAno = (Number(eq.vlr_mensal) || 0) * 12
    const proporcaoReceita = receitaAno > 0 ? custoPecas / receitaAno : null

    // nível: crítico quando estoura os DOIS critérios ou quando as peças
    // passam de 50% do que a máquina rende no ano (aí ela dá prejuízo)
    const estouraQtd = corretivas >= limiares.qtd12m
    const estouraCusto = limiares.custo12m > 0 && custoPecas >= limiares.custo12m
    const prejuizo = proporcaoReceita !== null && proporcaoReceita >= 0.5
    const nivel: NivelAlerta =
      estouraQtd && estouraCusto ? 'critico' : prejuizo ? 'critico' : 'atencao'

    if (prejuizo) {
      motivos.push(
        `peças já custaram ${Math.round(proporcaoReceita! * 100)}% do que a máquina rende em 12 meses`,
      )
    }

    const datas = [
      ...listaMans.map((m) => m.data).filter(Boolean),
      ...listaChs.map((c) => c.created).filter(Boolean),
    ].sort()

    resultado.push({
      equipamento: eq,
      corretivas,
      preventivas,
      custoPecas,
      chamados: listaChs.length,
      tempoTotal: listaChs.reduce((a, c) => {
        if (c.status !== 'resolvido' || !c.resolvido_em) return a
        const ini = ms(c.created)
        const fim = ms(c.resolvido_em)
        return ini !== null && fim !== null ? a + Math.max(0, fim - ini) : a
      }, 0),
      nivel,
      motivos,
      proporcaoReceita,
      primeiraOcorrencia: datas[0] || '',
      ultimaOcorrencia: datas[datas.length - 1] || '',
    })
  }

  // críticos primeiro, depois por custo de peças
  return resultado.sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel === 'critico' ? -1 : 1
    return b.custoPecas - a.custoPecas
  })
}

/** quantas máquinas estão em cada nível */
export const contarAlertas = (alertas: AlertaTroca[]) => ({
  total: alertas.length,
  criticos: alertas.filter((a) => a.nivel === 'critico').length,
  atencao: alertas.filter((a) => a.nivel === 'atencao').length,
})
