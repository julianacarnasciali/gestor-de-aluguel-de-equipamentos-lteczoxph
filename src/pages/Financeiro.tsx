import { useEffect, useMemo, useState } from 'react'
import { getFechamentosAll, getServicos, brl, type Fechamento } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ReemitirNF } from '@/components/ReemitirNF'
import pbClient from '@/lib/pocketbase/client'

// Linha da lista de mensalidades: o fechamento + o nome da empresa já resolvido.
type Linha = Fechamento & { empresaNome: string }

interface ServicoLinha {
  id: string
  empresaNome: string
  descricao: string
  valor: number
  data_vencimento: string
  data_pagamento: string
  status: string
  emite_nf: boolean
  asaas_invoice_id: string
  asaas_invoice_url: string
  asaas_boleto_url: string
}

// Data de HOJE no fuso de São Paulo.
// `toISOString()` devolve UTC: entre 21h e 00h de Brasília o dia UTC já virou,
// e a baixa ficava com a data de amanhã (e o "dias de atraso" errava). O Brazil
// não tem mais horário de verão, então -03 fixo é seguro.
const hoje = () => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
}

const diasAtraso = (venc: string) => {
  if (!venc) return 0
  const h = new Date(hoje()).getTime()
  const v = new Date(venc).getTime()
  return Math.max(0, Math.floor((h - v) / 86400000))
}

const dataBR = (iso: string) => (iso || '').slice(0, 10).split('-').reverse().join('/')

// RELATÓRIO DO FECHAMENTO (04/11/2026)
// Antes só existia "Ver PDF" na tela Fechamento mensal, e ele remontava o PDF no
// navegador. O Financeiro não tinha como abrir o relatório — foi o que a Juliana
// não achou ao precisar da 2ª via da Jandira Reserva.
// Agora o PDF vive no campo `pdf` do próprio fechamento (gerado no servidor,
// igual para todo mundo) e o botão abre o arquivo. Se ainda não existir, cai na
// rota que gera na hora.
const urlRelatorio = (rec: { id: string; pdf?: string }) => {
  const base = String(pbClient.baseUrl || '')
  if (rec.pdf) {
    return base + '/api/files/fechamentos/' + rec.id + '/' + encodeURIComponent(rec.pdf)
  }
  return (
    base +
    '/backend/v1/fechamento/relatorio?id=' +
    encodeURIComponent(rec.id) +
    '&t=' +
    encodeURIComponent(pbClient.authStore.token || '')
  )
}

