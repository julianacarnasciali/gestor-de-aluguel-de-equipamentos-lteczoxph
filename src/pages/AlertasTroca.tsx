import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
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
import { duracao, temposDe, type ChamadoTempo } from '@/lib/sla'
import {
  calcularAlertas,
  contarAlertas,
  LIMIAR_PADRAO,
  type AlertaTroca,
  type EquipAlerta,
  type LimiaresAlerta,
  type ManutencaoAlerta,
} from '@/lib/alerta-troca'

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDia = (s: string) => {
  if (!s) return '—'
  const t = new Date(String(s).replace(' ', 'T'))
  return isNaN(t.getTime()) ? '—' : t.toLocaleDateString('pt-BR')
}

// ALERTA DE TROCA (pedido dela 31/10, "sugestão 2").
// Máquina que gasta muita visita técnica e peça deixa de dar lucro. Esta tela
// aponta as candidatas a substituição antes de o cliente reclamar.
// Os limiares são calibráveis: não existe número universal de "quantas
// manutenções é demais" — quem define é a LCCA, olhando o histórico real.
export default function AlertasTroca() {
  const navigate = useNavigate()
  const [equipamentos, setEquipamentos] = useState<EquipAlerta[]>([])
  const [manutencoes, setManutencoes] = useState<ManutencaoAlerta[]>([])
  const [chamados, setChamados] = useState<(ChamadoTempo & { equipamento?: string })[]>([])
  const [carregando, setCarregando] = useState(true)
  const [limiares, setLimiares] = useState<LimiaresAlerta>(LIMIAR_PADRAO)
  const [limiaresTemp, setLimiaresTemp] = useState<LimiaresAlerta>(LIMIAR_PADRAO)
  const [configId, setConfigId] = useState('')
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [filtroNivel, setFiltroNivel] = useState<'todos' | 'critico' | 'atencao'>('todos')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [eqs, mans, chs, cfgs] = await Promise.all([
        pb.collection('equipamentos').getFullList<EquipAlerta>({ expand: 'empresa' }),
        pb
          .collection('manutencoes')
          .getFullList<ManutencaoAlerta>()
          .catch(() => []),
        pb.collection('chamados').getFullList<ChamadoTempo & { equipamento?: string }>(),
        pb
          .collection('config')
          .getFullList()
          .catch(() => []),
      ])
      setEquipamentos(eqs)
      setManutencoes(mans)
      setChamados(chs)
      if (cfgs.length > 0) {
        const c = cfgs[0] as Record<string, unknown>
        setConfigId(String(c.id))
        const l: LimiaresAlerta = {
          qtd12m: Number(c.alerta_qtd_12m) || LIMIAR_PADRAO.qtd12m,
          custo12m: Number(c.alerta_custo_12m) || LIMIAR_PADRAO.custo12m,
        }
        setLimiares(l)
        setLimiaresTemp(l)
      }
    } catch (e) {
      console.warn(e)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // só equipamentos ativos: alerta de troca serve para máquina em operação
  const todos = useMemo(
    () =>
      calcularAlertas(
        equipamentos.filter((e) => e.ativo),
        manutencoes,
        chamados,
        limiares,
      ),
    [equipamentos, manutencoes, chamados, limiares],
  )

  const alertas = useMemo(
    () => (filtroNivel === 'todos' ? todos : todos.filter((a) => a.nivel === filtroNivel)),
    [todos, filtroNivel],
  )

  const contagem = useMemo(() => contarAlertas(todos), [todos])

  const salvarLimiares = async () => {
    if (!configId) return
    setSalvando(true)
    try {
      await pb.collection('config').update(configId, {
        alerta_qtd_12m: Number(limiaresTemp.qtd12m) || 0,
        alerta_custo_12m: Number(limiaresTemp.custo12m) || 0,
      })
      setLimiares(limiaresTemp)
      setEditando(false)
    } catch (e) {
      console.warn(e)
    } finally {
      setSalvando(false)
    }
  }

  const verHistorico = (a: AlertaTroca) => {
    if (!a.equipamento.patrimonio) return
    navigate(`/historico?p=${encodeURIComponent(a.equipamento.patrimonio)}`)
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alerta de troca de equipamento</h1>
          <p className="text-sm text-muted-foreground">
            Máquinas que consomem mais manutenção e peça do que deveriam — candidatas à substituição
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/historico')}>
          🔧 Ver histórico
        </Button>
      </div>

      {/* INDICADORES */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Candidatas</div>
            <div className="text-2xl font-bold text-[#0F2A43]">{contagem.total}</div>
            <div className="text-xs text-muted-foreground">nos últimos 12 meses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Críticas</div>
            <div className="text-2xl font-bold text-rose-600">{contagem.criticos}</div>
            <div className="text-xs text-muted-foreground">troca recomendada</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Em atenção</div>
            <div className="text-2xl font-bold text-amber-600">{contagem.atencao}</div>
            <div className="text-xs text-muted-foreground">acompanhar</div>
          </CardContent>
        </Card>
      </div>

      {/* LIMIARES */}
      <Card className="mb-5">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Critério do alerta{' '}
            <span className="font-normal text-muted-foreground">(últimos 12 meses)</span>
          </CardTitle>
          {!editando ? (
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              Ajustar critério
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700"
                disabled={salvando}
                onClick={salvarLimiares}
              >
                Salvar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!editando ? (
            <div className="text-sm flex flex-wrap gap-x-8 gap-y-2">
              <span>
                <b>{limiares.qtd12m}</b> ou mais manutenções corretivas
              </span>
              <span>
                ou <b>{brl(limiares.custo12m)}</b> em peças
              </span>
              <span className="text-xs text-muted-foreground self-center">
                Preventiva e instalação não contam — são manutenção sadia, não defeito.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Manutenções corretivas em 12 meses</Label>
                <Input
                  type="number"
                  min={1}
                  className="w-28"
                  value={limiaresTemp.qtd12m}
                  onChange={(e) =>
                    setLimiaresTemp({ ...limiaresTemp, qtd12m: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo de peças em 12 meses (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  className="w-36"
                  value={limiaresTemp.custo12m}
                  onChange={(e) =>
                    setLimiaresTemp({ ...limiaresTemp, custo12m: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LISTA */}
      <div className="flex gap-2 mb-3">
        {(['todos', 'critico', 'atencao'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filtroNivel === f ? 'default' : 'outline'}
            className={filtroNivel === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setFiltroNivel(f)}
          >
            {f === 'todos' ? 'Todas' : f === 'critico' ? 'Críticas' : 'Atenção'}
          </Button>
        ))}
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nível</TableHead>
                  <TableHead>Patrimônio</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Corretivas</TableHead>
                  <TableHead className="text-right">Peças</TableHead>
                  <TableHead className="text-right">Chamados</TableHead>
                  <TableHead>Por quê</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertas.map((a) => (
                  <TableRow key={a.equipamento.id}>
                    <TableCell>
                      <Badge className={a.nivel === 'critico' ? 'bg-rose-600' : 'bg-amber-500'}>
                        {a.nivel === 'critico' ? 'Trocar' : 'Atenção'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-teal-700">
                      {a.equipamento.patrimonio || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.equipamento.expand?.empresa?.nome || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.equipamento.marca_modelo || '—'}
                      {a.equipamento.setor ? ` · ${a.equipamento.setor}` : ''}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{a.corretivas}</TableCell>
                    <TableCell className="text-right">{brl(a.custoPecas)}</TableCell>
                    <TableCell className="text-right">{a.chamados}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-72">
                      {a.motivos.join(' · ')}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => verHistorico(a)}
                      >
                        Ver histórico
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {alertas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {todos.length === 0
                        ? 'Nenhuma máquina passou do critério — frota saudável. 🙂'
                        : 'Nenhuma máquina neste filtro.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        Critério padrão definido em 31/10 e calibrável acima. Ajuste os números conforme o histórico
        real da LCCA — não existe valor universal de “quantas manutenções é demais”.{' '}
        {todos.length > 0 && (
          <>
            Tempo acumulado de atendimento nas candidatas:{' '}
            <b>{duracao(todos.reduce((x, a) => x + a.tempoTotal, 0))}</b>.
          </>
        )}
      </p>
    </div>
  )
}
