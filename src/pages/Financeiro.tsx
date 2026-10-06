import { useEffect, useMemo, useState } from 'react'
import { getFechamentosAll, pbExport as pb, brl, type Fechamento } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Linha = Fechamento & { empresaNome?: string }

const hoje = () => new Date().toISOString().slice(0, 10)

const diasAtraso = (venc: string) => {
  if (!venc) return 0
  const h = new Date(hoje()).getTime()
  const v = new Date(venc).getTime()
  return Math.max(0, Math.floor((h - v) / 86400000))
}

export default function Financeiro() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<'abertos' | 'pagos' | 'todos'>('abertos')
  const [busca, setBusca] = useState('')
  const [baixaId, setBaixaId] = useState<string | null>(null)
  const [baixaData, setBaixaData] = useState(hoje())

  const carregar = () => {
    setCarregando(true)
    getFechamentosAll()
      .then(setLinhas)
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar()
  }, [])

  const darBaixa = async (id: string) => {
    await pb.collection('fechamentos').update(id, { status: 'pago', data_pagamento: baixaData })
    setBaixaId(null)
    carregar()
  }

  const desfazer = async (id: string) => {
    await pb.collection('fechamentos').update(id, { status: 'emitido', data_pagamento: '' })
    carregar()
  }

  const linhasComNome = useMemo(
    () =>
      linhas.map((l) => ({
        ...l,
        empresaNome:
          (l as unknown as { expand?: { empresa?: { nome?: string } } }).expand?.empresa?.nome ??
          l.empresa,
      })),
    [linhas],
  )

  const visiveis = useMemo(() => {
    const alvo = busca.toLowerCase()
    return linhasComNome
      .filter((l) => {
        const pago = l.status === 'pago'
        if (filtro === 'pagos') return pago
        if (filtro === 'abertos') return !pago
        return true
      })
      .filter(
        (l) =>
          !alvo ||
          l.empresaNome.toLowerCase().includes(alvo) ||
          (l.competencia || '').includes(alvo),
      )
      .sort((a, b) => {
        // abertos primeiro, mais atrasados no topo; depois por competência desc
        const pa = a.status === 'pago' ? 1 : 0
        const pbv = b.status === 'pago' ? 1 : 0
        if (pa !== pbv) return pa - pbv
        if (!pa) return diasAtraso(b.data_vencimento) - diasAtraso(a.data_vencimento)
        return (b.competencia || '').localeCompare(a.competencia || '')
      })
  }, [linhasComNome, filtro, busca])

  const resumo = useMemo(() => {
    let recebido = 0
    let aReceber = 0
    let atrasado = 0
    let atrasados = 0
    for (const l of linhasComNome) {
      const v = Number(l.valor_final || l.total || 0)
      if (l.status === 'pago') recebido += v
      else {
        aReceber += v
        const d = diasAtraso(l.data_vencimento)
        if (d > 0) {
          atrasado += v
          atrasados++
        }
      }
    }
    return { recebido, aReceber, atrasado, atrasados }
  }, [linhasComNome])

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Quem pagou, quem está atrasado e o que falta receber
          </p>
        </div>
        <Input
          className="w-56"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar empresa/competência"
        />
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="text-2xl font-bold text-teal-700">{brl(resumo.recebido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">A receber</p>
                <p className="text-2xl font-bold">{brl(resumo.aReceber)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Em atraso</p>
                <p className="text-2xl font-bold text-red-600">{brl(resumo.atrasado)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Clientes atrasados</p>
                <p className="text-2xl font-bold text-red-600">{resumo.atrasados}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2 mb-4">
            {(['abertos', 'pagos', 'todos'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filtro === f ? 'default' : 'outline'}
                className={filtro === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
                onClick={() => setFiltro(f)}
              >
                {f === 'abertos' ? 'Em aberto' : f === 'pagos' ? 'Pagos' : 'Todos'}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="py-2">
              <div className="divide-y">
                {visiveis.length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">Nada aqui.</p>
                )}
                {visiveis.map((l) => {
                  const pago = l.status === 'pago'
                  const atraso = pago ? 0 : diasAtraso(l.data_vencimento)
                  return (
                    <div key={l.id} className="flex items-center gap-4 py-3 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <p className="font-medium text-sm">{l.empresaNome}</p>
                        <p className="text-xs text-muted-foreground">
                          competência {l.competencia} · venc.{' '}
                          {(l.data_vencimento || '').slice(0, 10).split('-').reverse().join('/')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">valor</p>
                        <p className="font-semibold">
                          {brl(Number(l.valor_final || l.total || 0))}
                        </p>
                      </div>
                      {pago ? (
                        <>
                          <Badge className="bg-teal-600">Pago</Badge>
                          <button
                            className="text-xs text-slate-400 underline hover:text-slate-600"
                            onClick={() => desfazer(l.id)}
                          >
                            desfazer
                          </button>
                        </>
                      ) : atraso > 0 ? (
                        <Badge className="bg-red-600">Atrasado {atraso}d</Badge>
                      ) : (
                        <Badge variant="secondary">Em aberto</Badge>
                      )}
                      {!pago &&
                        (baixaId === l.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              className="h-8 w-36"
                              value={baixaData}
                              onChange={(e) => setBaixaData(e.target.value)}
                            />
                            <Button
                              size="sm"
                              className="bg-teal-600 hover:bg-teal-700"
                              onClick={() => darBaixa(l.id)}
                            >
                              Confirmar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setBaixaId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-teal-600 text-teal-700 hover:bg-teal-50"
                            onClick={() => {
                              setBaixaData(hoje())
                              setBaixaId(l.id)
                            }}
                          >
                            Dar baixa
                          </Button>
                        ))}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
