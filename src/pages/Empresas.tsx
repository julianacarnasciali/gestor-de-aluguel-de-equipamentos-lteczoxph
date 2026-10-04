import { useEffect, useState } from 'react'
import {
  getEmpresas,
  getContratos,
  updateEmpresa,
  type Empresa,
  type Contato,
} from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const MESES: Record<string, string> = {
  '01': 'Janeiro',
  '02': 'Fevereiro',
  '03': 'Março',
  '04': 'Abril',
  '05': 'Maio',
  '06': 'Junho',
  '07': 'Julho',
  '08': 'Agosto',
  '09': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro',
}

const contatoVazio = (): Contato => ({ nome: '', setor: '', email: '' })

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [reajustes, setReajustes] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  useEffect(() => {
    Promise.all([getEmpresas(), getContratos()])
      .then(([emps, ctrs]) => {
        setEmpresas(emps)
        const mapa: Record<string, string> = {}
        for (const c of ctrs) {
          if (!c.ativo) continue
          const pct = c.reajuste_percentual ? ` — ${c.reajuste_percentual}%` : ''
          mapa[c.empresa] = `${MESES[c.reajuste_mes] ?? c.reajuste_mes}${pct}`
        }
        setReajustes(mapa)
      })
      .finally(() => setCarregando(false))
  }, [])

  const abrirEdicao = (e: Empresa) => {
    let base: Contato[] = e.contatos && e.contatos.length ? [...e.contatos] : []
    if (!base.length && (e.responsavel_email || e.responsavel_nome)) {
      base = [{ nome: e.responsavel_nome ?? '', setor: '', email: e.responsavel_email ?? '' }]
    }
    while (base.length < 3) base.push(contatoVazio())
    setEditando({ ...e, contatos: base.slice(0, 3) })
    setErroForm('')
  }

  const alternarNota = async (e: Empresa, valor: boolean) => {
    setEmpresas((prev) => prev.map((x) => (x.id === e.id ? { ...x, emite_nf: valor } : x)))
    try {
      await updateEmpresa(e.id, { emite_nf: valor })
    } catch {
      setEmpresas((prev) => prev.map((x) => (x.id === e.id ? { ...x, emite_nf: !valor } : x)))
    }
  }

  const setContato = (idx: number, campo: keyof Contato, valor: string) => {
    if (!editando) return
    const contatos = editando.contatos.map((c, i) => (i === idx ? { ...c, [campo]: valor } : c))
    setEditando({ ...editando, contatos })
  }

  const salvarEdicao = async () => {
    if (!editando) return
    const contatos = editando.contatos
      .map((c) => ({
        nome: (c.nome ?? '').trim(),
        setor: (c.setor ?? '').trim(),
        email: (c.email ?? '').trim(),
      }))
      .filter((c) => c.email || c.nome || c.setor)
    if (!contatos[0]?.email) {
      setErroForm('O 1º e-mail (responsável pelo contrato) é obrigatório.')
      return
    }
    setSalvando(true)
    try {
      await updateEmpresa(editando.id, {
        nome: editando.nome,
        cnpj_cpf: editando.cnpj_cpf,
        telefone: editando.telefone,
        email: editando.email,
        endereco: editando.endereco,
        grupo: editando.grupo,
        unidade: editando.unidade,
        responsavel_nome: contatos[0].nome,
        responsavel_email: contatos[0].email,
        tipo_cliente: editando.tipo_cliente || 'contrato',
        contatos,
        indicado_por: editando.indicado_por || '',
        ativo: editando.ativo,
        emite_nf: editando.emite_nf,
        observacoes: editando.observacoes ?? '',
      })
      setEmpresas((prev) => prev.map((x) => (x.id === editando.id ? { ...editando, contatos } : x)))
      setEditando(null)
    } catch {
      setErroForm('Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const ativas = empresas.filter((e) => e.ativo)
  const inativas = empresas.filter((e) => !e.ativo)

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Empresas / Clientes</h1>
        <p className="text-sm text-muted-foreground">
          {ativas.length} ativas · {inativas.length} históricas · clique no card para editar
        </p>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...ativas, ...inativas].map((e) => {
            const indicados = empresas.filter((o) => o.indicado_por === e.id)
            return (
              <Card
                key={e.id}
                className={`cursor-pointer transition hover:shadow-md ${e.ativo ? '' : 'opacity-60'}`}
                onClick={() => abrirEdicao(e)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{e.nome}</CardTitle>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="bg-teal-600">
                        {e.tipo_cliente === 'avulso' ? 'Avulso' : 'Contrato'}
                      </Badge>
                      {!e.ativo && <Badge variant="secondary">Histórica</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {e.cnpj_cpf && <p className="text-muted-foreground">{e.cnpj_cpf}</p>}
                  {e.telefone && <p className="text-muted-foreground">☎ {e.telefone}</p>}
                  {e.responsavel_email && (
                    <p className="text-muted-foreground">✉ {e.responsavel_email}</p>
                  )}
                  {e.indicado_por && (
                    <p className="text-xs text-muted-foreground">
                      ↳ indicado por {e.expand?.indicado_por?.nome ?? '—'}
                    </p>
                  )}
                  {indicados.length > 0 && (
                    <p className="text-xs text-teal-700">indicou {indicados.length} cliente(s)</p>
                  )}
                  <div
                    className="flex items-center justify-between pt-2 border-t"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <span className="text-sm font-medium">Emite nota fiscal</span>
                    <Switch checked={e.emite_nf} onCheckedChange={(v) => alternarNota(e, v)} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={editando.nome}
                  onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>CNPJ/CPF</Label>
                  <Input
                    value={editando.cnpj_cpf}
                    onChange={(e) => setEditando({ ...editando, cnpj_cpf: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input
                    value={editando.telefone}
                    onChange={(e) => setEditando({ ...editando, telefone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>E-mail da empresa</Label>
                  <Input
                    value={editando.email}
                    onChange={(e) => setEditando({ ...editando, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Endereço</Label>
                  <Input
                    value={editando.endereco}
                    onChange={(e) => setEditando({ ...editando, endereco: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Grupo</Label>
                  <Input
                    value={editando.grupo}
                    onChange={(e) => setEditando({ ...editando, grupo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unidade</Label>
                  <Input
                    value={editando.unidade}
                    onChange={(e) => setEditando({ ...editando, unidade: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de cliente</Label>
                  <select
                    className="w-full rounded-md border bg-transparent p-2 text-sm"
                    value={editando.tipo_cliente || 'contrato'}
                    onChange={(e) =>
                      setEditando({
                        ...editando,
                        tipo_cliente: e.target.value as Empresa['tipo_cliente'],
                      })
                    }
                  >
                    <option value="contrato">
                      Contrato (recorrente — locação/serviço/equipamento)
                    </option>
                    <option value="avulso">Avulso (serviço único — backup, atualização...)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Reajuste do contrato</Label>
                  <p className="rounded-md border p-2 text-sm bg-slate-50">
                    {reajustes[editando.id] ?? 'Sem contrato ativo'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>E-mails para envio do fechamento (1º obrigatório)</Label>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
                    <Input
                      placeholder={idx === 0 ? 'Nome (obrigatório)' : 'Nome'}
                      value={editando.contatos[idx]?.nome ?? ''}
                      onChange={(e) => setContato(idx, 'nome', e.target.value)}
                    />
                    <Input
                      placeholder="Setor"
                      value={editando.contatos[idx]?.setor ?? ''}
                      onChange={(e) => setContato(idx, 'setor', e.target.value)}
                    />
                    <Input
                      placeholder={idx === 0 ? 'E-mail (obrigatório)' : 'E-mail'}
                      type="email"
                      value={editando.contatos[idx]?.email ?? ''}
                      onChange={(e) => setContato(idx, 'email', e.target.value)}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Ex.: gerente, administrativo, faturamento — o fechamento vai para todos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Indicado por</Label>
                  <select
                    className="w-full rounded-md border bg-transparent p-2 text-sm"
                    value={editando.indicado_por || ''}
                    onChange={(e) => setEditando({ ...editando, indicado_por: e.target.value })}
                  >
                    <option value="">—</option>
                    {empresas
                      .filter((o) => o.id !== editando.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Já indicou</Label>
                  <p className="rounded-md border p-2 text-sm bg-slate-50">
                    {empresas
                      .filter((o) => o.indicado_por === editando.id)
                      .map((o) => o.nome)
                      .join(', ') || '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Observações</Label>
                <Input
                  value={editando.observacoes}
                  onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">Emite nota fiscal</span>
                <Switch
                  checked={editando.emite_nf}
                  onCheckedChange={(v) => setEditando({ ...editando, emite_nf: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">Empresa ativa</span>
                <Switch
                  checked={editando.ativo}
                  onCheckedChange={(v) => setEditando({ ...editando, ativo: v })}
                />
              </div>

              {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={salvarEdicao}
                  disabled={salvando}
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
