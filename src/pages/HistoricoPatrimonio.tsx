import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { duracao, fmtData, temposDe, type ChamadoTempo } from '@/lib/sla'

interface Manutencao {
  id: string
  equipamento: string
  empresa: string
  patrimonio: string
  data: string
  tipo: 'ajuste' | 'troca_peca' | 'preventiva' | 'instalacao' | 'outro'
  descricao_problema: string
  solucao: string
  pecas: string
  custo_pecas: number
  tecnico: string
  numero_os: string
  chamado: string
  created: string
  expand?: { empresa?: { nome?: string }; equipamento?: { marca_modelo?: string } }
}

interface EquipResumo {
  id: string
  patrimonio: string
  marca_modelo: string
  setor: string
  empresa: string
  ativo: boolean
  expand?: { empresa?: { nome?: string } }
}

const TIPO_LABEL: Record<string, string> = {
  ajuste: 'Ajuste',
  troca_peca: 'Troca de peça',
  preventiva: 'Preventiva',
  instalacao: 'Instalação',
  outro: 'Outro',
}
const TIPO_CLS: Record<string, string> = {
  ajuste: 'bg-teal-600',
  troca_peca: 'bg-amber-600',
  preventiva: 'bg-indigo-600',
  instalacao: 'bg-slate-500',
  outro: 'bg-slate-400',
}
const TIPO_ICO: Record<string, string> = {
  ajuste: '🔧',
  troca_peca: '🧩',
  preventiva: '🛡️',
  instalacao: '📦',
  outro: '•',
}

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// data do registro de manutenção: o campo guarda meio-dia UTC para o dia não
// "voltar" um ao converter para Brasília — mostramos só a data
const fmtDataDia = (s: string) => {
  if (!s) return '—'
  const t = new Date(s.replace(' ', 'T'))
  return isNaN(t.getTime()) ? '—' : t.toLocaleDateString('pt-BR')
}

type Linha =
  | { tipo: 'manutencao'; data: string; m: Manutencao }
  | { tipo: 'chamado'; data: string; c: ChamadoTempo }

