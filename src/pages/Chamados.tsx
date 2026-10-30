import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { duracao, situacaoSla, type ChamadoTempo } from '@/lib/sla'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Chamado {
  id: string
  equipamento: string
  empresa: string
  patrimonio: string
  setor: string
  contato: string
  descricao: string
  video: string
  foto: string
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  status: 'aberto' | 'em_atendimento' | 'resolvido'
  resolucao: string
  created: string
  updated: string
  // SLA (30/10)
  iniciado_em: string
  resolvido_em: string
  iniciado_por: string
  resolvido_por: string
  sla_horas: number
  prazo_em: string
  tempo_estimado: boolean
  expand?: {
    equipamento?: { marca_modelo?: string }
    empresa?: { nome?: string }
  }
}

interface MetasSla {
  urgente: number
  alta: number
  media: number
  baixa: number
}

const PRIO_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'URGENTE',
}
const PRIO_CLS: Record<string, string> = {
  baixa: 'bg-slate-400',
  media: 'bg-teal-600',
  alta: 'bg-amber-500',
  urgente: 'bg-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
}
const META_PADRAO: MetasSla = { urgente: 4, alta: 8, media: 24, baixa: 48 }

// As réguas de tempo (duracao / situacaoSla / prazoDe) vivem em lib/sla.ts —
// a MESMA que o Relatório de Tempos usa. Se cada tela calculasse por conta
// própria, um dia mostrariam números diferentes para o mesmo chamado.
const prazoDe = (c: ChamadoTempo): number | null => {
  if (c.prazo_em) return new Date(c.prazo_em.replace(' ', 'T')).getTime()
  if (c.sla_horas > 0) {
    return new Date(c.created.replace(' ', 'T')).getTime() + c.sla_horas * 3600 * 1000
  }
  return null
}

const emAtendimentoOuAberto = (c: Chamado) => c.status !== 'resolvido'

