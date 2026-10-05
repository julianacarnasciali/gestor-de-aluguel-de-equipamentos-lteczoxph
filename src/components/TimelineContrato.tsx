import { getFechamentosContrato, brl, type Fechamento } from '@/services/gestor'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function TimelineContrato({ contratoId }: { contratoId: string }) {
  const [fechs, setFechs] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    getFechamentosContrato(contratoId)
      .then(setFechs)
      .finally(() => setCarregando(false))
  }, [contratoId])

  const nomesMes = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Histórico de fechamentos</CardTitle>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : fechs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum fechamento ainda para este contrato.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {fechs.map((f) => {
              const [mes, ano] = f.competencia.split('/')
              const pago = f.status === 'pago'
              return (
                <div
                  key={f.id}
                  className={`rounded-md border px-3 py-2 text-center min-w-24 ${
                    pago ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {nomesMes[Number(mes) - 1]}/{ano.slice(2)}
                  </p>
                  <p className="text-sm font-semibold">{brl(f.valor_final || f.total)}</p>
                  <p className={`text-xs ${pago ? 'text-teal-700' : 'text-amber-600'}`}>
                    {pago ? 'pago' : f.status}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
