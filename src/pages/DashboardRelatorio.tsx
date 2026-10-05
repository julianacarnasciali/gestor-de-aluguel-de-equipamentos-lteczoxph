import { useEffect, useState } from 'react'
import {
  getEmpresas,
  getContratos,
  getEquipamentos,
  getLeituras,
  brl,
  type Empresa,
  type Contrato,
  type Equipamento,
  type Leitura,
} from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const CORES = [
  '#0d9488',
  '#0f2a43',
  '#e26b0a',
  '#6366f1',
  '#dc2626',
  '#059669',
  '#d97706',
  '#7c3aed',
]

export default function DashboardRelatorio() {
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [carregando, setCarregando] = useState(true)
  const [foco, setFoco] = useState<Empresa | null>(null)

  useEffect(() => {
    setCarregando(true)
    Promise.all([getEmpresas(), getContratos(), getEquipamentos(), getLeituras(competencia)])
      .then(([emps, ctrs, eqs, leis]) => {
        setEmpresas(emps)
        setContratos(ctrs)
        setEquipamentos(eqs)
        setLeituras(leis)
      })
      .finally(() => setCarregando(false))
  }, [competencia])

  const porEmpresa = empresas
    .filter((e) => e.ativo)
    .map((e) => {
      const ctrsDaEmpresa = contratos.filter((c) => c.empresa === e.id && c.ativo)
      const fixo = ctrsDaEmpresa.reduce(
        (a, c) =>
          a +
          (c.mensalidade ?? 0) +
          (c.vlr_dispositivos ?? 0) +
          (c.vlr_servidores ?? 0) +
          (c.vlr_servicos ?? 0),
        0,
      )
      const eqsDaEmpresa = equipamentos.filter((q) => q.empresa === e.id && q.tipo === 'impressora')
      const pags = leituras
        .filter((l) => eqsDaEmpresa.some((q) => q.id === l.equipamento))
        .reduce((a, l) => a + (l.paginas_mes ?? 0), 0)
      return {
        empresa: e,
        contratos: ctrsDaEmpresa.length,
        fixo,
        pags,
        maquinas: eqsDaEmpresa.length,
      }
    })
    .sort((a, b) => b.fixo - a.fixo)

  const totalFixo = porEmpresa.reduce((a, x) => a + x.fixo, 0)
  const totalMaquinas = porEmpresa.reduce((a, x) => a + x.maquinas, 0)
  const totalPags = porEmpresa.reduce((a, x) => a + x.pags, 0)

  const dadosBarras = porEmpresa.slice(0, 12).map((x) => ({
    nome: x.empresa.nome.length > 14 ? x.empresa.nome.slice(0, 13) + '…' : x.empresa.nome,
    valor: x.fixo,
  }))

  const dadosPizza = porEmpresa
    .filter((x) => x.pags > 0)
    .slice(0, 8)
    .map((x) => ({
      name: x.empresa.nome.length > 16 ? x.empresa.nome.slice(0, 15) + '…' : x.empresa.nome,
      value: x.pags,
    }))

  const focoDados = foco ? porEmpresa.find((x) => x.empresa.id === foco.id) : null
  const focoContratos = foco ? contratos.filter((c) => c.empresa === foco.id) : []
  const focoMaquinas = foco ? equipamentos.filter((q) => q.empresa === foco.id) : []

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Relatório do mês</h1>
          <p className="text-sm text-muted-foreground">
            Competência {competencia} · clique em uma empresa para abrir o detalhe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="w-32 rounded-md border bg-transparent p-2 text-sm"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            placeholder="MM/AAAA"
          />
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Empresas ativas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-teal-700">{porEmpresa.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Contratos ativos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {porEmpresa.reduce((a, x) => a + x.contratos, 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Máquinas (impressoras)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalMaquinas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Fixo do mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{brl(totalFixo)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fixo mensal por empresa (top 12)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dadosBarras} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => 'R$' + v / 1000 + 'k'}
                      fontSize={11}
                    />
                    <YAxis type="category" dataKey="nome" width={120} fontSize={11} />
                    <Tooltip formatter={(v) => brl(Number(v))} />
                    <Bar dataKey="valor" fill="#0d9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Páginas impressas no mês (top 8)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={dadosPizza}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {dadosPizza.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString('pt-BR') + ' págs'} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Empresas (clique para detalhar)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {porEmpresa.map((x) => (
                  <button
                    key={x.empresa.id}
                    className="w-full flex items-center justify-between py-3 text-left hover:bg-slate-50 rounded px-2 -mx-2"
                    onClick={() => setFoco(x.empresa)}
                  >
                    <div>
                      <p className="font-medium text-sm">{x.empresa.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {x.contratos} contrato(s) · {x.maquinas} máquina(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">págs no mês</p>
                        <p className="text-sm font-semibold">{x.pags.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">fixo</p>
                        <p className="text-sm font-semibold text-teal-700">{brl(x.fixo)}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        ver →
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={!!foco} onOpenChange={(open) => !open && setFoco(null)}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{foco?.nome}</DialogTitle>
              </DialogHeader>
              {focoDados && (
                <div className="grid gap-3 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border p-2 text-center">
                      <p className="text-xs text-muted-foreground">Contratos</p>
                      <p className="text-lg font-bold">
                        {focoContratos.filter((c) => c.ativo).length}
                      </p>
                    </div>
                    <div className="rounded-md border p-2 text-center">
                      <p className="text-xs text-muted-foreground">Máquinas</p>
                      <p className="text-lg font-bold">{focoMaquinas.length}</p>
                    </div>
                    <div className="rounded-md border p-2 text-center">
                      <p className="text-xs text-muted-foreground">Págs no mês</p>
                      <p className="text-lg font-bold">{focoDados.pags.toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-1">CNPJ/CPF</p>
                    <p>{foco.cnpj_cpf || '—'}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Responsável do contrato</p>
                    <p>{foco.responsavel_nome || '—'}</p>
                    <p className="text-muted-foreground">{foco.responsavel_email || ''}</p>
                  </div>
                  {focoMaquinas.length > 0 && (
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground mb-2">Máquinas</p>
                      <div className="flex flex-wrap gap-1">
                        {focoMaquinas.map((m) => (
                          <Badge key={m.id} variant="secondary" className="text-xs">
                            {m.patrimonio || m.descricao || m.id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {focoContratos.map((c) => (
                    <div key={c.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{c.numero || 'Contrato'}</p>
                        <Badge className={c.ativo ? 'bg-teal-600' : 'bg-slate-400'}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.paginas_contratadas?.toLocaleString('pt-BR')} págs · exc.{' '}
                        {brl(c.preco_excedente)}/pág · venc. dia {c.dia_vencimento}
                      </p>
                      <p className="font-semibold mt-1">
                        {brl(
                          (c.mensalidade ?? 0) +
                            (c.vlr_dispositivos ?? 0) +
                            (c.vlr_servidores ?? 0) +
                            (c.vlr_servicos ?? 0),
                        )}
                        /mês
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