// Tela de Chamados com CONTROLE DE SLA (pedido dela 30/10).
// Luiz recebe o e-mail → clica em "Iniciar atendimento" (abre o chamado já
// logado) → ao terminar, "Marcar resolvido". Cada clique carimba a hora no
// banco (iniciado_em / resolvido_em), então o SLA é medido de verdade.
export default function Chamados() {
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<'abertos' | 'resolvidos' | 'todos'>('abertos')
  const [detalhe, setDetalhe] = useState<Chamado | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [metas, setMetas] = useState<MetasSla>(META_PADRAO)
  const [configId, setConfigId] = useState('')
  const [editandoMetas, setEditandoMetas] = useState(false)
  const [metasTemp, setMetasTemp] = useState<MetasSla>(META_PADRAO)
  const [params, setParams] = useSearchParams()

  const carregar = useCallback(
    () =>
      pb
        .collection('chamados')
        .getFullList<Chamado>({ sort: '-created', expand: 'equipamento,empresa' })
        .then((lista) => {
          setChamados(lista)
          // link do e-mail: /chamados?abrir=<id> → abre o chamado direto
          const alvo = params.get('abrir')
          if (alvo) {
            const achado = lista.find((c) => c.id === alvo)
            if (achado) setDetalhe(achado)
            params.delete('abrir')
            setParams(params, { replace: true })
          }
        })
        .finally(() => setCarregando(false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const carregarMetas = useCallback(async () => {
    try {
      const lista = await pb.collection('config').getFullList({ perPage: 1 })
      if (lista.length > 0) {
        const c = lista[0] as Record<string, number | string>
        setConfigId(String(c.id))
        const m: MetasSla = {
          urgente: Number(c.sla_urgente_horas) || META_PADRAO.urgente,
          alta: Number(c.sla_alta_horas) || META_PADRAO.alta,
          media: Number(c.sla_media_horas) || META_PADRAO.media,
          baixa: Number(c.sla_baixa_horas) || META_PADRAO.baixa,
        }
        setMetas(m)
        setMetasTemp(m)
      }
    } catch {
      /* config opcional — segue com o padrão */
    }
  }, [])

  useEffect(() => {
    carregar()
    carregarMetas()
  }, [carregar, carregarMetas])

  // re-renderiza a cada minuto para o "faltam X" não envelhecer na tela
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const lista = useMemo(() => {
    return chamados
      .filter((c) =>
        filtro === 'todos'
          ? true
          : filtro === 'abertos'
            ? c.status !== 'resolvido'
            : c.status === 'resolvido',
      )
      .sort((a, b) => {
        // atrasados primeiro, depois prioridade, depois mais recente
        const ordem: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 }
        const atrasadoA = emAtendimentoOuAberto(a) && situacaoSla(a).tipo === 'atrasado' ? 0 : 1
        const atrasadoB = emAtendimentoOuAberto(b) && situacaoSla(b).tipo === 'atrasado' ? 0 : 1
        if (atrasadoA !== atrasadoB) return atrasadoA - atrasadoB
        if (ordem[a.prioridade] !== ordem[b.prioridade])
          return ordem[a.prioridade] - ordem[b.prioridade]
        return b.created.localeCompare(a.created)
      })
  }, [chamados, filtro])

  // indicadores do topo
  const stats = useMemo(() => {
    const abertos = chamados.filter(emAtendimentoOuAberto)
    const atrasados = abertos.filter((c) => situacaoSla(c).tipo === 'atrasado').length
    const noPrazo = abertos.length - atrasados
    const resolvidos = chamados.filter((c) => c.status === 'resolvido' && c.resolvido_em)
    const tempos = resolvidos.map(
      (c) =>
        new Date(c.resolvido_em.replace(' ', 'T')).getTime() -
        new Date(c.created.replace(' ', 'T')).getTime(),
    )
    const media = tempos.length > 0 ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0
    const dentroDoPrazo = resolvidos.filter((c) => situacaoSla(c).tipo === 'concluido').length
    const pctPrazo =
      resolvidos.length > 0 ? Math.round((dentroDoPrazo / resolvidos.length) * 100) : 0
    return {
      abertos: abertos.length,
      atrasados,
      noPrazo,
      media,
      resolvidos: resolvidos.length,
      pctPrazo,
    }
  }, [chamados])

  const nomeUsuario = () => {
    const r = pb.authStore.record as unknown as { name?: string; email?: string } | null
    return r?.name || r?.email || 'painel'
  }

  const iniciar = async (c: Chamado) => {
    setSalvando(true)
    setErro('')
    try {
      const agora = new Date().toISOString()
      await pb.collection('chamados').update<Chamado>(c.id, {
        status: 'em_atendimento',
        iniciado_em: agora,
        iniciado_por: nomeUsuario(),
      })
      setDetalhe(null)
      await carregar()
    } catch (e) {
      setErro('Não foi possível iniciar o atendimento. Tente de novo.')
      console.warn(e)
    } finally {
      setSalvando(false)
    }
  }

  const resolver = async (c: Chamado) => {
    setSalvando(true)
    setErro('')
    try {
      const agora = new Date().toISOString()
      await pb.collection('chamados').update<Chamado>(c.id, {
        status: 'resolvido',
        resolvido_em: agora,
        resolvido_por: nomeUsuario(),
        // se resolveram sem clicar em "iniciar", marca o início na abertura
        iniciado_em: c.iniciado_em || c.created,
      })
      setDetalhe(null)
      await carregar()
    } catch (e) {
      setErro('Não foi possível marcar como resolvido. Tente de novo.')
      console.warn(e)
    } finally {
      setSalvando(false)
    }
  }

  const reabrir = async (c: Chamado) => {
    setSalvando(true)
    try {
      await pb.collection('chamados').update<Chamado>(c.id, {
        status: 'em_atendimento',
        resolvido_em: '',
        resolvido_por: '',
      })
      setDetalhe(null)
      await carregar()
    } catch {
      setErro('Não foi possível reabrir.')
    } finally {
      setSalvando(false)
    }
  }

  const salvarMetas = async () => {
    if (!configId) return
    setSalvando(true)
    try {
      await pb.collection('config').update(configId, {
        sla_urgente_horas: Number(metasTemp.urgente) || 0,
        sla_alta_horas: Number(metasTemp.alta) || 0,
        sla_media_horas: Number(metasTemp.media) || 0,
        sla_baixa_horas: Number(metasTemp.baixa) || 0,
      })
      setMetas(metasTemp)
      setEditandoMetas(false)
    } catch {
      setErro('Não foi possível salvar as metas.')
    } finally {
      setSalvando(false)
    }
  }

  const sit = detalhe ? situacaoSla(detalhe) : null

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chamados técnicos</h1>
          <p className="text-sm text-muted-foreground">
            Abertos via QR code do patrimônio · controle de SLA por prioridade
          </p>
        </div>
        <div className="flex gap-2">
          {(['abertos', 'resolvidos', 'todos'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? 'default' : 'outline'}
              className={filtro === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
              onClick={() => setFiltro(f)}
            >
              {f === 'abertos' ? 'Abertos' : f === 'resolvidos' ? 'Resolvidos' : 'Todos'}
            </Button>
          ))}
        </div>
      </div>

      {/* PAINEL DE SLA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Em aberto</div>
            <div className="text-2xl font-bold text-[#0F2A43]">{stats.abertos}</div>
            <div className="text-xs text-muted-foreground">{stats.noPrazo} dentro do prazo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Atrasados</div>
            <div
              className={`text-2xl font-bold ${stats.atrasados > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
            >
              {stats.atrasados}
            </div>
            <div className="text-xs text-muted-foreground">passaram da meta</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Tempo médio</div>
            <div className="text-2xl font-bold text-teal-700">
              {stats.media > 0 ? duracao(stats.media) : '—'}
            </div>
            <div className="text-xs text-muted-foreground">{stats.resolvidos} resolvidos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">No prazo</div>
            <div
              className={`text-2xl font-bold ${stats.pctPrazo >= 90 ? 'text-emerald-600' : stats.pctPrazo >= 70 ? 'text-amber-600' : 'text-rose-600'}`}
            >
              {stats.resolvidos > 0 ? `${stats.pctPrazo}%` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">dos concluídos</div>
          </CardContent>
        </Card>
      </div>

      {/* METAS DE SLA (editáveis) */}
      <Card className="mb-5">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Metas de SLA por prioridade{' '}
            <span className="font-normal text-muted-foreground">(horas corridas)</span>
          </CardTitle>
          {!editandoMetas ? (
            <Button size="sm" variant="outline" onClick={() => setEditandoMetas(true)}>
              Ajustar metas
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditandoMetas(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700"
                disabled={salvando}
                onClick={salvarMetas}
              >
                Salvar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!editandoMetas ? (
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {(['urgente', 'alta', 'media', 'baixa'] as const).map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <Badge className={PRIO_CLS[p]}>{PRIO_LABEL[p]}</Badge>
                  <b>{metas[p]}h</b>
                </div>
              ))}
              <span className="text-xs text-muted-foreground self-center">
                O prazo é gravado na abertura do chamado — mudar a meta não altera o histórico.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['urgente', 'alta', 'media', 'baixa'] as const).map((p) => (
                <div key={p} className="space-y-1">
                  <Label className="text-xs flex items-center gap-2">
                    <Badge className={PRIO_CLS[p]}>{PRIO_LABEL[p]}</Badge> horas
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={metasTemp[p]}
                    onChange={(e) => setMetasTemp({ ...metasTemp, [p]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Patrimônio</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead>Mídia</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => {
                  const s = situacaoSla(c)
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetalhe(c)}>
                      <TableCell>
                        <Badge className={PRIO_CLS[c.prioridade]}>{PRIO_LABEL[c.prioridade]}</Badge>
                      </TableCell>
                      <TableCell>{c.expand?.empresa?.nome || '—'}</TableCell>
                      <TableCell className="font-mono text-teal-700">
                        {c.patrimonio || '—'}
                      </TableCell>
                      <TableCell>{c.setor || '—'}</TableCell>
                      <TableCell className="max-w-56 truncate">{c.descricao}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.video ? '🎥' : ''}
                        {c.foto ? '📷' : ''}
                        {!c.video && !c.foto ? '—' : ''}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={s.cls}>{s.rotulo}</Badge>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          meta {c.sla_horas || '—'}h
                        </div>
                      </TableCell>
                      <TableCell>{STATUS_LABEL[c.status]}</TableCell>
                    </TableRow>
                  )
                })}
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum chamado aqui — paz na fila. 🙂
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detalhe && sit && (
            <>
              <DialogHeader>
                <DialogTitle>
                  <Badge className={PRIO_CLS[detalhe.prioridade]}>
                    {PRIO_LABEL[detalhe.prioridade]}
                  </Badge>{' '}
                  {detalhe.expand?.empresa?.nome} · {detalhe.patrimonio}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Setor:</span> {detalhe.setor || '—'} ·{' '}
                  <span className="text-muted-foreground">Equipamento:</span>{' '}
                  {detalhe.expand?.equipamento?.marca_modelo || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Contato:</span> {detalhe.contato || '—'} ·{' '}
                  <span className="text-muted-foreground">
                    {new Date(detalhe.created.replace(' ', 'T')).toLocaleString('pt-BR')}
                  </span>
                </p>

                {/* CARTÃO DE SLA */}
                <div className={`rounded-md p-3 text-white ${sit.cls}`}>
                  <div className="text-[11px] uppercase tracking-wide opacity-90">
                    SLA · meta {detalhe.sla_horas}h
                  </div>
                  <div className="text-lg font-bold">{sit.rotulo}</div>
                  <div className="text-xs opacity-90">{sit.detalhe}</div>
                </div>

                <div className="rounded-md border p-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Aberto</span>
                    <span>
                      {new Date(detalhe.created.replace(' ', 'T')).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Iniciado</span>
                    <span>
                      {detalhe.iniciado_em
                        ? `${new Date(detalhe.iniciado_em.replace(' ', 'T')).toLocaleString('pt-BR')}${
                            detalhe.iniciado_por ? ` · ${detalhe.iniciado_por}` : ''
                          }`
                        : '— ainda não iniciado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resolvido</span>
                    <span>
                      {detalhe.resolvido_em
                        ? `${new Date(detalhe.resolvido_em.replace(' ', 'T')).toLocaleString('pt-BR')}${
                            detalhe.resolvido_por ? ` · ${detalhe.resolvido_por}` : ''
                          }`
                        : '— em andamento'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Prazo (meta)</span>
                    <span>
                      {prazoDe(detalhe) ? new Date(prazoDe(detalhe)!).toLocaleString('pt-BR') : '—'}
                    </span>
                  </div>
                  {detalhe.resolvido_em && (
                    <div className="flex justify-between font-medium">
                      <span className="text-muted-foreground">Tempo total</span>
                      <span>
                        {duracao(
                          new Date(detalhe.resolvido_em.replace(' ', 'T')).getTime() -
                            new Date(detalhe.created.replace(' ', 'T')).getTime(),
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-md bg-slate-50 border p-3">
                  <div className="text-xs text-muted-foreground mb-1">Defeito relatado:</div>
                  {detalhe.descricao}
                </div>

                {detalhe.foto && (
                  <a
                    href={`${pb.baseUrl}/api/files/chamados/${detalhe.id}/${detalhe.foto}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      className="w-full rounded-md border"
                      src={`${pb.baseUrl}/api/files/chamados/${detalhe.id}/${detalhe.foto}`}
                      alt="Foto do problema"
                    />
                  </a>
                )}
                {detalhe.video && (
                  <video
                    controls
                    className="w-full rounded-md border"
                    src={`${pb.baseUrl}/api/files/chamados/${detalhe.id}/${detalhe.video}`}
                  />
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  {detalhe.status === 'aberto' && (
                    <Button
                      className="bg-teal-600 hover:bg-teal-700"
                      disabled={salvando}
                      onClick={() => iniciar(detalhe)}
                    >
                      ▶ Iniciar atendimento
                    </Button>
                  )}
                  {detalhe.status === 'em_atendimento' && (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={salvando}
                      onClick={() => resolver(detalhe)}
                    >
                      ✓ Marcar resolvido
                    </Button>
                  )}
                  {detalhe.status === 'resolvido' && (
                    <Button variant="outline" disabled={salvando} onClick={() => reabrir(detalhe)}>
                      Reabrir
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDetalhe(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
