import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getContratos, getLeituras, brl, type Contrato } from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { TimelineContrato } from '@/components/TimelineContrato'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Index() {
  const { user, signOut } = useAuth()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [leiturasMes, setLeiturasMes] = useState(0)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    Promise.all([getContratos(), getLeituras(competenciaAtual())])
      .then(([ctrs, leis]) => {
        setContratos(ctrs)
        setLeiturasMes(leis.length)
      })
      .finally(() => setCarregando(false))
  }, [])

  const ativos = contratos.filter((c) => c.ativo)
  const receitaMensal = ativos.reduce(
    (a, c) =>
      a +
      (c.mensalidade ?? 0) +
      (c.vlr_dispositivos ?? 0) +
      (c.vlr_servidores ?? 0) +
      (c.vlr_servicos ?? 0),
    0,
  )

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestor de Aluguel de Equipamentos</h1>
          <p className="text-sm text-muted-foreground">Competência {competenciaAtual()}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sair
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Contratos ativos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-teal-700">{ativos.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Mensalidades (fixo/mês)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{brl(receitaMensal)}</p>{' '}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Leituras lançadas no mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{leiturasMes}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Contratos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {ativos.map((c) => (
                  <div key={c.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{c.expand?.empresa?.nome ?? c.empresa}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.paginas_contratadas.toLocaleString('pt-BR')} págs · excedente{' '}
                          {brl(c.preco_excedente)}/pág · venc. dia {c.dia_vencimento}
                          {c.tipo_cobranca === 'media' ? ' · por média' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">
                          {brl(
                            (c.mensalidade ?? 0) +
                              (c.vlr_dispositivos ?? 0) +
                              (c.vlr_servidores ?? 0) +
                              (c.vlr_servicos ?? 0),
                          )}
                        </span>
                        <Badge className="bg-teal-600">Ativo</Badge>
                      </div>
                    </div>
                    <TimelineContrato contratoId={c.id} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Button asChild className="bg-teal-600 hover:bg-teal-700">
                  <Link to="/empresas">Empresas</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/leituras">Lançar leituras</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
