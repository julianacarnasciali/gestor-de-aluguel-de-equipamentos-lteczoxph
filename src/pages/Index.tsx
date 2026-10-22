import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getEmpresas,
  getContratos,
  getEquipamentos,
  getLeituras,
  getFechamentos,
  pbExport,
  type Empresa,
  type Contrato,
  type Equipamento,
  type Fechamento,
} from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'

// PÁGINA INICIAL EM QUADRADINHOS (14/10, pedido dela — aprovado no mockup):
// card por empresa com quadradinhos por ação (Contrato · Leitura · Financeiro ·
// Equip. · Chamado), avisos no topo, ferramentas gerais numa faixa embaixo e
// históricas colapsadas. O menu lateral some nesta página (Layout esconde).

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const normalizar = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '')

interface Avisos {
  empresasSemLeitura: Set<string>
  totalLeiturasFaltando: number
  empresasFechamentoPendente: Set<string>
  totalFechPendentes: number
  chamadosAbertos: number
  // REAJUSTE/VENCIMENTO (pedido dela 23/10): empresas que entram no mês do
  // reajuste (marca dos 11 meses) ou com contrato vencendo em 1-2 meses
  empresasReajuste: Set<string>
  totalReajustes: number
}

type Quad = { rotulo: string; ico: string; to: string; destaque?: boolean }