// HISTÓRICO DE MANUTENÇÃO POR PATRIMÔNIO (pedido dela 31/10).
// Digita o número do patrimônio (ou parte) → vê a vida da máquina:
// quantos problemas deu, o que foi trocado de peça e o que foi só ajuste.
export default function HistoricoPatrimonio() {
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState(params.get('p') || '')
  const [termo, setTermo] = useState(params.get('p') || '')
  const [equipamentos, setEquipamentos] = useState<EquipResumo[]>([])
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([])
  const [chamados, setChamados] = useState<ChamadoTempo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<EquipResumo | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // formulário
  const [fTipo, setFTipo] = useState<Manutencao['tipo']>('ajuste')
  const [fData, setFData] = useState(() => new Date().toISOString().slice(0, 10))
  const [fProblema, setFProblema] = useState('')
  const [fSolucao, setFSolucao] = useState('')
  const [fPecas, setFPecas] = useState('')
  const [fCusto, setFCusto] = useState('')
  const [fTecnico, setFTecnico] = useState('')
  const [fOs, setFOs] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [eqs, mans, chs] = await Promise.all([
        pb
          .collection('equipamentos')
          .getFullList<EquipResumo>({ sort: 'patrimonio', expand: 'empresa' }),
        pb
          .collection('manutencoes')
          .getFullList<Manutencao>({ sort: '-data,-created', expand: 'empresa,equipamento' }),
        pb
          .collection('chamados')
          .getFullList<ChamadoTempo>({ sort: '-created', expand: 'empresa' }),
      ])
      setEquipamentos(eqs)
      setManutencoes(mans)
      setChamados(chs)
    } catch (e) {
      console.warn(e)
      setErro('Não foi possível carregar o histórico.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // equipamentos que casam com a busca (por patrimônio, marca ou setor)
  const encontrados = useMemo(() => {
    const t = termo.trim().toLowerCase()
    if (!t) return []
    return equipamentos
      .filter(
        (e) =>
          (e.patrimonio || '').toLowerCase().includes(t) ||
          (e.marca_modelo || '').toLowerCase().includes(t) ||
          (e.setor || '').toLowerCase().includes(t),
      )
      .slice(0, 25)
  }, [equipamentos, termo])

  // seleciona automaticamente quando a busca identifica um só
  useEffect(() => {
    if (!termo.trim()) {
      setSelecionado(null)
      return
    }
    if (encontrados.length === 1) setSelecionado(encontrados[0])
  }, [termo, encontrados])

  const buscar = (t: string) => {
    setTermo(t)
    setBusca(t)
    if (t) {
      params.set('p', t)
      setParams(params, { replace: true })
    } else {
      params.delete('p')
      setParams(params, { replace: true })
    }
  }

  // histórico do equipamento selecionado: manutenções + chamados, do mais novo
  const historico = useMemo<Linha[]>(() => {
    if (!selecionado) return []
    const chave = selecionado.patrimonio || ''
    const mans = manutencoes
      .filter((m) => m.equipamento === selecionado.id || (chave && m.patrimonio === chave))
      .map<Linha>((m) => ({ tipo: 'manutencao', data: m.data || m.created, m }))
    const chs = chamados
      .filter(
        (c) =>
          // chamado aponta para o equipamento OU para o patrimônio (chamados
          // antigos podem ter perdido a relação)
          (c as unknown as { equipamento: string }).equipamento === selecionado.id ||
          (chave && c.patrimonio === chave),
      )
      .map<Linha>((c) => ({ tipo: 'chamado', data: c.created, c }))
    return [...mans, ...chs].sort((a, b) => String(b.data).localeCompare(String(a.data)))
  }, [selecionado, manutencoes, chamados])

  // indicadores da máquina
  const stats = useMemo(() => {
    if (!selecionado) return null
    const chave = selecionado.patrimonio || ''
    const mans = manutencoes.filter(
      (m) => m.equipamento === selecionado.id || (chave && m.patrimonio === chave),
    )
    const chs = chamados.filter(
      (c) =>
        (c as unknown as { equipamento: string }).equipamento === selecionado.id ||
        (chave && c.patrimonio === chave),
    )
    const porTipo = { ajuste: 0, troca_peca: 0, preventiva: 0, instalacao: 0, outro: 0 } as Record<
      string,
      number
    >
    let custo = 0
    for (const m of mans) {
      porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1
      custo += Number(m.custo_pecas) || 0
    }
    const resolvidos = chs.filter((c) => c.status === 'resolvido' && c.resolvido_em)
    const tempoMedio =
      resolvidos.length > 0
        ? resolvidos.reduce((a, c) => a + (temposDe(c).total ?? 0), 0) / resolvidos.length
        : null
    const primeira = [...mans.map((m) => m.data), ...chs.map((c) => c.created)]
      .filter(Boolean)
      .sort()[0]
    return {
      problemas: chs.length,
      manutencoes: mans.length,
      trocas: porTipo.troca_peca || 0,
      ajustes: porTipo.ajuste || 0,
      preventivas: porTipo.preventiva || 0,
      custo,
      tempoMedio,
      primeiraOcorrencia: primeira || '',
      porTipo,
    }
  }, [selecionado, manutencoes, chamados])

  const abrirForm = () => {
    setFTipo('ajuste')
    setFData(new Date().toISOString().slice(0, 10))
    setFProblema('')
    setFSolucao('')
    setFPecas('')
    setFCusto('')
    setFTecnico('')
    setFOs('')
    setErro('')
    setFormAberto(true)
  }

  const salvar = async () => {
    if (!selecionado) return
    if (!fProblema.trim() && !fSolucao.trim()) {
      setErro('Descreva o problema ou o serviço feito.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await pb.collection('manutencoes').create({
        equipamento: selecionado.id,
        empresa: selecionado.empresa || '',
        patrimonio: selecionado.patrimonio || '',
        data: fData ? `${fData} 12:00:00.000Z` : new Date().toISOString(),
        tipo: fTipo,
        descricao_problema: fProblema,
        solucao: fSolucao,
        pecas: fPecas,
        custo_pecas: Number(String(fCusto).replace(',', '.')) || 0,
        tecnico: fTecnico,
        numero_os: fOs,
      })
      setFormAberto(false)
      await carregar()
    } catch (e) {
      console.warn(e)
      setErro('Não foi possível salvar o registro.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Histórico de manutenção</h1>
        <p className="text-sm text-muted-foreground">
          Consulte pelo número do patrimônio: quantos problemas a máquina deu, o que foi trocado de
          peça e o que era só ajuste
        </p>
      </div>

      {/* BUSCA */}
      <Card className="mb-5">
        <CardContent className="pt-4">
          <Label className="text-xs">Número do patrimônio (ou parte dele, marca ou setor)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              autoFocus
              placeholder="Ex.: LCCA 0043, 0043, Kyocera…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                buscar(e.target.value)
              }}
            />
            {busca && (
              <Button variant="outline" onClick={() => buscar('')}>
                Limpar
              </Button>
            )}
          </div>

          {encontrados.length > 1 && (
            <div className="mt-3 border rounded-md divide-y">
              {encontrados.map((e) => (
                <button
                  key={e.id}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                  onClick={() => setSelecionado(e)}
                >
                  <div>
                    <span className="font-mono font-semibold text-teal-700">{e.patrimonio}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {e.marca_modelo || '—'} · {e.setor || 'sem setor'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {e.expand?.empresa?.nome || '—'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {termo.trim() && encontrados.length === 0 && !carregando && (
            <p className="text-sm text-muted-foreground mt-3">
              Nenhum equipamento encontrado com “{termo}”.
            </p>
          )}
        </CardContent>
      </Card>

      {erro && !formAberto && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      {selecionado && stats && (
        <>
          {/* CABEÇALHO DA MÁQUINA */}
          <Card className="mb-4 border-l-4 border-l-teal-600">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    Patrimônio
                  </div>
                  <div className="text-2xl font-bold font-mono text-teal-700">
                    {selecionado.patrimonio}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selecionado.marca_modelo || '—'} · {selecionado.setor || 'sem setor'} ·{' '}
                    {selecionado.expand?.empresa?.nome || '—'}
                    {!selecionado.ativo && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        inativo
                      </Badge>
                    )}
                  </div>
                  {stats.primeiraOcorrencia && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Histórico desde {fmtDataDia(stats.primeiraOcorrencia)}
                    </div>
                  )}
                </div>
                <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirForm}>
                  + Registrar manutenção
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* INDICADORES DA MÁQUINA */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Chamados
                </div>
                <div className="text-2xl font-bold text-[#0F2A43]">{stats.problemas}</div>
                <div className="text-xs text-muted-foreground">
                  relatados · {stats.manutencoes} manutenç{stats.manutencoes === 1 ? 'ão' : 'ões'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Trocas de peça
                </div>
                <div className="text-2xl font-bold text-amber-600">{stats.trocas}</div>
                <div className="text-xs text-muted-foreground">
                  {stats.ajustes} ajustes · {stats.preventivas} preventivas
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Custo em peças
                </div>
                <div className="text-2xl font-bold text-[#0F2A43]">{brl(stats.custo)}</div>
                <div className="text-xs text-muted-foreground">acumulado</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Tempo médio
                </div>
                <div className="text-2xl font-bold text-teal-700">
                  {stats.tempoMedio !== null ? duracao(stats.tempoMedio) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">por chamado resolvido</div>
              </CardContent>
            </Card>
          </div>

          {/* LINHA DO TEMPO */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Histórico da máquina{' '}
                <span className="font-normal text-muted-foreground">
                  ({historico.length} registro{historico.length === 1 ? '' : 's'})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum registro ainda para este patrimônio. Use “+ Registrar manutenção” para
                  começar o histórico.
                </p>
              ) : (
                <div className="space-y-3">
                  {historico.map((l) =>
                    l.tipo === 'manutencao' ? (
                      <div key={'m' + l.m.id} className="flex gap-3">
                        <div className="text-xl leading-none pt-0.5">{TIPO_ICO[l.m.tipo]}</div>
                        <div className="flex-1 border rounded-md p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge className={TIPO_CLS[l.m.tipo]}>{TIPO_LABEL[l.m.tipo]}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {fmtDataDia(l.m.data)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {l.m.tecnico && <>por {l.m.tecnico}</>}
                              {l.m.numero_os && <> · OS {l.m.numero_os}</>}
                              {Number(l.m.custo_pecas) > 0 && <> · peças {brl(l.m.custo_pecas)}</>}
                            </div>
                          </div>
                          {l.m.descricao_problema && (
                            <p className="text-sm mt-2">
                              <span className="text-muted-foreground">Problema: </span>
                              {l.m.descricao_problema}
                            </p>
                          )}
                          {l.m.solucao && (
                            <p className="text-sm mt-1">
                              <span className="text-muted-foreground">Serviço: </span>
                              {l.m.solucao}
                            </p>
                          )}
                          {l.m.pecas && (
                            <p className="text-sm mt-1">
                              <span className="text-muted-foreground">Peças: </span>
                              <span className="text-amber-700 font-medium">{l.m.pecas}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div key={'c' + l.c.id} className="flex gap-3">
                        <div className="text-xl leading-none pt-0.5">🔔</div>
                        <div className="flex-1 border rounded-md p-3 bg-slate-50">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">Chamado</Badge>
                              <span className="text-xs text-muted-foreground">
                                {fmtData(l.c.created)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {l.c.status === 'resolvido'
                                ? `resolvido${l.c.resolvido_por ? ' por ' + l.c.resolvido_por : ''}`
                                : l.c.status === 'em_atendimento'
                                  ? 'em atendimento'
                                  : 'aberto'}
                              {l.c.tempo_estimado && ' · tempo estimado'}
                            </div>
                          </div>
                          <p className="text-sm mt-1">{l.c.descricao}</p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* FORM DE NOVO REGISTRO */}
      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar manutenção · {selecionado?.patrimonio}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo de serviço</Label>
                <select
                  className="w-full h-9 rounded-md border bg-transparent px-3 text-sm"
                  value={fTipo}
                  onChange={(e) => setFTipo(e.target.value as Manutencao['tipo'])}
                >
                  <option value="ajuste">Ajuste (sem peça)</option>
                  <option value="troca_peca">Troca de peça</option>
                  <option value="preventiva">Preventiva</option>
                  <option value="instalacao">Instalação</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={fData} onChange={(e) => setFData(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">O que a máquina apresentava</Label>
              <textarea
                className="w-full min-h-16 rounded-md border bg-background p-2 text-sm"
                value={fProblema}
                onChange={(e) => setFProblema(e.target.value)}
                placeholder="Ex.: faixa na impressão, atolamento constante…"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">O que foi feito</Label>
              <textarea
                className="w-full min-h-16 rounded-md border bg-background p-2 text-sm"
                value={fSolucao}
                onChange={(e) => setFSolucao(e.target.value)}
                placeholder="Ex.: limpeza do rolo, regulagem da bandeja…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Peças trocadas</Label>
                <Input
                  value={fPecas}
                  onChange={(e) => setFPecas(e.target.value)}
                  placeholder="Ex.: cilindro fotocondutor"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo das peças (R$)</Label>
                <Input
                  value={fCusto}
                  onChange={(e) => setFCusto(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Técnico</Label>
                <Input
                  value={fTecnico}
                  onChange={(e) => setFTecnico(e.target.value)}
                  placeholder="Quem fez"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nº da OS (opcional)</Label>
                <Input value={fOs} onChange={(e) => setFOs(e.target.value)} />
              </div>
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <div className="flex gap-2 pt-1">
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                disabled={salvando}
                onClick={salvar}
              >
                {salvando ? 'Salvando…' : 'Salvar no histórico'}
              </Button>
              <Button variant="outline" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