export default function Financeiro() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [servicos, setServicos] = useState<ServicoLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<'abertos' | 'pagos' | 'todos'>('abertos')
  const [busca, setBusca] = useState('')
  const [baixaId, setBaixaId] = useState<string | null>(null)
  const [baixaData, setBaixaData] = useState(hoje())

  const carregar = () => {
    setCarregando(true)
    Promise.all([getFechamentosAll(), getServicos()])
      .then(([fechs, servs]) => {
        setLinhas(
          fechs.map((f) => ({
            ...f,
            empresaNome:
              (f as unknown as { expand?: { empresa?: { nome?: string } } }).expand?.empresa
                ?.nome ?? String(f.empresa ?? ''),
          })),
        )
        setServicos(
          servs.map((s) => {
            const r = s as Record<string, unknown>
            return {
              id: String(s.id),
              empresaNome:
                ((r.expand as { empresa?: { nome?: string } } | undefined)?.empresa?.nome ??
                  String(r.empresa ?? '')) ||
                '—',
              descricao: String(r.descricao ?? ''),
              valor: Number(r.valor ?? 0),
              data_vencimento: String(r.data_vencimento ?? ''),
              data_pagamento: String(r.data_pagamento ?? ''),
              status: String(r.status ?? ''),
              emite_nf: Boolean(r.emite_nf),
              asaas_invoice_id: String(r.asaas_invoice_id ?? ''),
              asaas_invoice_url: String(r.asaas_invoice_url ?? ''),
              asaas_boleto_url: String(r.asaas_boleto_url ?? ''),
            }
          }),
        )
      })
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar()
  }, [])

  const darBaixa = async (id: string) => {
    await pbClient
      .collection('fechamentos')
      .update(id, { status: 'pago', data_pagamento: baixaData })
    setBaixaId(null)
    carregar()
  }

  const desfazer = async (id: string) => {
    await pbClient.collection('fechamentos').update(id, { status: 'emitido', data_pagamento: '' })
    carregar()
  }

  const darBaixaServico = async (id: string) => {
    await pbClient.collection('servicos').update(id, { status: 'pago', data_pagamento: baixaData })
    setBaixaId(null)
    carregar()
  }

  const desfazerServico = async (id: string) => {
    await pbClient.collection('servicos').update(id, { status: 'emitido', data_pagamento: '' })
    carregar()
  }

  // Emite AGORA, sem esperar a janela de segurança. Usado quando precisa mandar
  // boleto/nota naquele instante para o cliente.
  const emitirAgora = async (colecao: 'fechamentos' | 'servicos', id: string) => {
    const ok = window.confirm(
      'Emitir agora, sem esperar a janela?\n\n' +
        'O boleto e a nota fiscal (se o cliente emite) serão gerados neste momento ' +
        'e o e-mail vai para o cliente. Depois de emitido, não dá mais para cancelar por aqui.',
    )
    if (!ok) return
    try {
      const r = (await pbClient.send('/backend/v1/cobranca/processar', {
        method: 'POST',
        body: { colecao, id, forcar: true },
      })) as { paymentId?: string; invoiceStatus?: string; relatorio?: boolean }
      window.alert(
        r?.paymentId
          ? 'Cobrança emitida.\n\nBoleto: ' +
              r.paymentId +
              (r.invoiceStatus ? '\nNota fiscal: ' + r.invoiceStatus : '\nSem nota fiscal.') +
              (r.relatorio === false ? '\n\nATENÇÃO: o relatório não pôde ser gerado.' : '')
          : 'Cobrança processada.',
      )
      carregar()
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as { message?: string })?.message ||
        ''
      window.alert('Não foi possível emitir. ' + (msg || 'Veja o erro no lançamento.'))
      carregar()
    }
  }

  // Cancela a cobrança AGENDADA dentro da janela de segurança: nada foi gerado
  // ainda, então não há boleto, nota fiscal nem e-mail para o cliente.
  const cancelarCobranca = async (colecao: 'fechamentos' | 'servicos', id: string) => {
    const ok = window.confirm(
      'Cancelar esta cobrança?\n\nEla ainda não virou boleto nem nota fiscal, ' +
        'então nada é enviado ao cliente e nada vai para o banco. Depois da janela ' +
        'não é mais possível cancelar por aqui.',
    )
    if (!ok) return
    try {
      await pbClient.send('/backend/v1/cobranca/cancelar', {
        method: 'POST',
        body: { colecao, id },
      })
      carregar()
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || ''
      window.alert(
        'Não foi possível cancelar. ' +
          (msg || 'Se o boleto já foi gerado, cancele no Asaas e aqui marque como pago.'),
      )
    }
  }

  const visiveis = useMemo(() => {
    const alvo = busca.toLowerCase()
    return linhas
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
  }, [linhas, filtro, busca])

  const servicosVisiveis = useMemo(() => {
    const alvo = busca.toLowerCase()
    return servicos
      .filter((s) => {
        const pago = s.status === 'pago'
        if (filtro === 'pagos') return pago
        if (filtro === 'abertos') return !pago
        return true
      })
      .filter(
        (s) =>
          !alvo ||
          s.empresaNome.toLowerCase().includes(alvo) ||
          s.descricao.toLowerCase().includes(alvo),
      )
      .sort((a, b) => {
        const pa = a.status === 'pago' ? 1 : 0
        const pbv = b.status === 'pago' ? 1 : 0
        if (pa !== pbv) return pa - pbv
        if (!pa) return diasAtraso(b.data_vencimento) - diasAtraso(a.data_vencimento)
        return (b.data_vencimento || '').localeCompare(a.data_vencimento || '')
      })
  }, [servicos, filtro, busca])

  const resumo = useMemo(() => {
    let recebido = 0
    let aReceber = 0
    let atrasado = 0
    let atrasados = 0
    for (const l of linhas) {
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
    const servRecebido = servicos
      .filter((s) => s.status === 'pago')
      .reduce((a, s) => a + s.valor, 0)
    const servAberto = servicos.filter((s) => s.status !== 'pago').reduce((a, s) => a + s.valor, 0)
    return { recebido, aReceber, atrasado, atrasados, servRecebido, servAberto }
  }, [linhas, servicos])

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
                <p className="text-xs text-muted-foreground">Recebido (mensalidade)</p>
                <p className="text-2xl font-bold text-teal-700">{brl(resumo.recebido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">A receber (mensalidade)</p>
                <p className="text-2xl font-bold">{brl(resumo.aReceber)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Serviços recebidos</p>
                <p className="text-2xl font-bold text-teal-700">{brl(resumo.servRecebido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Serviços a receber</p>
                <p className="text-2xl font-bold">{brl(resumo.servAberto)}</p>
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

          {/* ===== MENSALIDADES (fechamentos) ===== */}
          <h2 className="text-lg font-semibold mb-2">Mensalidades (fechamentos)</h2>
          <Card className="mb-8">
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
                          competência {l.competencia} · venc. {dataBR(l.data_vencimento)}
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
                      {/* RELATÓRIO — sempre disponível (04/11). Independe de nota fiscal. */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-400 text-slate-700 hover:bg-slate-50"
                        title="Abre o relatório deste fechamento (o mesmo que vai anexado no e-mail)."
                        onClick={() => window.open(urlRelatorio(l), '_blank')}
                      >
                        Relatório
                      </Button>
                      {(l.cobranca_erro || '') !== '' && (
                        <span className="text-xs text-red-600 max-w-56" title={l.cobranca_erro}>
                          ⚠ {l.cobranca_erro.slice(0, 60)}
                        </span>
                      )}
                      {/* NF: link do PDF quando autorizada, fila quando agendada, emitir só se não existe */}
                      {l.asaas_invoice_url ? (
                        <button
                          className="text-xs text-indigo-700 underline"
                          onClick={() => window.open(l.asaas_invoice_url, '_blank')}
                        >
                          NF
                        </button>
                      ) : l.asaas_invoice_id ? (
                        <Badge variant="secondary" className="animate-pulse">
                          NF na fila…
                        </Badge>
                      ) : (
                        <ReemitirNF colecao="fechamentos" id={l.id} onOk={carregar} />
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
                          <>
                            {l.cobranca_status === 'aguardando' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-teal-600 bg-teal-50 text-teal-800 hover:bg-teal-100"
                                  onClick={() => emitirAgora('fechamentos', l.id)}
                                >
                                  Emitir agora
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-300 text-red-700 hover:bg-red-50"
                                  onClick={() => cancelarCobranca('fechamentos', l.id)}
                                >
                                  Cancelar cobrança
                                </Button>
                              </>
                            )}
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
                          </>
                        ))}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* ===== SERVIÇOS AVULSOS ===== */}
          <h2 className="text-lg font-semibold mb-2">Serviços avulsos</h2>
          <Card>
            <CardContent className="py-2">
              <div className="divide-y">
                {servicosVisiveis.length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">Nenhum serviço aqui.</p>
                )}
                {servicosVisiveis.map((s) => {
                  const pago = s.status === 'pago'
                  const atraso = pago ? 0 : diasAtraso(s.data_vencimento)
                  return (
                    <div key={s.id} className="flex items-center gap-4 py-3 flex-wrap">
                      <div className="flex-1 min-w-48">
                        <p className="font-medium text-sm">{s.empresaNome}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-72">
                          {s.descricao} · venc. {dataBR(s.data_vencimento)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">valor</p>
                        <p className="font-semibold">{brl(s.valor)}</p>
                      </div>
                      {pago ? (
                        <>
                          <Badge className="bg-teal-600">Pago</Badge>
                          <button
                            className="text-xs text-slate-400 underline hover:text-slate-600"
                            onClick={() => desfazerServico(s.id)}
                          >
                            desfazer
                          </button>
                        </>
                      ) : atraso > 0 ? (
                        <Badge className="bg-red-600">Atrasado {atraso}d</Badge>
                      ) : (
                        <Badge variant="secondary">Em aberto</Badge>
                      )}
                      {s.asaas_boleto_url && (
                        <button
                          className="text-xs text-teal-700 underline"
                          onClick={() => window.open(s.asaas_boleto_url, '_blank')}
                        >
                          Boleto
                        </button>
                      )}
                      {s.asaas_invoice_url ? (
                        <button
                          className="text-xs text-indigo-700 underline"
                          onClick={() => window.open(s.asaas_invoice_url, '_blank')}
                        >
                          NF
                        </button>
                      ) : s.asaas_invoice_id ? (
                        <Badge variant="secondary" className="animate-pulse">
                          NF na fila…
                        </Badge>
                      ) : (
                        <ReemitirNF colecao="servicos" id={s.id} onOk={carregar} />
                      )}
                      {!pago &&
                        (baixaId === s.id ? (
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
                              onClick={() => darBaixaServico(s.id)}
                            >
                              Confirmar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setBaixaId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <>
                            {(s as unknown as { cobranca_status?: string }).cobranca_status ===
                              'aguardando' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-teal-600 bg-teal-50 text-teal-800 hover:bg-teal-100"
                                  onClick={() => emitirAgora('servicos', s.id)}
                                >
                                  Emitir agora
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-300 text-red-700 hover:bg-red-50"
                                  onClick={() => cancelarCobranca('servicos', s.id)}
                                >
                                  Cancelar cobrança
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-teal-600 text-teal-700 hover:bg-teal-50"
                              onClick={() => {
                                setBaixaData(hoje())
                                setBaixaId(s.id)
                              }}
                            >
                              Dar baixa
                            </Button>
                          </>
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
