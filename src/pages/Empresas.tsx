import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmpresas, updateEmpresa, type Empresa } from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    getEmpresas()
      .then(setEmpresas)
      .finally(() => setCarregando(false))
  }, [])

  const alternarNota = async (e: Empresa, valor: boolean) => {
    setEmpresas((prev) => prev.map((x) => (x.id === e.id ? { ...x, emite_nf: valor } : x)))
    try {
      await updateEmpresa(e.id, { emite_nf: valor })
    } catch {
      setEmpresas((prev) => prev.map((x) => (x.id === e.id ? { ...x, emite_nf: !valor } : x)))
    }
  }

  const salvarEdicao = async () => {
    if (!editando) return
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
        responsavel_nome: editando.responsavel_nome,
        responsavel_email: editando.responsavel_email,
        ativo: editando.ativo,
        emite_nf: editando.emite_nf,
        observacoes: editando.observacoes,
      })
      setEmpresas((prev) => prev.map((x) => (x.id === editando.id ? editando : x)))
      setEditando(null)
    } finally {
      setSalvando(false)
    }
  }

  const ativas = empresas.filter((e) => e.ativo)
  const inativas = empresas.filter((e) => !e.ativo)

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Empresas</h1>
        <p className="text-sm text-muted-foreground">
          {ativas.length} ativas · {inativas.length} históricas · clique em um card para editar
        </p>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...ativas, ...inativas].map((e) => (
            <Card
              key={e.id}
              className={`cursor-pointer transition hover:shadow-md ${e.ativo ? '' : 'opacity-60'}`}
              onClick={() => setEditando({ ...e })}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{e.nome}</CardTitle>
                  {e.ativo ? (
                    <Badge className="bg-teal-600">Ativa</Badge>
                  ) : (
                    <Badge variant="secondary">Histórica</Badge>
                  )}
                </div>
                {e.grupo && (
                  <p className="text-xs text-muted-foreground">
                    {e.grupo}
                    {e.unidade ? ` · ${e.unidade}` : ''}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {e.cnpj_cpf && <p className="text-muted-foreground">{e.cnpj_cpf}</p>}
                {e.responsavel_email && (
                  <p className="text-muted-foreground">✉ {e.responsavel_email}</p>
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
          ))}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <Label>E-mail</Label>
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
                  <Label>Responsável</Label>
                  <Input
                    value={editando.responsavel_nome}
                    onChange={(e) => setEditando({ ...editando, responsavel_nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>E-mail do responsável</Label>
                  <Input
                    value={editando.responsavel_email}
                    onChange={(e) =>
                      setEditando({ ...editando, responsavel_email: e.target.value })
                    }
                  />
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
