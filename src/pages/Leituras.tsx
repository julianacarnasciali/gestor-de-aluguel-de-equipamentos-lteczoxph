import { useEffect, useState } from 'react'
import {
  getEquipamentos,
  getLeituras,
  createLeitura,
  type Equipamento,
  type Leitura,
} from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Leituras() {
  const { user, signOut } = useAuth()
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [maquinas, setMaquinas] = useState<Equipamento[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [valores, setValores] = useState<Record<string, { ant: string; at: string }>>({})

  const carregar = (comp: string) => {
    setCarregando(true)
    Promise.all([getEquipamentos(), getLeituras(comp)])
      .then(([eqs, leis]) => {
        setMaquinas(eqs)
        setLeituras(leis)
        const v: Record<string, { ant: string; at: string }> = {}
        for (const eq of eqs) {
          const l = leis.find((x) => x.equipamento === eq.id)
          v[eq.id] = l
            ? { ant: String(l.leitura_anterior), at: String(l.leitura_atual) }
            : { ant: '', at: '' }
        }
        setValores(v)
      })
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar(competencia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const salvar = async (eq: Equipamento) => {
    const v = valores[eq.id]
    if (!v?.at) return
    const ant = Number(v.ant || v.at)
    const at = Number(v.at)
    setSalvando(eq.id)
    try {
      const existente = leituras.find((x) => x.equipamento === eq.id)
      const payload = {
        equipamento: eq.id,
        contrato: eq.contrato,
        competencia,
        leitura_anterior: ant,
        leitura_atual: at,
        paginas_mes: Math.max(0, at - ant),
      }
      if (existente) {
        await pbUpdate(existente.id, payload)
      } else {
        await createLeitura(payload)
      }
      carregar(competencia)
    } finally {
      setSalvando(null)
    }
  }

  // update local (evita import extra)
  const pbUpdate = async (id: string, data: Record<string, unknown>) => {
    const { default: pb } = await import('@/lib/pocketbase/client')
    await pb.collection('leituras').update(id, data)
  }

  const totalMes = maquinas.reduce((acc, eq) => {
    const v = valores[eq.id]
    if (!v?.at) return acc
    return acc + Math.max(0, Number(v.at) - Number(v.ant || v.at))
  }, 0)

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leituras de contadores</h1>
          <p className="text-sm text-muted-foreground">
            Competência {competencia} · total lançado: {totalMes.toLocaleString('pt-BR')} págs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-28"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            placeholder="MM/AAAA"
          />
          <Button variant="outline" onClick={() => carregar(competencia)}>
            Carregar
          </Button>
          <span className="text-sm text-muted-foreground ml-2">{user?.name}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sair
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {maquinas.map((eq) => {
            const v = valores[eq.id] ?? { ant: '', at: '' }
            const lancado = leituras.some((x) => x.equipamento === eq.id)
            return (
              <Card key={eq.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{eq.patrimonio || eq.descricao}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {eq.expand?.empresa?.nome} · {eq.setor}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Leitura anterior</Label>
                      <Input
                        inputMode="numeric"
                        value={v.ant}
                        onChange={(e) =>
                          setValores((p) => ({ ...p, [eq.id]: { ...v, ant: e.target.value } }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Leitura atual</Label>
                      <Input
                        inputMode="numeric"
                        value={v.at}
                        onChange={(e) =>
                          setValores((p) => ({ ...p, [eq.id]: { ...v, at: e.target.value } }))
                        }
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    size="sm"
                    disabled={salvando === eq.id || !v.at}
                    onClick={() => salvar(eq)}
                  >
                    {salvando === eq.id
                      ? 'Salvando...'
                      : lancado
                        ? 'Atualizar leitura'
                        : 'Lançar leitura'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
