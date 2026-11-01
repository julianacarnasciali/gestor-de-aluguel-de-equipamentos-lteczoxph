import { useEffect, useState, useMemo } from 'react'
import {
  getContratos,
  getLeituras,
  getEquipamentos,
  getFechamentos,
  createFechamento,
  brl,
  pbExport as pb,
  type Contrato,
  type Equipamento,
  type Leitura,
} from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { gerarPdfFechamento } from '@/lib/pdf-fechamento'
import { ReemitirNF } from '@/components/ReemitirNF'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// REGRA DE COBRANÇA (definida pela Juliana em 31/10/2026):
//   competência = MÊS DE USO das páginas (01 a 31 do mês).
//   O relatório é fechado entre o dia 25 e o dia 5 do mês SEGUINTE,
//   e o boleto vence no mês SEGUINTE (ex.: uso de outubro -> competência
//   10/2026 -> vencimento 05/11/2026).
// Antes o vencimento caía no MESMO mês da competência (05/10), ou seja, o
// boleto de outubro nascia vencido antes de a leitura ser tirada — e o Luiz
// precisava corrigir a data na mão em todo fechamento.
const vencimentoPadrao = (competencia: string, diaVenc?: number) => {
  const [mes, ano] = competencia.split('/').map(Number)
  if (!mes || !ano) return ''
  const dia = Number(diaVenc) > 0 ? Number(diaVenc) : 5
  // mês seguinte ao da competência (mes é 1-based, então como índice já é +1);
  // dia 0 do mês posterior = último dia do mês de vencimento, para não estourar
  // (dia 31 em mês de 30 dias virava 01 do mês seguinte).
  const ultimoDoVenc = new Date(ano, mes + 1, 0).getDate()
  const d = new Date(ano, mes, Math.min(dia, ultimoDoVenc))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "10/2026" -> "31/10/2026": último dia do mês da competência, para o período
// do documento (01/mm/aaaa a ultimo/mm/aaaa).
const ultimoDia = (competencia: string) => {
  const [mes, ano] = competencia.split('/').map(Number)
  if (!mes || !ano) return ''
  const ultimo = new Date(ano, mes, 0).getDate()
  return `${String(ultimo).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
}

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

// Competência anterior, para sugerir o mês de uso quando ele difere da
// competência (caso das primeiras leituras, tiradas em outubro sobre setembro).
const competenciaAnterior = (competencia: string) => {
  const [mes, ano] = competencia.split('/').map(Number)
  if (!mes || !ano) return ''
  const m = mes - 1
  return m < 1 ? `12/${ano - 1}` : `${String(m).padStart(2, '0')}/${ano}`
}

export default function Fechamentos() {
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [fechamentos, setFechamentos] = useState<Record<string, unknown>>({})
  const [carregando, setCarregando] = useState(true)
  const [fechando, setFechando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendentes' | 'fechados' | 'todos'>('pendentes')

  // modal de lançamento
  const [modal, setModal] = useState<Contrato | null>(null)
  const [descontoPct, setDescontoPct] = useState('0')
  const [descontoVlr, setDescontoVlr] = useState('0')
  const [dataEmissao, setDataEmissao] = useState('')
  const [dataVenc, setDataVenc] = useState('')
  // Quando a leitura foi tirada e a que mês de uso ela se refere.
  // Caso real (01/11): sistema no ar em outubro, leituras de SETEMBRO tiradas
  // em 04-13/10 — o recibo tem de explicar isso, senão a competência parece erro.
  const [dataLeitura, setDataLeitura] = useState('')
  const [mesReferencia, setMesReferencia] = useState('')
  const [formaPgto, setFormaPgto] = useState('boleto')
  const [mostrarPeriodo, setMostrarPeriodo] = useState(true)
  const [obs, setObs] = useState('')

  useEffect(() => {
    setCarregando(true)
    Promise.all([
      getContratos(),
      getEquipamentos(),
      getLeituras(competencia),
      getFechamentos(competencia),
    ])
      .then(([ctrs, eqs, leis, fechs]) => {
        setContratos(ctrs.filter((c) => c.ativo))
        setEquipamentos(eqs)
        setLeituras(leis)
        const mapa: Record<string, unknown> = {}
        for (const f of fechs) mapa[f.contrato] = f
        setFechamentos(mapa)
      })
      .finally(() => setCarregando(false))
  }, [competencia])

  const calc = (c: Contrato) => {
    const eqsDoContrato = equipamentos.filter((e) => e.contrato === c.id && e.tipo === 'impressora')
    const leiturasDoContrato = leituras.filter((l) =>
      eqsDoContrato.some((e) => e.id === l.equipamento),
    )
    const paginas = leiturasDoContrato.reduce((a, l) => a + (l.paginas_mes ?? 0), 0)
    // REGRA DE FRANQUIA — QUEM MANDA É O CONTRATO (definido pela Juliana 28/10):
    //   tipo_excedente = "por_maquina" -> cada impressora tem a própria franquia
    //     e o que sobra numa NÃO cobre a outra (1.001 numa + 200 noutra = 1 pág
    //     de excedente só na primeira).
    //   tipo_excedente = "total" -> a franquia é a soma do contrato
    //     (paginas_contratadas).
    // O Luiz vai migrando os contratos aos poucos para "por_maquina": basta
    // trocar o campo no contrato, sem mexer no código.
    // ATENÇÃO (fix 28/10): campo number VAZIO no PocketBase volta como 0, não
    // null. Testar "!= null" fazia TODA máquina passar no teste, e a soma dos
    // valores (0) descartava a mensalidade do contrato — a Maxi de R$ 3.960
    // fechava com R$ 0 de mensalidade. Por isso o teste é "> 0".
    const porMaquina = c.tipo_excedente === 'por_maquina'
    const semFranquiaPropria = eqsDoContrato.filter(
      (e) => !(((e as unknown as { franquia_paginas?: number }).franquia_paginas ?? 0) > 0),
    ).length
    // máquina sem franquia própria: divide a franquia do contrato entre as
    // máquinas. Nem herda o total inteiro (daria 18.000 págs livres p/ cada uma
    // na Maxi), nem zera (cobraria TODA página como excedente). Assim o total
    // do contrato é preservado.
    const franquiaRateada =
      semFranquiaPropria > 0
        ? Math.floor((c.paginas_contratadas ?? 0) / Math.max(1, eqsDoContrato.length))
        : 0
    let excedentes = 0
    if (porMaquina) {
      for (const e of eqsDoContrato) {
        const l = leiturasDoContrato.find((x) => x.equipamento === e.id)
        const pags = l?.paginas_mes ?? 0
        const franquiaPropria =
          (e as unknown as { franquia_paginas?: number }).franquia_paginas ?? 0
        const franquia = franquiaPropria > 0 ? franquiaPropria : franquiaRateada
        excedentes += Math.max(0, pags - franquia)
      }
    } else {
      excedentes = Math.max(0, paginas - (c.paginas_contratadas ?? 0))
    }
    const vlrExcedentes = excedentes * (c.preco_excedente ?? 0)
    // VALOR POR MÁQUINA (pedido dela 21/10): se QUALQUER impressora do contrato
    // tiver vlr_mensal lançado, o total de impressoras vira a SOMA dos valores
    // das máquinas ativas (ignora a mensalidade do contrato). Se nenhuma tiver,
    // mantém exatamente o que é cobrado hoje (mensalidade + dispositivos etc.).
    // mesmo fix: "> 0" em vez de "!= null" (ver comentário da franquia acima)
    const comValor = eqsDoContrato.filter(
      (e) => ((e as unknown as { vlr_mensal?: number }).vlr_mensal ?? 0) > 0,
    )
    const somaMaquinas = eqsDoContrato.reduce(
      (a, e) => a + ((e as unknown as { vlr_mensal?: number }).vlr_mensal ?? 0),
      0,
    )
    const vlrImpressoras = comValor.length > 0 ? somaMaquinas : (c.mensalidade ?? 0)
    const fixo =
      vlrImpressoras + (c.vlr_dispositivos ?? 0) + (c.vlr_servidores ?? 0) + (c.vlr_servicos ?? 0)
    const subtotal = fixo + vlrExcedentes
    // AVISO DE CONSUMO EXAGERADO (pedido dela 28/10): ela precisa saber ANTES de
    // cobrar, para conferir ou combinar com o cliente. Dois sinais, ambos
    // conservadores (não disparam no uso normal):
    //  1) o excedente custa mais que a parte fixa do mês — a conta praticamente
    //     dobrou por consumo;
    //  2) uma única máquina passou de 5x a própria franquia.
    const maquinasEstouradas = porMaquina
      ? eqsDoContrato.filter((e) => {
          const l = leiturasDoContrato.find((x) => x.equipamento === e.id)
          const pags = l?.paginas_mes ?? 0
          const propria = (e as unknown as { franquia_paginas?: number }).franquia_paginas ?? 0
          const franquia = propria > 0 ? propria : franquiaRateada
          return franquia > 0 && pags > franquia * 5
        }).length
      : 0
    const sinais: string[] = []
    if (fixo > 0 && vlrExcedentes > fixo) sinais.push('excedente maior que a mensalidade')
    if (maquinasEstouradas > 0)
      sinais.push(`${maquinasEstouradas} máquina(s) acima de 5x a franquia`)
    return {
      suspeitaExagero: sinais.join(' · '),
      eqs: eqsDoContrato,
      paginas,
      excedentes,
      vlrExcedentes,
      fixo,
      subtotal,
      vlrImpressoras,
      somaMaquinas,
      temValoresPorMaquina: comValor.length > 0,
      franquiaPorMaquina: porMaquina,
    }
  }

  const abrirModal = (c: Contrato) => {
    const x = calc(c)
    if (
      x.eqs.length > 0 &&
      x.eqs.length !== leituras.filter((l) => x.eqs.some((e) => e.id === l.equipamento)).length
    ) {
      // tem máquinas sem leitura lançada — o fechamento ainda não deve ser feito
      const faltam =
        x.eqs.length - leituras.filter((l) => x.eqs.some((e) => e.id === l.equipamento)).length
      alert(`Faltam leituras: ${faltam} máquina(s) sem leitura lançada nesta competência.`)
      return
    }
    // consumo fora do padrão: ela pediu p/ ser avisada ANTES de cobrar (28/10)
    if (x.suspeitaExagero) {
      const ok = confirm(
        `⚠ Consumo fora do padrão: ${x.suspeitaExagero}.\n\n` +
          `Total ficaria ${brl(x.subtotal)}.\n\n` +
          `Clique em OK para conferir no detalhe, ou Cancelar para seguir com a emissão assim mesmo.`,
      )
      // OK = quer conferir primeiro, então NÃO abre o fechamento
      if (ok) return
    }
    setModal(c)
    setDescontoPct('0')
    setDescontoVlr('0')
    const hoje = new Date().toISOString().slice(0, 10)
    setDataEmissao(hoje)
    setDataVenc(vencimentoPadrao(competencia, c.dia_vencimento))
    // Data da leitura (pedido 01/11): o padrão tem de ser o dia em que a leitura
    // foi REALMENTE tirada, não hoje. O sistema entrou no ar no começo de
    // outubro e as primeiras leituras — de setembro — foram feitas em outubro;
    // o recibo precisa dizer "leitura realizada em 05/10" para a competência
    // de setembro não parecer erro. Pega a data de criação da leitura mais
    // recente deste contrato nesta competência e cai em hoje se não houver.
    const doContrato = leituras.filter((l) => l.contrato === c.id)
    const datas = doContrato
      .map((l) => String((l as unknown as { created?: string }).created ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()
    const hj = new Date()
    const hojeISO = `${hj.getFullYear()}-${String(hj.getMonth() + 1).padStart(2, '0')}-${String(hj.getDate()).padStart(2, '0')}`
    setDataLeitura(datas.length ? datas[datas.length - 1] : hojeISO)
    setMesReferencia('')
    setObs(c.observacoes ?? '')
  }

  const lancarFechamento = async () => {
    if (!modal) return
    setFechando(modal.id)
    try {
      const x = calc(modal)
      const desconto = (x.subtotal * (Number(descontoPct) || 0)) / 100 + (Number(descontoVlr) || 0)
      const total = Math.max(0, x.subtotal - desconto)
      await createFechamento({
        contrato: modal.id,
        empresa: modal.empresa,
        competencia,
        paginas_consumidas: x.paginas,
        paginas_excedentes: x.excedentes,
        vlr_impressoras: x.vlrImpressoras,
        vlr_excedentes: x.vlrExcedentes,
        vlr_dispositivos: modal.vlr_dispositivos ?? 0,
        vlr_servidores: modal.vlr_servidores ?? 0,
        vlr_servicos: modal.vlr_servicos ?? 0,
        desconto,
        total,
        valor_final: total,
        desconto_percentual: Number(descontoPct) || 0,
        desconto_valor: Number(descontoVlr) || 0,
        tipo_documento: modal.empresa.emite_nf ? 'fatura' : 'documento',
        data_emissao: dataEmissao,
        data_vencimento: dataVenc,
        forma_pgto: formaPgto,
        mostrar_periodo: mostrarPeriodo,
        // PERÍODO = mês inteiro da competência (fix 28/10). Antes gravava
        // `05/${competencia}` nas DUAS pontas e todo recibo saía com
        // "Período: 05/10/2026 a 05/10/2026".
        periodo_de: `01/${competencia}`,
        periodo_ate: ultimoDia(competencia),
        // Quando a leitura foi tirada e a que mês de uso ela se refere.
        // O sistema entrou no ar em outubro/2026 e as primeiras leituras
        // (de setembro) foram tiradas em outubro — o recibo precisa dizer isso.
        data_leitura: dataLeitura || hoje,
        leitura_referencia:
          mesReferencia ||
          `${MESES_PT[Number(competencia.split('/')[0]) - 1]}/${competencia.split('/')[1]}`,
        status: 'emitido',
        observacoes: obs,
      })
      setModal(null)
      await Promise.all([getFechamentos(competencia)]).then(([fechs]) => {
        const mapa: Record<string, unknown> = {}
        for (const f of fechs) mapa[f.contrato] = f
        setFechamentos(mapa)
      })
    } finally {
      setFechando(null)
    }
  }

  const resumo = useMemo(() => {
    let total = 0
    for (const c of contratos) {
      const f = fechamentos[c.id]
      total += f ? Number((f as { total?: number }).total ?? 0) : calc(c).subtotal
    }
    return total
  }, [contratos, fechamentos, leituras, equipamentos])

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Fechamento mensal</h1>
          <p className="text-sm text-muted-foreground">
            Competência {competencia} · total do mês: {brl(resumo)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-32"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            placeholder="MM/AAAA"
          />
          <Button variant="outline" onClick={() => setCompetencia(competencia)}>
            Recarregar
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            {(['pendentes', 'fechados', 'todos'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filtro === f ? 'default' : 'outline'}
                className={filtro === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
                onClick={() => setFiltro(f)}
              >
                {f === 'pendentes' ? 'Pendentes' : f === 'fechados' ? 'Fechados' : 'Todos'}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            {[...contratos]
              .sort((a, b) =>
                (a.expand?.empresa?.nome ?? '').localeCompare(
                  b.expand?.empresa?.nome ?? '',
                  'pt-BR',
                  { sensitivity: 'base' },
                ),
              )
              .filter((c) => {
                const fechado = !!fechamentos[c.id]
                return filtro === 'todos' || (filtro === 'pendentes' ? !fechado : fechado)
              })
              .map((c) => {
                const x = calc(c)
                const fechado = fechamentos[c.id]
                const leiturasOk =
                  x.eqs.length === 0 ||
                  x.eqs.length ===
                    leituras.filter((l) => x.eqs.some((e) => e.id === l.equipamento)).length
                return (
                  <Card key={c.id}>
                    <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-56">
                        <p className="font-medium">{c.expand?.empresa?.nome ?? c.empresa}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.paginas_contratadas?.toLocaleString('pt-BR')} págs · exc.{' '}
                          {brl(c.preco_excedente)}/pág
                          {c.tipo_cobranca === 'media' ? ' · por média' : ''}
                          {c.tipo_excedente === 'por_maquina' ? ' · franquia por máquina' : ''}
                        </p>
                        {x.suspeitaExagero && (
                          <p className="text-xs font-semibold text-red-700 mt-1">
                            ⚠ consumo fora do padrão — confira antes de cobrar
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">págs do mês</p>
                        <p className="font-semibold">{x.paginas.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">excedentes</p>
                        <p className="font-semibold">{brl(x.vlrExcedentes)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">total</p>
                        <p className="font-semibold text-teal-700">
                          {fechado
                            ? brl(Number((fechado as { total?: number }).total))
                            : brl(x.subtotal)}
                        </p>
                      </div>
                      {fechado ? (
                        <>
                          <Badge className="bg-teal-600">Fechado</Badge>
                          {(fechado as { asaas_invoice_status?: string }).asaas_invoice_status ===
                            'AUTHORIZED' && <Badge className="bg-indigo-600">NF autorizada</Badge>}
                          {(fechado as { asaas_invoice_status?: string }).asaas_invoice_status ===
                            'ERROR' && <Badge className="bg-red-600">NF com erro</Badge>}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const f = fechado as { id?: string }
                              if (!f?.id) return
                              const [cfgList, eqs, leis] = await Promise.all([
                                pb.collection('config').getFullList(),
                                getEquipamentos(),
                                getLeituras(competencia),
                              ])
                              const cfg = cfgList[0]
                              const doContrato = eqs.filter(
                                (q) => q.contrato === c.id && q.tipo === 'impressora',
                              )
                              const maquinas = doContrato.map((q) => {
                                const l = leis.find((x) => x.equipamento === q.id)
                                return {
                                  patrimonio: q.patrimonio || q.descricao || q.id,
                                  setor: q.setor || '',
                                  leitura_anterior: l?.leitura_anterior ?? 0,
                                  leitura_atual: l?.leitura_atual ?? 0,
                                  paginas_mes: l?.paginas_mes ?? 0,
                                }
                              })
                              gerarPdfFechamento(
                                f as never,
                                c.expand?.empresa,
                                c,
                                cfg as never,
                                maquinas,
                              )
                            }}
                          >
                            Ver PDF
                          </Button>
                          {(fechado as { asaas_boleto_url?: string }).asaas_boleto_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-teal-600 text-teal-700 hover:bg-teal-50"
                              onClick={() =>
                                window.open(
                                  (fechado as { asaas_boleto_url?: string }).asaas_boleto_url,
                                  '_blank',
                                )
                              }
                            >
                              Boleto
                            </Button>
                          )}
                          {(fechado as { asaas_invoice_url?: string }).asaas_invoice_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                              onClick={() =>
                                window.open(
                                  (fechado as { asaas_invoice_url?: string }).asaas_invoice_url,
                                  '_blank',
                                )
                              }
                            >
                              NF
                            </Button>
                          )}
                          {(fechado as { asaas_invoice_id?: string }).asaas_invoice_id &&
                            !(fechado as { asaas_invoice_url?: string }).asaas_invoice_url && (
                              <Badge variant="secondary" className="animate-pulse">
                                NF na fila da prefeitura…
                              </Badge>
                            )}
                          {(fechado as { asaas_invoice_url?: string }).asaas_invoice_url ||
                          !(fechado as { asaas_invoice_id?: string }).asaas_invoice_id ? (
                            <ReemitirNF
                              colecao="fechamentos"
                              id={(fechado as { id?: string }).id}
                              onOk={() => window.location.reload()}
                            />
                          ) : (
                            <Badge variant="secondary" className="animate-pulse">
                              Emitindo NF…
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={async () => {
                              const f = fechado as { id?: string }
                              if (!f?.id) return
                              if (
                                !confirm(
                                  'Apagar este fechamento de teste? Ele sai da lista e o contrato volta para Pendentes.',
                                )
                              )
                                return
                              await pb.collection('fechamentos').delete(f.id)
                              setFechamentos((prev) => {
                                const novo = { ...prev }
                                delete novo[c.id]
                                return novo
                              })
                            }}
                          >
                            Excluir
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-teal-600 hover:bg-teal-700"
                          disabled={!leiturasOk || fechando === c.id}
                          onClick={() => abrirModal(c)}
                        >
                          Fechar mês
                        </Button>
                      )}{' '}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </>
      )}

      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar fechamento — {modal?.expand?.empresa?.nome}</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="grid gap-3 py-2">
              {(() => {
                const x = calc(modal)
                const desconto =
                  (x.subtotal * (Number(descontoPct) || 0)) / 100 + (Number(descontoVlr) || 0)
                const total = Math.max(0, x.subtotal - desconto)
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p>
                        Impressoras:{' '}
                        <strong>
                          {x.temValoresPorMaquina
                            ? `${brl(x.somaMaquinas)} (soma das ${x.eqs.length} máquinas)`
                            : brl(modal.mensalidade)}
                        </strong>
                      </p>
                      <p>
                        Dispositivos: <strong>{brl(modal.vlr_dispositivos)}</strong>
                      </p>
                      <p>
                        Servidor: <strong>{brl(modal.vlr_servidores)}</strong>
                      </p>
                      <p>
                        Serviços: <strong>{brl(modal.vlr_servicos)}</strong>
                      </p>
                      <p>
                        Excedentes ({x.excedentes.toLocaleString('pt-BR')} págs):{' '}
                        <strong>{brl(x.vlrExcedentes)}</strong>
                        {x.franquiaPorMaquina && (
                          <span className="block text-xs text-amber-700">
                            cálculo por máquina (franquia individual)
                          </span>
                        )}
                        {x.suspeitaExagero && (
                          <span className="block text-xs font-semibold text-red-700">
                            ⚠ consumo fora do padrão ({x.suspeitaExagero}) — confira antes de cobrar
                          </span>
                        )}
                      </p>
                      <p>
                        Subtotal: <strong>{brl(x.subtotal)}</strong>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Desconto %</Label>
                        <Input
                          inputMode="decimal"
                          value={descontoPct}
                          onChange={(e) => setDescontoPct(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Desconto R$</Label>
                        <Input
                          inputMode="decimal"
                          value={descontoVlr}
                          onChange={(e) => setDescontoVlr(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Data de emissão</Label>
                        <Input
                          type="date"
                          value={dataEmissao}
                          onChange={(e) => setDataEmissao(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Data de vencimento</Label>
                        <Input
                          type="date"
                          value={dataVenc}
                          onChange={(e) => setDataVenc(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Forma de pagamento</Label>
                        <select
                          className="w-full rounded-md border bg-transparent p-2 text-sm"
                          value={formaPgto}
                          onChange={(e) => setFormaPgto(e.target.value)}
                        >
                          <option value="boleto">Boleto</option>
                          <option value="pix">Pix</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="transferencia">Transferência</option>
                          <option value="cartao">Cartão</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Mostrar período</Label>
                        <select
                          className="w-full rounded-md border bg-transparent p-2 text-sm"
                          value={mostrarPeriodo ? 'sim' : 'nao'}
                          onChange={(e) => setMostrarPeriodo(e.target.value === 'sim')}
                        >
                          <option value="sim">Sim</option>
                          <option value="nao">Não</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Data da leitura</Label>
                        <Input
                          type="date"
                          value={dataLeitura}
                          onChange={(e) => setDataLeitura(e.target.value)}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Quando o contador foi lido
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label>Mês de uso</Label>
                        <select
                          className="w-full rounded-md border bg-transparent p-2 text-sm"
                          value={mesReferencia}
                          onChange={(e) => setMesReferencia(e.target.value)}
                        >
                          <option value="">
                            Mesmo da competência ({MESES_PT[Number(competencia.split('/')[0]) - 1]})
                          </option>
                          <option
                            value={`${MESES_PT[Number(competenciaAnterior(competencia).split('/')[0]) - 1]}/${competenciaAnterior(competencia).split('/')[1]}`}
                          >
                            Mês anterior (
                            {MESES_PT[Number(competenciaAnterior(competencia).split('/')[0]) - 1]}/
                            {competenciaAnterior(competencia).split('/')[1]})
                          </option>
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                          As páginas são deste mês
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Observações</Label>
                      <Input value={obs} onChange={(e) => setObs(e.target.value)} />
                    </div>
                    <div className="rounded-md bg-slate-50 border p-3 text-right">
                      <p className="text-sm text-muted-foreground">Total final</p>
                      <p className="text-2xl font-bold text-teal-700">{brl(total)}</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setModal(null)}>
                        Cancelar
                      </Button>
                      <Button
                        className="bg-teal-600 hover:bg-teal-700"
                        onClick={lancarFechamento}
                        disabled={fechando === modal.id}
                      >
                        {fechando === modal.id ? 'Lançando...' : 'Lançar fechamento'}
                      </Button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