function CardEmpresa({
  empresa,
  quads,
  aviso,
}: {
  empresa: string
  quads: Quad[]
  aviso: { tipo: 'ok' | 'leitura' | 'fechamento' | 'reajuste'; texto: string }
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <b className="text-[15px] leading-snug text-slate-900">{empresa}</b>
      </div>
      {aviso.tipo === 'ok' ? (
        <div className="mb-2 rounded-lg border border-lime-200 bg-lime-50 px-2.5 py-1 text-xs text-lime-700">
          ✓ {aviso.texto}
        </div>
      ) : aviso.tipo === 'leitura' ? (
        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700">
          ⚠ {aviso.texto}
        </div>
      ) : aviso.tipo === 'reajuste' ? (
        <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
          📅 {aviso.texto}
        </div>
      ) : (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
          🧾 {aviso.texto}
        </div>
      )}
      <div className="grid grid-cols-5 gap-2">
        {quads.map((q) => (
          <Link
            key={q.rotulo}
            to={q.to}
            className={`rounded-lg border px-1 pb-1.5 pt-2 text-center text-[11px] leading-tight ${
              q.destaque
                ? 'border-teal-600 bg-teal-600 font-bold text-white hover:bg-teal-700'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="mb-0.5 block text-base">{q.ico}</span>
            {q.rotulo}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Index() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [avisos, setAvisos] = useState<Avisos>({
    empresasSemLeitura: new Set(),
    totalLeiturasFaltando: 0,
    empresasFechamentoPendente: new Set(),
    totalFechPendentes: 0,
    chamadosAbertos: 0,
    empresasReajuste: new Set(),
    totalReajustes: 0,
  })
  const [busca, setBusca] = useState('')
  const [mostrarHistoricas, setMostrarHistoricas] = useState(false)
  const [carregando, setCarregando] = useState(true)
  // texto do aviso de reajuste/vencimento por empresa (pedido dela 23/10)
  const [avisosReajuste, setAvisosReajuste] = useState<Record<string, string>>({})

  useEffect(() => {
    const comp = competenciaAtual()
    const chamadosTry = pbExport
      .collection('chamados')
      .getFullList<{ id: string; status?: string }>({ sort: '-created' })
      .catch(() => [] as { id: string; status?: string }[])

    Promise.all([
      getEmpresas(),
      getContratos(),
      getEquipamentos(),
      getLeituras(comp),
      getFechamentos(comp),
      chamadosTry,
    ])
      .then(([emps, ctrs, eqs, leis, fechs, chams]) => {
        setEmpresas(emps)
        setContratos(ctrs)
        setEquipamentos(eqs)
        setFechamentos(fechs)

        const ativas = emps.filter((e) => e.ativo)
        const idsAtivas = new Set(ativas.map((e) => e.id))
        const ctrsAtivos = ctrs.filter((c) => c.ativo && idsAtivas.has(c.empresa))

        // leituras faltando: impressoras ativas de contratos de leitura sem
        // leitura lançada na competência
        const ctrLeitura = new Set(
          ctrsAtivos.filter((c) => c.tipo_cobranca !== 'media').map((c) => c.empresa),
        )
        const eqsImpressora = eqs.filter((q) => q.ativo && ctrLeitura.has(q.empresa))
        const comLeitura = new Set(leis.map((l) => l.equipamento))
        const semLeitura = eqsImpressora.filter((q) => !comLeitura.has(q.id))
        const empresasSemLeitura = new Set(semLeitura.map((q) => q.empresa))

        // fechamento pendente = rascunho ou emitido (não enviado/pago)
        const pend = fechs.filter((f) => f.status === 'rascunho' || f.status === 'emitido')
        const empresasFechamentoPendente = new Set(pend.map((f) => f.empresa))

        const abertos = chams.filter(
          (c) => c.status && !['resolvido', 'cancelado', 'concluido'].includes(c.status),
        )

        // REAJUSTE/VENCIMENTO (pedido dela 23/10): reajuste no mês que vem
        // (marca dos 11 meses) ou contrato vencendo em 1-2 meses
        const hoje = new Date()
        const mesNum = hoje.getMonth() + 1
        const anoNum = hoje.getFullYear()
        const nmNum = mesNum === 12 ? 1 : mesNum + 1
        const nmAno = mesNum === 12 ? anoNum + 1 : anoNum
        const numMes = (s: string) => {
          const p = (s || '').split('/')
          return Number(p[1]) * 12 + Number(p[0])
        }
        const atualNum = anoNum * 12 + mesNum
        const empresasReajuste = new Set<string>()
        let totalReajustes = 0
        const avisoReajusteEmpresa: Record<string, string> = {}
        for (const c of ctrsAtivos) {
          const mesReaj = (c.reajuste_mes || '').split('/')[0]
          if (/^\d{2}$/.test(mesReaj) && Number(mesReaj) === nmNum) {
            empresasReajuste.add(c.empresa)
            totalReajustes++
            avisoReajusteEmpresa[c.empresa] =
              `Reajuste em ${String(nmNum).padStart(2, '0')}/${nmAno} — definir % e avisar cliente`
          }
          const fim = c.mes_fim || ''
          if (/^\d{2}\/\d{4}$/.test(fim)) {
            const diff = numMes(fim) - atualNum
            if (diff === 1 || diff === 2) {
              empresasReajuste.add(c.empresa)
              totalReajustes++
              avisoReajusteEmpresa[c.empresa] =
                avisoReajusteEmpresa[c.empresa] || `Contrato vence ${fim} — preparar renovação`
            }
          }
        }

        setAvisos({
          empresasSemLeitura,
          totalLeiturasFaltando: semLeitura.length,
          empresasFechamentoPendente,
          totalFechPendentes: pend.length,
          chamadosAbertos: abertos.length,
          empresasReajuste,
          totalReajustes,
        })
        setAvisosReajuste(avisoReajusteEmpresa)
      })
      .finally(() => setCarregando(false))
  }, [])

  const ativas = useMemo(
    () => empresas.filter((e) => e.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [empresas],
  )
  const historicas = useMemo(() => empresas.filter((e) => !e.ativo), [empresas])

  const filtradas = useMemo(() => {
    const q = normalizar(busca)
    if (!q) return ativas
    return ativas.filter((e) => normalizar(e.nome).includes(q))
  }, [ativas, busca])

  const quadsDe = (e: Empresa): Quad[] => [
    { rotulo: 'Contrato', ico: '📄', to: `/empresas?abrir=${e.id}` },
    {
      rotulo: 'Leitura',
      ico: '🔢',
      to: '/leituras',
      destaque: avisos.empresasSemLeitura.has(e.id),
    },
    {
      rotulo: 'Financeiro',
      ico: '💰',
      to: '/financeiro',
      destaque: avisos.empresasFechamentoPendente.has(e.id),
    },
    { rotulo: 'Equip.', ico: '🖨️', to: `/patrimonio?empresa=${e.id}` },
    { rotulo: 'Chamado', ico: '🔧', to: `/chamados?empresa=${e.id}` },
  ]

  const avisoDe = (
    e: Empresa,
  ): { tipo: 'ok' | 'leitura' | 'fechamento' | 'reajuste'; texto: string } => {
    if (avisos.empresasSemLeitura.has(e.id)) {
      const faltam =
        equipamentos.filter(
          (q) => q.ativo && q.empresa === e.id && avisos.empresasSemLeitura.has(e.id),
        ).length || 1
      return { tipo: 'leitura', texto: `Faltam ${faltam} leitura(s) de ${competenciaAtual()}` }
    }
    if (avisos.empresasFechamentoPendente.has(e.id))
      return { tipo: 'fechamento', texto: `Fechamento de ${competenciaAtual()} pendente` }
    if (avisos.empresasReajuste.has(e.id))
      return {
        tipo: 'reajuste',
        texto: avisosReajuste[e.id] || 'Reajuste/vencimento se aproximando',
      }
    return { tipo: 'ok', texto: 'Em dia' }
  }

  const ferramentas = [
    { rotulo: 'Novo cliente', ico: '➕', to: '/empresas?novo=1' },
    { rotulo: 'Empresas', ico: '🏢', to: '/empresas' },
    { rotulo: 'Etiquetas QR', ico: '🏷️', to: '/etiquetas' },
    { rotulo: 'Patrimônio', ico: '🗂️', to: '/patrimonio' },
    { rotulo: 'Chamados', ico: '🔧', to: '/chamados' },
    { rotulo: 'Fechamento', ico: '🧾', to: '/fechamentos' },
    { rotulo: 'Serviço avulso', ico: '🛠️', to: '/servico-avulso' },
    { rotulo: 'Relatório', ico: '📊', to: '/relatorio' },
    { rotulo: 'Assistente IA', ico: '🤖', to: '/agente' },
  ]

  return (
    <div className="container mx-auto px-4 py-6">
      {/* topo: busca + usuário */}
      <div className="mb-4 flex items-center gap-3">
        <Input
          className="max-w-md"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar empresa…"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              signOut()
              navigate('/login')
            }}
          >
            Sair
          </Button>
        </div>
      </div>

      {/* faixa de avisos */}
      {!carregando && (
        <div className="mb-5 flex flex-wrap gap-2">
          {avisos.totalLeiturasFaltando > 0 && (
            <Link
              to="/leituras"
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[13px] text-slate-700 shadow-sm hover:bg-red-50"
            >
              🔢 Leituras faltando <b className="text-red-600">{avisos.totalLeiturasFaltando}</b>
            </Link>
          )}
          {avisos.totalFechPendentes > 0 && (
            <Link
              to="/fechamentos"
              className="rounded-lg border bg-white px-3 py-1.5 text-[13px] text-slate-700 shadow-sm hover:bg-amber-50"
            >
              🧾 Fechamentos pendentes <b className="text-amber-600">{avisos.totalFechPendentes}</b>
            </Link>
          )}
          {avisos.chamadosAbertos > 0 && (
            <Link
              to="/chamados"
              className="rounded-lg border bg-white px-3 py-1.5 text-[13px] text-slate-700 shadow-sm hover:bg-sky-50"
            >
              🔧 Chamados abertos <b className="text-sky-700">{avisos.chamadosAbertos}</b>
            </Link>
          )}
          {avisos.totalReajustes > 0 && (
            <Link
              to="/empresas"
              className="rounded-lg border bg-white px-3 py-1.5 text-[13px] text-slate-700 shadow-sm hover:bg-violet-50"
            >
              📅 Reajustes/vencimentos <b className="text-violet-700">{avisos.totalReajustes}</b>
            </Link>
          )}
          {avisos.totalLeiturasFaltando === 0 &&
            avisos.totalFechPendentes === 0 &&
            avisos.chamadosAbertos === 0 && (
              <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-1.5 text-[13px] text-lime-700">
                ✓ Tudo em dia — competência {competenciaAtual()}
              </div>
            )}
        </div>
      )}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">
            Empresas ativas ({filtradas.length}) — clique no quadradinho do que quer fazer
          </h2>
          <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtradas.map((e) => (
              <CardEmpresa key={e.id} empresa={e.nome} quads={quadsDe(e)} aviso={avisoDe(e)} />
            ))}
            {filtradas.length === 0 && (
              <p className="text-muted-foreground">Nenhuma empresa encontrada para "{busca}".</p>
            )}
          </div>

          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">Ferramentas gerais</h2>
          <div className="mb-6 flex flex-wrap gap-2">
            {ferramentas.map((f) => (
              <Link
                key={f.rotulo}
                to={f.to}
                className="rounded-xl border bg-white px-4 py-2 text-center text-xs text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <span className="mb-0.5 block text-lg">{f.ico}</span>
                {f.rotulo}
              </Link>
            ))}
          </div>

          {historicas.length > 0 && (
            <div className="rounded-xl border border-dashed bg-white px-4 py-3 text-[13px] text-slate-500">
              <button
                className="flex w-full items-center justify-between"
                onClick={() => setMostrarHistoricas((v) => !v)}
              >
                <span>
                  🗄️ Históricas ({historicas.length}) —{' '}
                  {historicas
                    .slice(0, 4)
                    .map((h) => h.nome)
                    .join(', ')}
                  {historicas.length > 4 ? '…' : ''}
                </span>
                <span>{mostrarHistoricas ? 'ocultar ▴' : 'mostrar ▾'}</span>
              </button>
              {mostrarHistoricas && (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {historicas.map((h) => (
                    <Link
                      key={h.id}
                      to={`/empresas?abrir=${h.id}`}
                      className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-600 hover:bg-slate-100"
                    >
                      {h.nome}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
