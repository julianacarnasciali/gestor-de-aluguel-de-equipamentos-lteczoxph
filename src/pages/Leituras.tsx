import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getEquipamentos,
  getLeituras,
  getLeituraAnterior,
  salvarLeitura,
  type Equipamento,
} from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getLeiturasAll,
  updateEquipamento,
  getContratos,
  fechamentoDeEmergencia,
  fechamentoDoContratoNaCompetencia,
  valorMensalDoContrato,
  brl,
  type Contrato,
} from '@/services/gestor'
import { useAuth } from '@/hooks/use-auth'
import { DialogEquipamento, type DialogEquipState } from '@/components/DialogEquipamento'
import { Plus, Pencil } from 'lucide-react'

const competenciaAtual = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Lista de competências para o seletor (pedido 01/11): em vez de digitar
// MM/AAAA, escolher o mês numa lista. Vai de 2 anos atrás até o fim do ano
// que vem, para fechar mês passado e adiantar o próximo sem digitar.
const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const opcoesCompetencia = () => {
  const hoje = new Date()
  const lista: { valor: string; rotulo: string }[] = []
  for (let ano = hoje.getFullYear() - 2; ano <= hoje.getFullYear() + 1; ano++) {
    for (let m = 0; m < 12; m++) {
      lista.push({
        valor: `${String(m + 1).padStart(2, '0')}/${ano}`,
        rotulo: `${MESES_PT[m]}/${ano}`,
      })
    }
  }
  return lista.reverse() // o mais recente primeiro
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
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const ehMaster = user?.perfil === 'tecnico_master'
  // aviso inline quando alguma chamada ao backend falha
  const [erro, setErro] = useState<string | null>(null)
  const [competencia, setCompetencia] = useState(competenciaAtual())
  // FIX 31/10: competência cujos dados estão REALMENTE na tela. Antes o
  // cabeçalho mostrava o que estava digitado no campo e a lista continuava com
  // a competência anterior — dava para clicar em "Atualizar" achando que era o
  // mês novo e sobrescrever a leitura do mês errado (o botão usa `competencia`
  // no payload, então gravava no mês digitado um valor de outro mês).
  const [compCarregada, setCompCarregada] = useState(competenciaAtual())
  const [maquinas, setMaquinas] = useState<Equipamento[]>([])
  const [estados, setEstados] = useState<Record<string, EstadoMaquina>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [historico, setHistorico] = useState<Record<string, number[]>>({})
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({})
  const [dialogEq, setDialogEq] = useState<DialogEquipState | null>(null)
  // COBRANÇA MENSAL PELO VALOR DO CONTRATO (pedido dela, 05/11/2026):
  // botão por contrato que lança o mês pelo valor mensal, sem excedente de
  // páginas, e emite um relatório que mostra SÓ o valor do contrato.
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [lancandoContrato, setLancandoContrato] = useState<string | null>(null)
  const [jaLancado, setJaLancado] = useState<Record<string, boolean>>({})
  const [msgContrato, setMsgContrato] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(
    null,
  )
  // SENHA DE FECHAMENTO (pedido dela 05/11): o botão de emergência só dispara
  // depois de digitar a senha. A conferência de verdade acontece no SERVIDOR —
  // aqui é só para não mandar a chamada sem senha.
  const [senhaFechamento, setSenhaFechamento] = useState('')
  const [contratoEscolhido, setContratoEscolhido] = useState('')
  const [abertoEmergencia, setAbertoEmergencia] = useState(false)

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

  // 401 = sessão expirada: limpa a sessão e leva ao login com aviso; qualquer
  // outra falha vira aviso inline em vez de derrubar a página
  const tratarFalha = (err: unknown, mensagem: string) => {
    if ((err as { status?: number } | null)?.status === 401) {
      signOut()
      navigate('/login?voltar=%2Fleituras&sessao=expirada', { replace: true })
      return
    }
    console.error(err)
    setErro(mensagem)
  }

  const carregar = (comp: string) => {
    setCarregando(true)
    setErro(null)
    setCompCarregada(comp)
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
      .catch((err) => tratarFalha(err, 'Não foi possível carregar as leituras — tente novamente.'))
      .finally(() => setCarregando(false))

    // contratos ativos + checagem de quem já tem cobrança nesta competência
    getContratos()
      .then(async (todos) => {
        const ativos = todos.filter((c) => c.ativo && valorMensalDoContrato(c) > 0)
        setContratos(ativos)
        const marcado: Record<string, boolean> = {}
        await Promise.all(
          ativos.map(async (c) => {
            try {
              marcado[c.id] = !!(await fechamentoDoContratoNaCompetencia(c.id, comp))
            } catch {
              marcado[c.id] = false
            }
          }),
        )
        setJaLancado(marcado)
      })
      .catch(() => {
        // sem os contratos o botão simplesmente não aparece; a tela de leituras
        // continua funcionando normalmente
        setContratos([])
      })
  }

  // FECHAMENTO DE EMERGÊNCIA — valor do contrato, cobrado na hora, com senha.
  // Usado quando precisa antecipar ou quando o dia 1º falhou e a recorrente
  // não foi lançada. A senha é conferida no servidor.
  const lancarEmergencia = async (c: Contrato) => {
    const emp = c.expand?.empresa
    if (!emp) {
      setMsgContrato({ tipo: 'erro', texto: 'Contrato sem empresa vinculada.' })
      return
    }
    if (!senhaFechamento.trim()) {
      setMsgContrato({ tipo: 'erro', texto: 'Digite a senha de fechamento.' })
      return
    }
    const valor = valorMensalDoContrato(c)
    if (
      !confirm(
        `FORÇAR o fechamento de ${compCarregada} para ${emp.nome}?\n\n` +
          `Valor mensal do contrato: ${brl(valor)}\n` +
          `Sem cobrança de páginas excedentes.\n\n` +
          `O boleto e a nota serão emitidos AGORA, sem esperar a janela de 60 minutos.`,
      )
    )
      return

    setLancandoContrato(c.id)
    setMsgContrato(null)
    try {
      const r = await fechamentoDeEmergencia(c.id, compCarregada, senhaFechamento.trim())
      setJaLancado((p) => ({ ...p, [c.id]: true }))
      setSenhaFechamento('')
      if (r.geracao && r.geracao.ok) {
        setMsgContrato({
          tipo: 'ok',
          texto:
            `Fechamento de ${compCarregada} lançado para ${emp.nome} — ${brl(valor)}. ` +
            `Boleto e nota gerados agora.` +
            (r.geracao.invoiceStatus ? ` Nota: ${r.geracao.invoiceStatus}.` : ''),
        })
      } else {
        setMsgContrato({
          tipo: 'erro',
          texto:
            `Fechamento criado (${r.fechamentoId}), mas a cobrança não foi gerada: ` +
            `${(r.geracao && r.geracao.mensagem) || 'erro desconhecido'}. ` +
            `Use "Emitir agora" no Financeiro.`,
        })
      }
    } catch (err) {
      const qualquer = err as { message?: string; response?: { message?: string } }
      const msg = qualquer?.response?.message || qualquer?.message || String(err)
      setMsgContrato({ tipo: 'erro', texto: 'Não foi possível lançar: ' + msg })
    } finally {
      setLancandoContrato(null)
    }
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
    setErro(null)
    try {
      const payload: Record<string, unknown> = {
        equipamento: eq.id,
        contrato: eq.contrato,
        // grava na competência CARREGADA, nunca na que está sendo digitada
        competencia: compCarregada,
        leitura_anterior: ant,
        leitura_atual: at,
        paginas_mes: Math.max(0, at - ant),
        origem: est.manual ? 'manual' : 'contador',
      }
      // upsert: atualiza a leitura existente da máquina na competência, senão cria
      await salvarLeitura(eq.id, compCarregada, payload)
      setEstados((p) => ({
        ...p,
        [eq.id]: {
          ...est,
          lancada: true,
          alerta: analisar(eq.id, ant, at, historico[eq.id] ?? []),
        },
      }))
    } catch (err) {
      tratarFalha(err, 'Não foi possível lançar a leitura — tente novamente.')
    } finally {
      setSalvando(null)
    }
  }

  const lancarPelaMedia = async (eq: Equipamento) => {
    setSalvando(eq.id)
    setErro(null)
    try {
      const hist = historico[eq.id] ?? []
      const pags = hist.length
        ? Math.round(hist.slice(0, 6).reduce((a, b) => a + b, 0) / Math.min(6, hist.length))
        : 0
      const antAtual = Number(estados[eq.id]?.ant || 0)
      await salvarLeitura(eq.id, compCarregada, {
        equipamento: eq.id,
        contrato: eq.contrato,
        competencia: compCarregada,
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
    } catch (err) {
      tratarFalha(err, 'Não foi possível lançar a leitura — tente novamente.')
    } finally {
      setSalvando(null)
    }
  }

  const grupos = useMemo(() => {
    const mapa = new Map<string, { empresa: string; maquinas: Equipamento[] }>()
    for (const eq of maquinas) {
      // Contrato de cobrança recorrente NÃO tem contador: a mensalidade sai
      // fixa todo dia 1º e não existe leitura a lançar. Esconder aqui evita
      // alguém digitar "1.000" (a franquia) todo mês e sujar o histórico —
      // foi o que aconteceu com Hidrofit, AMR, MID HOME/WORK, WMB, Olímpica e
      // Copec (pedido da Juliana, 03/11).
      if ((eq.expand?.contrato as { sem_leitura?: boolean } | undefined)?.sem_leitura) continue
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
    // empresas em ordem alfabética (pedido 08/10)
    return [...mapa.values()].sort((a, b) =>
      a.empresa.localeCompare(b.empresa, 'pt-BR', { sensitivity: 'base' }),
    )
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
            Competência {compCarregada} · total lançado: {totalMes.toLocaleString('pt-BR')} págs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={competencia}
            onValueChange={(v) => {
              setCompetencia(v)
              carregar(v) // trocar o mês já carrega: não precisa clicar em mais nada
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Competência" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {opcoesCompetencia().map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-48"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa/máquina"
          />
        </div>
      </div>

      {/* FECHAMENTO DE EMERGÊNCIA (pedido dela 05/11/2026) — no TOPO de propósito:
          antes o card ficou no fim da página, depois de todas as empresas, e ela
          não o encontrou. Aqui é a primeira coisa que aparece. */}
      {!carregando && contratos.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg text-amber-900">Fechamento de emergência</CardTitle>
                <p className="text-xs text-amber-800">
                  Cobra o <strong>valor mensal do contrato</strong>, sem página excedente, e emite
                  boleto e nota <strong>na hora</strong>. Use quando precisar antecipar ou quando o
                  dia 1º não lançou a cobrança recorrente.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-800"
                onClick={() => setAbertoEmergencia((v) => !v)}
              >
                {abertoEmergencia ? 'Fechar' : 'Abrir fechamento de emergência'}
              </Button>
            </div>
          </CardHeader>
          {abertoEmergencia && (
            <CardContent>
              {msgContrato && (
                <div
                  role="status"
                  className={`mb-3 flex items-start justify-between gap-2 rounded-md border p-2 text-sm ${
                    msgContrato.tipo === 'ok'
                      ? 'border-teal-300 bg-teal-50 text-teal-900'
                      : 'border-red-300 bg-red-50 text-red-800'
                  }`}
                >
                  <span>{msgContrato.texto}</span>
                  <button
                    className="text-xs underline whitespace-nowrap"
                    onClick={() => setMsgContrato(null)}
                  >
                    fechar
                  </button>
                </div>
              )}

              <div className="mb-3 flex items-end gap-3 flex-wrap">
                <div className="w-64">
                  <Label className="text-xs">Senha de fechamento</Label>
                  <Input
                    type="password"
                    className="h-9"
                    placeholder="obrigatória a cada clique"
                    value={senhaFechamento}
                    onChange={(e) => setSenhaFechamento(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="w-72">
                  <Label className="text-xs">Contrato</Label>
                  <Select value={contratoEscolhido} onValueChange={setContratoEscolhido}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Escolha a empresa" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {contratos
                        .filter((c) => valorMensalDoContrato(c) > 0)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.expand?.empresa?.nome ?? c.empresa} — {brl(valorMensalDoContrato(c))}
                            {jaLancado[c.id] ? ' (já lançado)' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {contratoEscolhido &&
                (() => {
                  const c = contratos.find((x) => x.id === contratoEscolhido)
                  if (!c) return null
                  const feito = jaLancado[c.id]
                  return (
                    <div className="flex items-center gap-3 flex-wrap rounded-md border border-amber-300 bg-white p-3">
                      <div className="flex-1 min-w-48">
                        <div className="text-sm font-medium">
                          {c.expand?.empresa?.nome ?? c.empresa}
                          {feito && (
                            <Badge className="ml-2 bg-teal-600">
                              já tem cobrança em {compCarregada}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          competência {compCarregada} · vencimento no mês seguinte · sem excedente
                        </p>
                      </div>
                      <div className="text-right text-sm font-semibold text-slate-700 w-28">
                        {brl(valorMensalDoContrato(c))}
                      </div>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                        disabled={lancandoContrato === c.id || feito || !senhaFechamento.trim()}
                        onClick={() => lancarEmergencia(c)}
                      >
                        {lancandoContrato === c.id
                          ? 'Gerando...'
                          : feito
                            ? 'Já lançado'
                            : 'Forçar fechamento agora'}
                      </Button>
                    </div>
                  )
                })()}
            </CardContent>
          )}
        </Card>
      )}

      {erro && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <span>{erro}</span>
          <Button size="sm" variant="outline" onClick={() => setErro(null)}>
            Fechar
          </Button>
        </div>
      )}

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
                            <div className="font-medium text-sm">
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
                            </div>
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
