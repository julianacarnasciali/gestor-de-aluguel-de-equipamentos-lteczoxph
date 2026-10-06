import { useEffect, useState, useMemo } from 'react'
import {
  getEquipamentos,
  getLeituras,
  getLeituraAnterior,
  createLeitura,
  updateLeitura,
  type Equipamento,
} from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getLeiturasAll, updateEquipamento } from '@/services/gestor'
import { useAuth } from '@/hooks/use-auth'
import { DialogEquipamento, type DialogEquipState } from '@/components/DialogEquipamento'
import { Plus, Pencil } from 'lucide-react'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface EstadoMaquina {
  ant: string
  at: string
  lancada: boolean
  alerta?: string | null
  manual?: boolean
  media?: boolean
}

export default function Leituras() {
  const { user } = useAuth()
  const ehMaster = user?.perfil === 'tecnico_master'
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [maquinas, setMaquinas] = useState<Equipamento[]>([])
  const [estados, setEstados] = useState<Record<string, EstadoMaquina>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [historico, setHistorico] = useState<Record<string, number[]>>({})
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({})
  const [dialogEq, setDialogEq] = useState<DialogEquipState | null>(null)

  const analisar = (eqId: string, ant: number, at: number, hist: number[]): string | null => {
    if (!at || at < 0) return null
    const pags = Math.max(0, at - ant)
    const base = hist.length >= 2 ? hist.slice(0, 6) : hist
    if (base.length === 0) {
      // sem histórico: só checagens básicas
      if (pags === 0) return 'Leitura igual à anterior — 0 páginas no mês. Confere o relatório?'
      return null
    }
    const media = base.reduce((a, b) => a + b, 0) / base.length
    if (media <= 0) return null
    const diff = (pags - media) / media
    if (pags === 0 && media > 0)
      return `0 páginas vs média de ${Math.round(media).toLocaleString('pt-BR')}/mês. Máquina ociosa ou leitura errada?`
    if (diff > 0.5)
      return `MUITO ACIMA do normal: ${pags.toLocaleString('pt-BR')} págs vs média ${Math.round(media).toLocaleString('pt-BR')} (+${Math.round(diff * 100)}%). Confere o relatório da máquina?`
    if (diff < -0.5)
      return `MUITO ABAIXO do normal: ${pags.toLocaleString('pt-BR')} págs vs média ${Math.round(media).toLocaleString('pt-BR')} (${Math.round(diff * 100)}%). Confere o relatório da máquina?`
    return null
  }

  const carregar = (comp: string) => {
    setCarregando(true)
    Promise.all([getEquipamentos(), getLeituras(comp), getLeiturasAll()])
      .then(async ([eqs, leis, todas]) => {
        // histórico de páginas por máquina (excluindo a competência em edição)
        const hist: Record<string, number[]> = {}
        for (const l of todas) {
          if (l.competencia === comp) continue
          if (!hist[l.equipamento]) hist[l.equipamento] = []
          hist[l.equipamento].push(l.paginas_mes ?? 0)
        }
        setHistorico(hist)

        const est: Record<string, EstadoMaquina> = {}
        for (const eq of eqs) {
          const l = leis.find((x) => x.equipamento === eq.id)
          if (l) {
            est[eq.id] = {
              ant: String(l.leitura_anterior),
              at: String(l.leitura_atual),
              lancada: true,
              alerta: analisar(eq.id, l.leitura_anterior, l.leitura_atual, hist[eq.id] ?? []),
            }
          } else {
            const anterior = await getLeituraAnterior(eq.id, comp)
            est[eq.id] = {
              ant: anterior ? String(anterior.leitura_atual) : '',
              at: '',
              lancada: false,
              alerta: null,
              manual: !!eq.contador_manual,
              media: false,
            }
          }
        }
        setEstados(est)
        setMaquinas(eqs)
      })
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar(competencia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const salvar = async (eq: Equipamento) => {
    const est = estados[eq.id]
    if (!est?.at) return
    const ant = Number(est.ant || est.at)
    const at = Number(est.at)
    const alerta = analisar(eq.id, ant, at, historico[eq.id] ?? [])
    // trava de verificação humana: alerta precisa ser confirmado antes de salvar
    if (alerta && !confirmados[eq.id]) {
      setEstados((p) => ({ ...p, [eq.id]: { ...est, alerta } }))
      return
    }
    setSalvando(eq.id)
    try {
      const payload: Record<string, unknown> = {
        equipamento: eq.id,
        contrato: eq.contrato,
        competencia,
        leitura_anterior: ant,
        leitura_atual: at,
        paginas_mes: Math.max(0, at - ant),
        origem: est.manual ? 'manual' : 'contador',
      }
      if (est.lancada) {
        const l = await getLeituras(competencia)
        const atual = l.find((x) => x.equipamento === eq.id)
        if (atual) await updateLeitura(atual.id, payload)
      } else {
        await createLeitura(payload)
      }
      setEstados((p) => ({
        ...p,
        [eq.id]: {
          ...est,
          lancada: true,
          alerta: analisar(eq.id, ant, at, historico[eq.id] ?? []),
        },
      }))
    } finally {
      setSalvando(null)
    }
  }

  const lancarPelaMedia = async (eq: Equipamento) => {
    setSalvando(eq.id)
    try {
      const hist = historico[eq.id] ?? []
      const pags = hist.length
        ? Math.round(hist.slice(0, 6).reduce((a, b) => a + b, 0) / Math.min(6, hist.length))
        : 0
      const antAtual = Number(estados[eq.id]?.ant || 0)
      await createLeitura({
        equipamento: eq.id,
        contrato: eq.contrato,
        competencia,
        leitura_anterior: antAtual,
        leitura_atual: antAtual + pags,
        paginas_mes: pags,
        origem: 'media',
        observacoes: 'Leitura pela média (troca de hardware)',
      })
      setEstados((p) => ({
        ...p,
        [eq.id]: { ...p[eq.id], lancada: true, media: true, alerta: null },
      }))
    } finally {
      setSalvando(null)
    }
  }

  const grupos = useMemo(() => {
    const mapa = new Map<string, { empresa: string; maquinas: Equipamento[] }>()
    for (const eq of maquinas) {
      const nome = eq.expand?.empresa?.nome ?? '(sem empresa)'
      const alvo = busca.toLowerCase()
      if (
        alvo &&
        !nome.toLowerCase().includes(alvo) &&
        !(eq.patrimonio ?? '').toLowerCase().includes(alvo)
      )
        continue
      if (!mapa.has(nome)) mapa.set(nome, { empresa: nome, maquinas: [] })
      mapa.get(nome)!.maquinas.push(eq)
    }
    return [...mapa.values()]
  }, [maquinas, busca])

  const totalMes = maquinas.reduce((acc, eq) => {
    const v = estados[eq.id]
    if (!v?.at) return acc
    return acc + Math.max(0, Number(v.at) - Number(v.ant || v.at))
  }, 0)

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Leituras de contadores</h1>
          <p className="text-sm text-muted-foreground">
            Competência {competencia} · total lançado: {totalMes.toLocaleString('pt-BR')} págs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-32"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            placeholder="MM/AAAA"
          />
          <Button variant="outline" onClick={() => carregar(competencia)}>
            Carregar
          </Button>
          <Input
            className="w-48"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa/máquina"
          />
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => {
            const lancadas = g.maquinas.filter((m) => estados[m.id]?.lancada).length
            return (
              <Card key={g.empresa}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-lg">{g.empresa}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={lancadas === g.maquinas.length ? 'default' : 'secondary'}
                        className={lancadas === g.maquinas.length ? 'bg-teal-600' : ''}
                      >
                        {lancadas}/{g.maquinas.length} lançadas
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-teal-600 text-teal-700 hover:bg-teal-50"
                        onClick={() =>
                          setDialogEq({
                            empresaId: g.maquinas[0]?.empresa ?? '',
                            empresaNome: g.empresa,
                            eq: null,
                          })
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" /> Impressora
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {g.maquinas.map((eq) => {
                      const est = estados[eq.id] ?? { ant: '', at: '', lancada: false }
                      const pags = Math.max(0, Number(est.at || 0) - Number(est.ant || est.at || 0))
                      return (
                        <div key={eq.id} className="flex items-center gap-3 py-3 flex-wrap">
                          <div className="min-w-48 flex-1">
                            <p className="font-medium text-sm">
                              {eq.patrimonio || eq.descricao || eq.id}
                              <button
                                className="ml-2 text-slate-400 hover:text-teal-700"
                                title="Editar equipamento (série, setor, contrato...)"
                                onClick={() =>
                                  setDialogEq({
                                    empresaId: eq.empresa,
                                    empresaNome: g.empresa,
                                    eq,
                                  })
                                }
                              >
                                <Pencil className="inline h-3 w-3" />
                              </button>
                              {est.manual && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 border-amber-500 text-amber-700"
                                >
                                  manual — só técnico master
                                </Badge>
                              )}
                              {est.media && <Badge className="ml-2 bg-teal-600">pela média</Badge>}
                            </p>
                            {eq.setor && (
                              <p className="text-xs text-muted-foreground">
                                {eq.setor}
                                {eq.numero_serie ? ` · série ${eq.numero_serie}` : ''}
                              </p>
                            )}
                            {est.alerta && (
                              <div
                                className={`mt-1 flex items-start gap-2 rounded-md border p-2 text-xs ${
                                  confirmados[eq.id]
                                    ? 'border-slate-200 bg-slate-50 text-slate-500'
                                    : 'border-amber-300 bg-amber-50 text-amber-900'
                                }`}
                              >
                                <span>⚠️ {est.alerta}</span>
                                {!confirmados[eq.id] && (
                                  <button
                                    className="ml-auto whitespace-nowrap rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700"
                                    onClick={() => setConfirmados((p) => ({ ...p, [eq.id]: true }))}
                                  >
                                    Conferido — lançar mesmo assim
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {est.manual && !ehMaster ? (
                            <p className="text-xs text-amber-700">
                              🔒 Leitura manual — só o técnico master lança
                            </p>
                          ) : (
                            <>
                              <div className="w-28">
                                <Label className="text-xs">Leitura anterior</Label>
                                <Input
                                  inputMode="numeric"
                                  className="h-8"
                                  value={est.ant}
                                  onChange={(e) =>
                                    setEstados((p) => ({
                                      ...p,
                                      [eq.id]: { ...est, ant: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="w-28">
                                <Label className="text-xs">Leitura atual</Label>
                                <Input
                                  inputMode="numeric"
                                  className="h-8"
                                  value={est.at}
                                  onChange={(e) =>
                                    setEstados((p) => ({
                                      ...p,
                                      [eq.id]: { ...est, at: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="w-20 text-right text-sm text-muted-foreground">
                                {pags} págs
                              </div>
                              <Button
                                size="sm"
                                className={
                                  est.alerta && !confirmados[eq.id]
                                    ? 'bg-amber-500 hover:bg-amber-600'
                                    : 'bg-teal-600 hover:bg-teal-700'
                                }
                                disabled={salvando === eq.id || !est.at}
                                onClick={() => salvar(eq)}
                              >
                                {salvando === eq.id
                                  ? '...'
                                  : est.alerta && !confirmados[eq.id]
                                    ? 'Verificar'
                                    : est.lancada
                                      ? 'Atualizar'
                                      : 'Lançar'}
                              </Button>
                              {ehMaster && est.manual && !est.lancada && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={salvando === eq.id}
                                  onClick={() => lancarPelaMedia(eq)}
                                >
                                  Lançar pela média
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <DialogEquipamento
        estado={dialogEq}
        onFechar={() => setDialogEq(null)}
        onSalvo={() => carregar(competencia)}
      />
    </div>
  )
}
