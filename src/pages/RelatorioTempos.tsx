import { useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  agrupar,
  duracao,
  escolherEscala,
  fmtData,
  mesDe,
  nomeEmpresa,
  resumir,
  situacaoSla,
  temposDe,
  valorNaEscala,
  type ChamadoTempo,
} from '@/lib/sla'
import { gerarPdfTempos } from '@/lib/pdf-tempos'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const PRIO_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}
const PRIO_CLS: Record<string, string> = {
  baixa: 'bg-slate-400',
  media: 'bg-teal-600',
  alta: 'bg-amber-500',
  urgente: 'bg-red-600',
}

type Agrupamento = 'empresa' | 'responsavel' | 'prioridade'

// RELATÓRIO DE TEMPOS REAIS (pedido dela 30/10): quantificar quanto o
// atendimento realmente leva — não a meta, o medido. É material de venda:
// o dono do cliente mostra quanto o funcionário demorou para pegar e resolver.
export default function RelatorioTempos() {
  const [chamados, setChamados] = useState<ChamadoTempo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mes, setMes] = useState('') // '' = tudo
  const [agrupamento, setAgrupamento] = useState<Agrupamento>('empresa')
  const [incluirEstimados, setIncluirEstimados] = useState(false)

  useEffect(() => {
    pb.collection('chamados')
      .getFullList<ChamadoTempo>({ sort: '-created', expand: 'empresa' })
      .then(setChamados)
      .finally(() => setCarregando(false))
  }, [])

  const meses = useMemo(() => {
    const set = new Set(chamados.map(mesDe).filter(Boolean))
    return Array.from(set).sort().reverse()
  }, [chamados])

  const filtrados = useMemo(() => {
    const base = mes ? chamados.filter((c) => mesDe(c) === mes) : chamados
    return incluirEstimados ? base : base.filter((c) => !c.tempo_estimado)
  }, [chamados, mes, incluirEstimados])

  const resumo = useMemo(() => resumir(filtrados), [filtrados])
  const grupos = useMemo(
    () =>
      agrupar(filtrados, (c) =>
        agrupamento === 'empresa'
          ? nomeEmpresa(c)
          : agrupamento === 'responsavel'
            ? c.resolvido_por || c.iniciado_por || 'sem responsável'
            : PRIO_LABEL[c.prioridade] || c.prioridade,
      ),
    [filtrados, agrupamento],
  )

  const estimados = useMemo(() => chamados.filter((c) => c.tempo_estimado).length, [chamados])

  // ESCALA ADAPTATIVA (correção 31/10): em minutos quando os tempos são
  // curtos, senão a barra de 2min virava 0h e o gráfico ficava só com eixos.
  const escala = escolherEscala(grupos.map((g) => g.resumo.totalMedio ?? 0).filter((v) => v > 0))
  const dadosBarras = grupos
    .filter((g) => g.resumo.totalMedio !== null)
    .slice(0, 10)
    .map((g) => ({
      nome: g.nome.length > 16 ? g.nome.slice(0, 15) + '…' : g.nome,
      valor: valorNaEscala(g.resumo.totalMedio ?? 0, escala),
    }))

  const tituloPeriodo = mes
    ? `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`
    : 'Todo o período'

  const exportar = () => {
    gerarPdfTempos({
      periodo: tituloPeriodo,
      resumo,
      grupos,
      chamados: filtrados,
      agrupamento,
      incluirEstimados,
    })
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tempos de atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Quanto o atendimento realmente levou — medido pelos cliques em iniciar e resolver
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700"
          onClick={exportar}
          disabled={filtrados.length === 0}
        >
          📄 Exportar PDF
        </Button>
      </div>

      {/* FILTROS */}
      <Card className="mb-5">
        <CardContent className="pt-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <select
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            >
              <option value="">Todo o período</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {MESES[Number(m.slice(5, 7)) - 1]}/{m.slice(0, 4)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Agrupar por</Label>
            <select
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as Agrupamento)}
            >
              <option value="empresa">Empresa (cliente)</option>
              <option value="responsavel">Quem atendeu</option>
              <option value="prioridade">Prioridade</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirEstimados}
              onChange={(e) => setIncluirEstimados(e.target.checked)}
            />
            Incluir chamados antigos (tempo estimado)
          </label>
        </CardContent>
      </Card>

      {estimados > 0 && !incluirEstimados && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <b>{estimados} chamado(s) antigo(s)</b> ficaram de fora: foram abertos antes do controle
          de tempo existir e os horários deles são aproximados. Números de venda devem sair daqui —
          do que foi medido de verdade.
        </div>
      )}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {/* INDICADORES */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Tempo médio
                </div>
                <div className="text-2xl font-bold text-[#0F2A43]">
                  {resumo.totalMedio !== null ? duracao(resumo.totalMedio) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  mediana {resumo.totalMediano !== null ? duracao(resumo.totalMediano) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  1ª resposta
                </div>
                <div className="text-2xl font-bold text-teal-700">
                  {resumo.respostaMedia !== null ? duracao(resumo.respostaMedia) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">abertura → início</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Mão de obra
                </div>
                <div className="text-2xl font-bold text-[#0F2A43]">
                  {resumo.execucaoMedia !== null ? duracao(resumo.execucaoMedia) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">início → conclusão</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Resolvidos
                </div>
                <div className="text-2xl font-bold">{resumo.resolvidos}</div>
                <div className="text-xs text-muted-foreground">
                  {resumo.pctNoPrazo !== null
                    ? `${resumo.pctNoPrazo}% no prazo`
                    : 'sem meta comparada'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* GRÁFICO — mostrado sempre que houver QUALQUER chamado; sem número
    medido ele explica o vazio em vez de simplesmente sumir (foi o
    que aconteceu em 31/10: a tela parecia só um relatório). */}
          <Card className="mb-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Tempo médio total por{' '}
                {agrupamento === 'empresa'
                  ? 'cliente'
                  : agrupamento === 'responsavel'
                    ? 'responsável'
                    : 'prioridade'}{' '}
                <span className="font-normal text-muted-foreground">({escala.rotulo})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dadosBarras.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dadosBarras} margin={{ left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="nome" fontSize={11} angle={-20} textAnchor="end" height={55} />
                    <YAxis
                      fontSize={11}
                      tickFormatter={(v) => `${v}${escala.sufixo}`}
                      allowDecimals={escala.unidade === 'h'}
                    />
                    <Tooltip formatter={(v) => `${v}${escala.sufixo}`} />
                    <Bar dataKey="valor" fill="#0d9488" radius={[4, 4, 0, 0]} minPointSize={3} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center text-center gap-2 border border-dashed rounded-md">
                  <div className="text-3xl">📊</div>
                  <p className="text-sm font-medium">
                    O gráfico nasce com o primeiro atendimento medido
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Nenhum chamado foi <b>iniciado e resolvido pelo painel</b> neste período, então
                    não há tempo real para desenhar. Marcar “incluir antigos (estimado)” não
                    preenche o gráfico de propósito: número aproximado não serve para apresentar a
                    cliente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TABELA POR GRUPO */}
          <Card className="mb-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Detalhe por{' '}
                {agrupamento === 'empresa'
                  ? 'cliente'
                  : agrupamento === 'responsavel'
                    ? 'responsável'
                    : 'prioridade'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-right">Chamados</TableHead>
                    <TableHead className="text-right">Resolvidos</TableHead>
                    <TableHead className="text-right">1ª resposta</TableHead>
                    <TableHead className="text-right">Mão de obra</TableHead>
                    <TableHead className="text-right">Tempo total</TableHead>
                    <TableHead className="text-right">No prazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => (
                    <TableRow key={g.nome}>
                      <TableCell className="font-medium">{g.nome}</TableCell>
                      <TableCell className="text-right">{g.resumo.chamados}</TableCell>
                      <TableCell className="text-right">{g.resumo.resolvidos}</TableCell>
                      <TableCell className="text-right">
                        {g.resumo.respostaMedia !== null ? duracao(g.resumo.respostaMedia) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {g.resumo.execucaoMedia !== null ? duracao(g.resumo.execucaoMedia) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {g.resumo.totalMedio !== null ? duracao(g.resumo.totalMedio) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {g.resumo.pctNoPrazo !== null ? `${g.resumo.pctNoPrazo}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {grupos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Sem chamados medidos neste período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* CHAMADO A CHAMADO */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Chamado a chamado</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aberto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Patrimônio</TableHead>
                    <TableHead>Atendeu</TableHead>
                    <TableHead className="text-right">1ª resposta</TableHead>
                    <TableHead className="text-right">Mão de obra</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((c) => {
                    const t = temposDe(c)
                    const s = situacaoSla(c)
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtData(c.created)}
                        </TableCell>
                        <TableCell className="text-sm">{nomeEmpresa(c)}</TableCell>
                        <TableCell className="font-mono text-xs text-teal-700">
                          {c.patrimonio || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.resolvido_por || c.iniciado_por || '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {t.resposta !== null ? duracao(t.resposta) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {t.execucao !== null ? duracao(t.execucao) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          {t.total !== null ? duracao(t.total) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={s.cls}>{s.rotulo}</Badge>
                          {c.tempo_estimado && (
                            <span className="ml-1 text-[10px] text-amber-700">estimado</span>
                          )}
                          {c.prioridade && (
                            <Badge className={`ml-1 ${PRIO_CLS[c.prioridade]}`}>
                              {PRIO_LABEL[c.prioridade]}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filtrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Sem chamados neste período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
