import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getAgenda,
  getEmpresas,
  createAgenda,
  updateAgenda,
  createOrdem,
  type AgendaItem,
  type Empresa,
} from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'

// MÓDULO AGENDA (pedido dela 22/10): visitas técnicas, entregas/instalações e
// compromissos comerciais do Luiz + Juliana. A visita agendada gera a OS
// (botão "Gerar OS" quando realizada). Semana navegável + lista do dia.

const ROTULO_TIPO: Record<string, string> = {
  visita_tecnica: '🔧 Visita técnica',
  entrega_instalacao: '📦 Entrega/Instalação',
  comercial: '💼 Comercial',
  outro: '📌 Outro',
}

const ROTULO_RESP: Record<string, string> = {
  luiz: 'Luiz',
  juliana: 'Juliana',
  ambos: 'Os dois',
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// data do item vem 'YYYY-MM-DD HH:MM:SS.000Z' — pega o dia
const diaDe = (s: string) => (s || '').slice(0, 10)

export default function Agenda() {
  const [params] = useSearchParams()
  const [itens, setItens] = useState<AgendaItem[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [offsetSemana, setOffsetSemana] = useState(0)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // formulário
  const [fTitulo, setFTitulo] = useState('')
  const [fEmpresa, setFEmpresa] = useState('')
  const [fTipo, setFTipo] = useState('visita_tecnica')
  const [fData, setFData] = useState('')
  const [fHora, setFHora] = useState('')
  const [fResp, setFResp] = useState('luiz')
  const [fEndereco, setFEndereco] = useState('')
  const [fDesc, setFDesc] = useState('')

  const carregar = () => {
    getAgenda()
      .then(setItens)
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    getEmpresas().then(setEmpresas)
    carregar()
  }, [])

  // semana exibida: começa no domingo
  const semana = useMemo(() => {
    const base = new Date()
    base.setDate(base.getDate() + offsetSemana * 7)
    const dom = new Date(base)
    dom.setDate(base.getDate() - base.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(dom)
      d.setDate(dom.getDate() + i)
      return d
    })
  }, [offsetSemana])

  const itensSemana = useMemo(
    () =>
      itens
        .filter((i) => {
          const d = diaDe(i.data)
          return semana.some((s) => isoDia(s) === d)
        })
        .sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || ''))),
    [itens, semana],
  )

  const itensDia = (d: Date) => itensSemana.filter((i) => diaDe(i.data) === isoDia(d))

  const salvar = async () => {
    if (!fTitulo.trim() || !fData) {
      setErro('Título e data são obrigatórios.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await createAgenda({
        titulo: fTitulo.trim(),
        empresa: fEmpresa || undefined,
        tipo: fTipo,
        data: `${fData} 00:00:00.000Z`,
        hora: fHora,
        responsavel: fResp,
        endereco: fEndereco,
        descricao: fDesc,
        status: 'agendado',
      })
      setFormAberto(false)
      setFTitulo('')
      setFData('')
      setFHora('')
      setFEndereco('')
      setFDesc('')
      carregar()
    } catch {
      setErro('Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const gerarOs = async (item: AgendaItem) => {
    const hoje = new Date()
    const numero = `${hoje.getFullYear()}/${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}-${String(hoje.getHours()).padStart(2, '0')}${String(hoje.getMinutes()).padStart(2, '0')}`
    await createOrdem({
      numero,
      empresa: item.empresa,
      agenda: item.id,
      tipo:
        item.tipo === 'entrega_instalacao'
          ? 'instalacao'
          : item.tipo === 'comercial'
            ? 'outro'
            : 'visita_tecnica',
      data: item.data,
      descricao: `Originada da agenda: ${item.titulo}`,
      tecnico: ROTULO_RESP[item.responsavel] || '',
      status: 'aberta',
    })
    await updateAgenda(item.id, { os_gerada: true, status: 'realizado' })
    carregar()
  }

  const marcar = async (item: AgendaItem, status: string) => {
    await updateAgenda(item.id, { status })
    carregar()
  }

  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome || ''

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Visitas técnicas, entregas e compromissos — a visita realizada gera a Ordem de Serviço
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOffsetSemana(offsetSemana - 1)}>
            ←
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffsetSemana(0)}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffsetSemana(offsetSemana + 1)}>
            →
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700"
            size="sm"
            onClick={() => setFormAberto(!formAberto)}
          >
            <Plus className="h-4 w-4 mr-1" /> Novo compromisso
          </Button>
        </div>
      </div>

      {formAberto && (
        <Card className="mb-6">
          <CardContent className="py-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Título *</Label>
                <Input
                  value={fTitulo}
                  onChange={(e) => setFTitulo(e.target.value)}
                  placeholder="ex.: Manutenção preventiva — impressoras"
                />
              </div>
              <div className="space-y-1">
                <Label>Empresa (opcional)</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={fEmpresa}
                  onChange={(e) => setFEmpresa(e.target.value)}
                >
                  <option value="">— sem empresa (compromisso interno) —</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={fTipo}
                  onChange={(e) => setFTipo(e.target.value)}
                >
                  <option value="visita_tecnica">Visita técnica</option>
                  <option value="entrega_instalacao">Entrega/Instalação</option>
                  <option value="comercial">Comercial</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Data *</Label>
                <Input type="date" value={fData} onChange={(e) => setFData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Hora</Label>
                <Input type="time" value={fHora} onChange={(e) => setFHora(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Responsável</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={fResp}
                  onChange={(e) => setFResp(e.target.value)}
                >
                  <option value="luiz">Luiz</option>
                  <option value="juliana">Juliana</option>
                  <option value="ambos">Os dois</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Endereço (se fora da empresa cadastrada)</Label>
              <Input
                value={fEndereco}
                onChange={(e) => setFEndereco(e.target.value)}
                placeholder="opcional"
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="opcional"
              />
            </div>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                size="sm"
                disabled={salvando}
                onClick={salvar}
              >
                {salvando ? 'Salvando…' : 'Salvar compromisso'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {/* visão semanal */}
          <div className="mb-6 grid gap-2 md:grid-cols-7">
            {semana.map((d, idx) => {
              const doDia = itensDia(d)
              const hoje = isoDia(d) === isoDia(new Date())
              return (
                <Card key={idx} className={hoje ? 'border-teal-600 border-2' : ''}>
                  <CardContent className="p-2">
                    <p
                      className={`text-xs font-bold mb-1 ${hoje ? 'text-teal-700' : 'text-slate-500'}`}
                    >
                      {DIAS[idx]} {String(d.getDate()).padStart(2, '0')}
                    </p>
                    {doDia.length === 0 ? (
                      <p className="text-[11px] text-slate-300">—</p>
                    ) : (
                      <div className="space-y-1">
                        {doDia.map((i) => (
                          <div
                            key={i.id}
                            className={`rounded border px-1.5 py-1 text-[11px] leading-tight ${
                              i.status === 'cancelado'
                                ? 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                                : i.status === 'realizado'
                                  ? 'border-lime-200 bg-lime-50 text-lime-800'
                                  : 'border-teal-200 bg-teal-50 text-teal-900'
                            }`}
                          >
                            {i.hora && <b>{i.hora}</b>} {i.titulo}
                            {i.empresa && (
                              <span className="block text-[10px] text-slate-500">
                                {nomeEmpresa(i.empresa)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* lista completa dos próximos */}
          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">
            Todos os compromissos ({itens.length})
          </h2>
          <div className="space-y-2">
            {itensSemana.length === 0 && itens.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum compromisso ainda. Clique em "Novo compromisso" para agendar.
                </CardContent>
              </Card>
            )}
            {[...itens]
              .sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')))
              .slice(0, 30)
              .map((i) => (
                <Card key={i.id}>
                  <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-56">
                      <p className="font-medium text-sm">
                        {ROTULO_TIPO[i.tipo] || i.tipo} — {i.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {diaDe(i.data).split('-').reverse().join('/')}
                        {i.hora ? ` · ${i.hora}` : ''} · {ROTULO_RESP[i.responsavel] || '—'}
                        {i.empresa ? ` · ${nomeEmpresa(i.empresa)}` : ''}
                      </p>
                    </div>
                    {i.status === 'agendado' && <Badge>Agendado</Badge>}
                    {i.status === 'realizado' && <Badge className="bg-lime-600">Realizado</Badge>}
                    {i.status === 'cancelado' && <Badge variant="secondary">Cancelado</Badge>}
                    {i.status === 'agendado' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-lime-600 text-lime-700 hover:bg-lime-50"
                          onClick={() => marcar(i, 'realizado')}
                        >
                          ✓ Realizado
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-400 text-slate-600 hover:bg-slate-50"
                          onClick={() => marcar(i, 'cancelado')}
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                    {i.status === 'realizado' && !i.os_gerada && i.empresa && (
                      <Button
                        size="sm"
                        className="bg-teal-600 hover:bg-teal-700"
                        onClick={() => gerarOs(i)}
                      >
                        📄 Gerar OS
                      </Button>
                    )}
                    {i.os_gerada && <Badge variant="outline">OS gerada</Badge>}
                  </CardContent>
                </Card>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
