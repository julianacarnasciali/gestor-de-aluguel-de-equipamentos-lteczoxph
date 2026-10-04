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

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface EstadoMaquina {
  ant: string
  at: string
  lancada: boolean
}

export default function Leituras() {
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [maquinas, setMaquinas] = useState<Equipamento[]>([])
  const [estados, setEstados] = useState<Record<string, EstadoMaquina>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const carregar = (comp: string) => {
    setCarregando(true)
    Promise.all([getEquipamentos(), getLeituras(comp)])
      .then(async ([eqs, leis]) => {
        const est: Record<string, EstadoMaquina> = {}
        for (const eq of eqs) {
          const l = leis.find((x) => x.equipamento === eq.id)
          if (l) {
            est[eq.id] = {
              ant: String(l.leitura_anterior),
              at: String(l.leitura_atual),
              lancada: true,
            }
          } else {
            const anterior = await getLeituraAnterior(eq.id, comp)
            est[eq.id] = {
              ant: anterior ? String(anterior.leitura_atual) : '',
              at: '',
              lancada: false,
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
    setSalvando(eq.id)
    try {
      const payload = {
        equipamento: eq.id,
        contrato: eq.contrato,
        competencia,
        leitura_anterior: ant,
        leitura_atual: at,
        paginas_mes: Math.max(0, at - ant),
      }
      if (est.lancada) {
        const l = await getLeituras(competencia)
        const atual = l.find((x) => x.equipamento === eq.id)
        if (atual) await updateLeitura(atual.id, payload)
      } else {
        await createLeitura(payload)
      }
      setEstados((p) => ({ ...p, [eq.id]: { ...est, lancada: true } }))
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
                    <Badge
                      variant={lancadas === g.maquinas.length ? 'default' : 'secondary'}
                      className={lancadas === g.maquinas.length ? 'bg-teal-600' : ''}
                    >
                      {lancadas}/{g.maquinas.length} lançadas
                    </Badge>
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
                            </p>
                            {eq.setor && (
                              <p className="text-xs text-muted-foreground">{eq.setor}</p>
                            )}
                          </div>
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
                            className="bg-teal-600 hover:bg-teal-700"
                            disabled={salvando === eq.id || !est.at}
                            onClick={() => salvar(eq)}
                          >
                            {salvando === eq.id ? '...' : est.lancada ? 'Atualizar' : 'Lançar'}
                          </Button>
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
    </div>
  )
}
