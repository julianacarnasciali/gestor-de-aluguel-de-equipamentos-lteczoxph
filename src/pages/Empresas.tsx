import { useEffect, useRef, useState } from 'react'
import {
  getEmpresas,
  getContratos,
  getEquipamentos,
  updateEmpresa,
  type Empresa,
  type Contato,
  type Equipamento,
} from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DialogEquipamentosEmpresa } from '@/components/DialogEquipamentosEmpresa'
import { Package } from 'lucide-react'
import { consultarCnpj } from '@/lib/cnpj'
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
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [dialogEqEmpresa, setDialogEqEmpresa] = useState<Empresa | null>(null)
  // busca de CEP (ViaCEP — base oficial dos Correios)
  const [cepBuscando, setCepBuscando] = useState(false)
  const [cepErro, setCepErro] = useState('')
  const [cep, setCep] = useState('')
  // busca de CNPJ (Receita Federal) — preenche nome/endereço/CEP sozinho
  const [cnpjBuscando, setCnpjBuscando] = useState(false)
  const [cnpjAviso, setCnpjAviso] = useState('')
  const ultimoCnpjBuscado = useRef('')

  // montagem do endereço no PADRÃO DO BANCO ASAAS (NF exige):
  // "Rua X, N, Bairro, Cidade - UF, CEP" — complemento vai no fim, separado por vírgula
  const montarEndereco = (
    dados: {
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    },
    numero: string,
    complemento: string,
    cepOk: string,
  ) => {
    const rua = dados.logradouro || ''
    const bairro = dados.bairro || ''
    const cid = dados.localidade || ''
    const uf = dados.uf || ''
    const partes = [rua, numero, bairro, `${cid} - ${uf}`, cepOk].filter(Boolean)
    const base = partes.join(', ')
    return complemento ? `${base}, ${complemento}` : base
  }

  // máscara de telefone: cel (11) → (41) 99999-9999 · fixo (10) → (41) 3015-7441
  // fixo e celular vão para campos DIFERENTES no Asaas (phone x mobilePhone)
  const formatarFone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 2) return d.length ? `(${d}` : ''
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }

  // dispara quando o CNPJ completa 14 dígitos: preenche nome/endereço/CEP
  const buscarCnpj = async (valor: string) => {
    const limpo = (valor || '').replace(/\D/g, '')
    if (limpo.length !== 14 || !editando) return
    if (ultimoCnpjBuscado.current === limpo) return // evita repetir a mesma busca
    ultimoCnpjBuscado.current = limpo
    setCnpjBuscando(true)
    setCnpjAviso('')
    try {
      const r = await consultarCnpj(limpo)
      if (!r.ok || !r.dados) {
        setCnpjAviso(r.erro || 'CNPJ não encontrado.')
        ultimoCnpjBuscado.current = ''
        return
      }
      // só preenche nome se estiver vazio (não sobrescreve o que ela digitou)
      const e = editando
      setEditando({
        ...e,
        nome: e.nome?.trim() ? e.nome : r.dados.razao_social || e.nome,
        endereco: r.endereco || e.endereco,
      })
      if (r.cep) setCep(r.cep)
      if (r.avisoCep) setCnpjAviso(r.avisoCep)
    } catch {
      setCnpjAviso('Consulta falhou — preenche na mão.')
      ultimoCnpjBuscado.current = ''
    } finally {
      setCnpjBuscando(false)
    }
  }

  const buscarCep = async (cepDigitado: string) => {
    const cepLimpo = cepDigitado.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return
    setCepBuscando(true)
    setCepErro('')
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const d = await r.json()
      if (d.erro) {
        setCepErro('CEP não encontrado — confere o número.')
        return
      }
      if (!editando) return
      // extrai número/complemento do endereço atual — mas o endereço pode estar
      // no padrão completo "Rua, N, Bairro, Cidade - UF, CEP" (5 partes): ignora
      // bairro/cidade/CEP repetidos (proteção contra duplicação do CEP-first)
      const atual = editando.endereco || ''
      const partes = atual
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      let numero = ''
      let complemento = ''
      if (partes.length >= 2) {
        numero = partes[1] // 2ª parte é sempre o número
        // complemento = tudo que NÃO é o padrão (só faz sentido se sobrar algo
        // depois do CEP — partes 5+)
        if (partes.length > 5) complemento = partes.slice(5).join(', ')
      }
      setEditando({
        ...editando,
        cep: cepLimpo,
        endereco: montarEndereco(d, numero, complemento, cepLimpo),
      })
    } catch {
      setCepErro('Falhou a consulta — preenche na mão.')
    } finally {
      setCepBuscando(false)
    }
  }

  useEffect(() => {
    Promise.all([getEmpresas(), getContratos(), getEquipamentos()])
      .then(([emps, ctrs, eqs]) => {
        setEmpresas(emps)
        setEquipamentos(eqs)
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
    ultimoCnpjBuscado.current = ''
    setCnpjAviso('')
    setEditando({ ...e, contatos: base.slice(0, 3) })
    // preenche o campo CEP do form a partir do endereço salvo (se tiver)
    const mcep = (e.endereco || '').match(/(\d{5}-?\d{3})\s*,?\s*[^,]*$/)
    setCep(mcep ? mcep[1].replace('-', '') : '')
    setCepErro('')
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
        cep:
          cep.replace(/\D/g, '') ||
          (editando.endereco || '').match(/(\d{8})\s*,?[^,]*$/)?.[1] ||
          '',
        grupo: editando.grupo,
        unidade: editando.unidade,
        responsavel_nome: contatos[0].nome,
        responsavel_email: contatos[0].email,
        tipo_cliente: editando.tipo_cliente || 'misto',
        contatos,
        indicado_por: editando.indicado_por || '',
        indicado_por_texto: editando.indicado_por_texto || '',
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
                        {e.tipo_cliente === 'avulso'
                          ? 'Avulso'
                          : e.tipo_cliente === 'computador'
                            ? 'Só computador'
                            : e.tipo_cliente === 'impressora'
                              ? 'Só impressora'
                              : 'Misto'}
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
                  {(e.indicado_por || e.indicado_por_texto) && (
                    <p className="text-xs text-muted-foreground">
                      ↳ indicado por{' '}
                      {e.indicado_por
                        ? (e.expand?.indicado_por?.nome ?? '—')
                        : e.indicado_por_texto}
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
                  <div
                    className="flex items-center justify-between pt-1"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <span />
                    <div className="relative group">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-teal-600 text-teal-700 hover:bg-teal-50"
                        onClick={() => setDialogEqEmpresa(e)}
                      >
                        <Package className="h-3 w-3 mr-1" /> Equipamentos
                      </Button>
                      {(() => {
                        const eqs = equipamentos.filter((q) => q.empresa === e.id)
                        if (eqs.length === 0) return null
                        return (
                          <div className="absolute right-0 bottom-full mb-2 w-64 rounded-md border bg-white shadow-lg p-3 text-xs opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
                            <p className="font-medium mb-1 text-slate-700">
                              {eqs.length} equipamento(s)
                            </p>
                            {eqs.slice(0, 6).map((q) => (
                              <p key={q.id} className="text-slate-600 truncate">
                                • {q.patrimonio || q.descricao || q.id}
                                {q.numero_serie ? ` — série ${q.numero_serie}` : ''}
                              </p>
                            ))}
                            {eqs.length > 6 && (
                              <p className="text-slate-400 italic">+ {eqs.length - 6} outros...</p>
                            )}
                          </div>
                        )
                      })()}
                    </div>
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
                  <Label>
                    CNPJ/CPF{' '}
                    {cnpjBuscando && (
                      <span className="text-xs text-teal-700">buscando na Receita…</span>
                    )}
                  </Label>
                  <Input
                    value={editando.cnpj_cpf}
                    onChange={(e) => {
                      setEditando({ ...editando, cnpj_cpf: e.target.value })
                      const digits = e.target.value.replace(/\D/g, '')
                      if (digits.length === 14) buscarCnpj(digits)
                    }}
                    onBlur={(e) => buscarCnpj(e.target.value)}
                    placeholder="14 dígitos — busca o endereço na Receita"
                  />
                  {cnpjAviso && <p className="text-xs text-amber-600">{cnpjAviso}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input
                    value={editando.telefone}
                    inputMode="numeric"
                    placeholder="(41) 99999-9999"
                    onChange={(e) =>
                      setEditando({ ...editando, telefone: formatarFone(e.target.value) })
                    }
                  />
                  {(() => {
                    const d = (editando.telefone || '').replace(/\D/g, '')
                    if (d.length < 10) return null
                    if (d.length === 10)
                      return <p className="text-xs text-sky-600">☎ Fixo detectado — ok</p>
                    if (d.length === 11)
                      return <p className="text-xs text-teal-700">📱 Celular detectado — ok</p>
                    return (
                      <p className="text-xs text-amber-600">
                        Número estranho — confere antes de salvar
                      </p>
                    )
                  })()}
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
                  <Label>
                    CEP {cepBuscando && <span className="text-xs text-teal-700">buscando…</span>}
                  </Label>
                  <Input
                    value={cep}
                    onChange={(e) => {
                      setCep(e.target.value)
                      const limpo = e.target.value.replace(/\D/g, '')
                      if (limpo.length === 8) buscarCep(limpo)
                    }}
                    onBlur={(e) => buscarCep(e.target.value)}
                    inputMode="numeric"
                    placeholder="8 dígitos — busca a rua sozinho"
                  />
                  {cepErro && <p className="text-xs text-red-600">{cepErro}</p>}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Endereço (rua, número, bairro, cidade - UF, CEP · complemento no fim)</Label>
                <Input
                  value={editando.endereco}
                  onChange={(e) => setEditando({ ...editando, endereco: e.target.value })}
                  placeholder="Rua X, N, Bairro, Cidade - UF, CEP, Complemento"
                />
              </div>{' '}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>E-mail da empresa</Label>
                  <Input
                    value={editando.email}
                    onChange={(e) => setEditando({ ...editando, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Endereço{' '}
                    {cepBuscando && <span className="text-xs text-teal-700">buscando CEP…</span>}
                  </Label>
                  <Input
                    value={editando.endereco}
                    onChange={(e) => setEditando({ ...editando, endereco: e.target.value })}
                    onBlur={(e) => buscarCep(e.target.value)}
                    placeholder="Cole o CEP no fim do endereço — o sistema completa rua/bairro/cidade dos Correios"
                  />
                  {cepErro && <p className="text-xs text-red-600">{cepErro}</p>}
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
                    value={editando.tipo_cliente || 'misto'}
                    onChange={(e) =>
                      setEditando({
                        ...editando,
                        tipo_cliente: e.target.value as Empresa['tipo_cliente'],
                      })
                    }
                  >
                    <option value="impressora">
                      Só impressora (relatório por leitura — fechamento padrão)
                    </option>
                    <option value="misto">
                      Misto — impressora + computador (relatório cita computador e valor)
                    </option>
                    <option value="computador">
                      Só computador/servidor (mensalidade fixa, sem leitura)
                    </option>
                    <option value="avulso">Avulso (serviço único — formatação, backup...)</option>
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
                  <Label>Indicado por (cliente)</Label>
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
                  <Label>Indicado por (outra pessoa)</Label>
                  <Input
                    value={editando.indicado_por_texto || ''}
                    onChange={(e) =>
                      setEditando({ ...editando, indicado_por_texto: e.target.value })
                    }
                    placeholder="Nome de quem indicou"
                  />
                </div>
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

      <DialogEquipamentosEmpresa
        empresaId={dialogEqEmpresa?.id ?? ''}
        empresaNome={dialogEqEmpresa?.nome ?? ''}
        aberto={!!dialogEqEmpresa}
        onFechar={() => setDialogEqEmpresa(null)}
      />
    </div>
  )
}
