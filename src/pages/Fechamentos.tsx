import { useEffect, useState, useMemo } from 'react'
import {
  getContratos,
  getLeituras,
  getEquipamentos,
  getFechamentos,
  createFechamento,
  brl,
  pbExport as pb,
  type Contrato,
  type Equipamento,
  type Leitura,
} from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { gerarPdfFechamento } from '@/lib/pdf-fechamento'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Fechamentos() {
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [fechamentos, setFechamentos] = useState<Record<string, unknown>>({})
  const [carregando, setCarregando] = useState(true)
  const [fechando, setFechando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendentes' | 'fechados' | 'todos'>('pendentes')

  // modal de lançamento
  const [modal, setModal] = useState<Contrato | null>(null)
  const [descontoPct, setDescontoPct] = useState('0')
  const [descontoVlr, setDescontoVlr] = useState('0')
  const [dataEmissao, setDataEmissao] = useState('')
  const [dataVenc, setDataVenc] = useState('')
  const [formaPgto, setFormaPgto] = useState('boleto')
  const [mostrarPeriodo, setMostrarPeriodo] = useState(true)
  const [obs, setObs] = useState('')

  useEffect(() => {
    setCarregando(true)
    Promise.all([
      getContratos(),
      getEquipamentos(),
      getLeituras(competencia),
      getFechamentos(competencia),
    ])
      .then(([ctrs, eqs, leis, fechs]) => {
        setContratos(ctrs.filter((c) => c.ativo))
        setEquipamentos(eqs)
        setLeituras(leis)
        const mapa: Record<string, unknown> = {}
        for (const f of fechs) mapa[f.contrato] = f
        setFechamentos(mapa)
      })
      .finally(() => setCarregando(false))
  }, [competencia])

  const calc = (c: Contrato) => {
    const eqsDoContrato = equipamentos.filter((e) => e.contrato === c.id && e.tipo === 'impressora')
    const leiturasDoContrato = leituras.filter((l) =>
      eqsDoContrato.some((e) => e.id === l.equipamento),
    )
    const paginas = leiturasDoContrato.reduce((a, l) => a + (l.paginas_mes ?? 0), 0)
    const excedentes = Math.max(0, paginas - (c.paginas_contratadas ?? 0))
    const vlrExcedentes = excedentes * (c.preco_excedente ?? 0)
    const fixo =
      (c.mensalidade ?? 0) +
      (c.vlr_dispositivos ?? 0) +
      (c.vlr_servidores ?? 0) +
      (c.vlr_servicos ?? 0)
    const subtotal = fixo + vlrExcedentes
    return { eqs: eqsDoContrato, paginas, excedentes, vlrExcedentes, fixo, subtotal }
  }

  const abrirModal = (c: Contrato) => {
    const x = calc(c)
    if (
      x.eqs.length > 0 &&
      x.eqs.length !== leituras.filter((l) => x.eqs.some((e) => e.id === l.equipamento)).length
    ) {
      // tem máquinas sem leitura lançada — o fechamento ainda não deve ser feito
      const faltam =
        x.eqs.length - leituras.filter((l) => x.eqs.some((e) => e.id === l.equipamento)).length
      alert(`Faltam leituras: ${faltam} máquina(s) sem leitura lançada nesta competência.`)
      return
    }
    setModal(c)
    setDescontoPct('0')
    setDescontoVlr('0')
    const hoje = new Date().toISOString().slice(0, 10)
    setDataEmissao(hoje)
    const [mes, ano] = competencia.split('/')
    const venc = new Date(Number(ano), Number(mes) - 1, c.dia_vencimento || 5)
    setDataVenc(venc.toISOString().slice(0, 10))
    setObs(c.observacoes ?? '')
  }

  const lancarFechamento = async () => {
    if (!modal) return
    setFechando(modal.id)
    try {
      const x = calc(modal)
      const desconto = (x.subtotal * (Number(descontoPct) || 0)) / 100 + (Number(descontoVlr) || 0)
      const total = Math.max(0, x.subtotal - desconto)
      await createFechamento({
        contrato: modal.id,
        empresa: modal.empresa,
        competencia,
        paginas_consumidas: x.paginas,
        paginas_excedentes: x.excedentes,
        vlr_impressoras: modal.mensalidade ?? 0,
        vlr_excedentes: x.vlrExcedentes,
        vlr_dispositivos: modal.vlr_dispositivos ?? 0,
        vlr_servidores: modal.vlr_servidores ?? 0,
        vlr_servicos: modal.vlr_servicos ?? 0,
        desconto,
        total,
        valor_final: total,
        desconto_percentual: Number(descontoPct) || 0,
        desconto_valor: Number(descontoVlr) || 0,
        tipo_documento: modal.empresa.emite_nf ? 'fatura' : 'documento',
        data_emissao: dataEmissao,
        data_vencimento: dataVenc,
        forma_pgto: formaPgto,
        mostrar_periodo: mostrarPeriodo,
        periodo_de: `05/${competencia}`,
        periodo_ate: `05/${competencia}`,
        status: 'emitido',
        observacoes: obs,
      })
      setModal(null)
      await Promise.all([getFechamentos(competencia)]).then(([fechs]) => {
        const mapa: Record<string, unknown> = {}
        for (const f of fechs) mapa[f.contrato] = f
        setFechamentos(mapa)
      })
    } finally {
      setFechando(null)
    }
  }

  const resumo = useMemo(() => {
    let total = 0
    for (const c of contratos) {
      const f = fechamentos[c.id]
      total += f ? Number((f as { total?: number }).total ?? 0) : calc(c).subtotal
    }
    return total
  }, [contratos, fechamentos, leituras, equipamentos])

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Fechamento mensal</h1>
          <p className="text-sm text-muted-foreground">
            Competência {competencia} · total do mês: {brl(resumo)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-32"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            placeholder="MM/AAAA"
          />
          <Button variant="outline" onClick={() => setCompetencia(competencia)}>
            Recarregar
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            {(['pendentes', 'fechados', 'todos'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filtro === f ? 'default' : 'outline'}
                className={filtro === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
                onClick={() => setFiltro(f)}
              >
                {f === 'pendentes' ? 'Pendentes' : f === 'fechados' ? 'Fechados' : 'Todos'}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            {contratos
              .filter((c) => {
                const fechado = !!fechamentos[c.id]
                return filtro === 'todos' || (filtro === 'pendentes' ? !fechado : fechado)
              })
              .map((c) => {
                const x = calc(c)
                const fechado = fechamentos[c.id]
                const leiturasOk =
                  x.eqs.length === 0 ||
                  x.eqs.length ===
                    leituras.filter((l) => x.eqs.some((e) => e.id === l.equipamento)).length
                return (
                  <Card key={c.id}>
                    <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-56">
                        <p className="font-medium">{c.expand?.empresa?.nome ?? c.empresa}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.paginas_contratadas?.toLocaleString('pt-BR')} págs · exc.{' '}
                          {brl(c.preco_excedente)}/pág
                          {c.tipo_cobranca === 'media' ? ' · por média' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">págs do mês</p>
                        <p className="font-semibold">{x.paginas.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">excedentes</p>
                        <p className="font-semibold">{brl(x.vlrExcedentes)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">total</p>
                        <p className="font-semibold text-teal-700">
                          {fechado
                            ? brl(Number((fechado as { total?: number }).total))
                            : brl(x.subtotal)}
                        </p>
                      </div>
                      {fechado ? (
                        <>
                          <Badge className="bg-teal-600">Fechado</Badge>
                          {(fechado as { asaas_invoice_status?: string }).asaas_invoice_status ===
                            'AUTHORIZED' && <Badge className="bg-indigo-600">NF autorizada</Badge>}
                          {(fechado as { asaas_invoice_status?: string }).asaas_invoice_status ===
                            'ERROR' && <Badge className="bg-red-600">NF com erro</Badge>}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const f = fechado as { id?: string }
                              if (!f?.id) return
                              const [cfgList, eqs, leis] = await Promise.all([
                                pb.collection('config').getFullList(),
                                getEquipamentos(),
                                getLeituras(competencia),
                              ])
                              const cfg = cfgList[0]
                              const doContrato = eqs.filter(
                                (q) => q.contrato === c.id && q.tipo === 'impressora',
                              )
                              const maquinas = doContrato.map((q) => {
                                const l = leis.find((x) => x.equipamento === q.id)
                                return {
                                  patrimonio: q.patrimonio || q.descricao || q.id,
                                  setor: q.setor || '',
                                  leitura_anterior: l?.leitura_anterior ?? 0,
                                  leitura_atual: l?.leitura_atual ?? 0,
                                  paginas_mes: l?.paginas_mes ?? 0,
                                }
                              })
                              gerarPdfFechamento(
                                f as never,
                                c.expand?.empresa,
                                c,
                                cfg as never,
                                maquinas,
                              )
                            }}
                          >
                            Ver PDF
                          </Button>
                          {(fechado as { asaas_boleto_url?: string }).asaas_boleto_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-teal-600 text-teal-700 hover:bg-teal-50"
                              onClick={() =>
                                window.open(
                                  (fechado as { asaas_boleto_url?: string }).asaas_boleto_url,
                                  '_blank',
                                )
                              }
                            >
                              Boleto
                            </Button>
                          )}
                          {(fechado as { asaas_invoice_url?: string }).asaas_invoice_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                              onClick={() =>
                                window.open(
                                  (fechado as { asaas_invoice_url?: string }).asaas_invoice_url,
                                  '_blank',
                                )
                              }
                            >
                              NF
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={async () => {
                              const f = fechado as { id?: string }
                              if (!f?.id) return
                              if (
                                !confirm(
                                  'Apagar este fechamento de teste? Ele sai da lista e o contrato volta para Pendentes.',
                                )
                              )
                                return
                              await pb.collection('fechamentos').delete(f.id)
                              setFechamentos((prev) => {
                                const novo = { ...prev }
                                delete novo[c.id]
                                return novo
                              })
                            }}
                          >
                            Excluir
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-teal-600 hover:bg-teal-700"
                          disabled={!leiturasOk || fechando === c.id}
                          onClick={() => abrirModal(c)}
                        >
                          Fechar mês
                        </Button>
                      )}{' '}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </>
      )}

      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar fechamento — {modal?.expand?.empresa?.nome}</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="grid gap-3 py-2">
              {(() => {
                const x = calc(modal)
                const desconto =
                  (x.subtotal * (Number(descontoPct) || 0)) / 100 + (Number(descontoVlr) || 0)
                const total = Math.max(0, x.subtotal - desconto)
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p>
                        Impressoras: <strong>{brl(modal.mensalidade)}</strong>
                      </p>
                      <p>
                        Dispositivos: <strong>{brl(modal.vlr_dispositivos)}</strong>
                      </p>
                      <p>
                        Servidor: <strong>{brl(modal.vlr_servidores)}</strong>
                      </p>
                      <p>
                        Serviços: <strong>{brl(modal.vlr_servicos)}</strong>
                      </p>
                      <p>
                        Excedentes ({x.excedentes.toLocaleString('pt-BR')} págs):{' '}
                        <strong>{brl(x.vlrExcedentes)}</strong>
                      </p>
                      <p>
                        Subtotal: <strong>{brl(x.subtotal)}</strong>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Desconto %</Label>
                        <Input
                          inputMode="decimal"
                          value={descontoPct}
                          onChange={(e) => setDescontoPct(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Desconto R$</Label>
                        <Input
                          inputMode="decimal"
                          value={descontoVlr}
                          onChange={(e) => setDescontoVlr(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Data de emissão</Label>
                        <Input
                          type="date"
                          value={dataEmissao}
                          onChange={(e) => setDataEmissao(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Data de vencimento</Label>
                        <Input
                          type="date"
                          value={dataVenc}
                          onChange={(e) => setDataVenc(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Forma de pagamento</Label>
                        <select
                          className="w-full rounded-md border bg-transparent p-2 text-sm"
                          value={formaPgto}
                          onChange={(e) => setFormaPgto(e.target.value)}
                        >
                          <option value="boleto">Boleto</option>
                          <option value="pix">Pix</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="transferencia">Transferência</option>
                          <option value="cartao">Cartão</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Mostrar período</Label>
                        <select
                          className="w-full rounded-md border bg-transparent p-2 text-sm"
                          value={mostrarPeriodo ? 'sim' : 'nao'}
                          onChange={(e) => setMostrarPeriodo(e.target.value === 'sim')}
                        >
                          <option value="sim">Sim</option>
                          <option value="nao">Não</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Observações</Label>
                      <Input value={obs} onChange={(e) => setObs(e.target.value)} />
                    </div>
                    <div className="rounded-md bg-slate-50 border p-3 text-right">
                      <p className="text-sm text-muted-foreground">Total final</p>
                      <p className="text-2xl font-bold text-teal-700">{brl(total)}</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setModal(null)}>
                        Cancelar
                      </Button>
                      <Button
                        className="bg-teal-600 hover:bg-teal-700"
                        onClick={lancarFechamento}
                        disabled={fechando === modal.id}
                      >
                        {fechando === modal.id ? 'Lançando...' : 'Lançar fechamento'}
                      </Button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
