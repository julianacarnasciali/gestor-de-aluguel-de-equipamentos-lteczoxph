import { useEffect, useState } from 'react'
import {
  getEquipamentosAllTipos,
  getContratos,
  createEquipamento,
  updateEquipamento,
  type Equipamento,
  type Contrato,
} from '@/services/gestor'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const TIPOS: Record<string, string> = {
  impressora: 'Impressora',
  computador: 'Computador',
  monitor: 'Monitor',
  servidor: 'Servidor',
  camera: 'Câmera',
  central_telefonica: 'Central telefônica',
  sistema_servico: 'Sistema/serviço',
  outros: 'Outros',
}

interface Edit {
  id?: string
  tipo: string
  patrimonio: string
  numero_serie: string
  marca_modelo: string
  setor: string
  ip: string
  descricao: string
  contrato: string
}

const vazio = (contrato: string): Edit => ({
  tipo: 'impressora',
  patrimonio: '',
  numero_serie: '',
  marca_modelo: '',
  setor: '',
  ip: '',
  descricao: '',
  contrato,
})

export function DialogEquipamentosEmpresa({
  empresaId,
  empresaNome,
  aberto,
  onFechar,
}: {
  empresaId: string
  empresaNome: string
  aberto: boolean
  onFechar: () => void
}) {
  const [lista, setLista] = useState<Equipamento[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [edit, setEdit] = useState<Edit | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarId, setConfirmarId] = useState<string | null>(null)

  const carregar = () => {
    getEquipamentosAllTipos(empresaId)
      .then(setLista)
      .catch(() => setLista([]))
    getContratos()
      .then((todos) => setContratos(todos.filter((c) => c.empresa === empresaId)))
      .catch(() => setContratos([]))
  }

  useEffect(() => {
    if (aberto && empresaId) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, empresaId])

  const salvar = async () => {
    if (!edit) return
    setSalvando(true)
    try {
      const payload: Record<string, unknown> = {
        tipo: edit.tipo,
        empresa: empresaId,
        patrimonio: edit.patrimonio,
        numero_serie: edit.numero_serie,
        marca_modelo: edit.marca_modelo,
        setor: edit.setor,
        ip: edit.ip,
        descricao: edit.descricao,
        contrato: edit.contrato || null,
      }
      if (edit.id) await updateEquipamento(edit.id, payload)
      else {
        payload.ativo = true
        await createEquipamento(payload)
      }
      setEdit(null)
      carregar()
    } finally {
      setSalvando(false)
    }
  }

  const desativar = async (id: string) => {
    await updateEquipamento(id, { ativo: false })
    setConfirmarId(null)
    carregar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-8">
            <span>Equipamentos — {empresaNome}</span>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => setEdit(vazio(contratos[0]?.id ?? ''))}
            >
              <Plus className="h-4 w-4 mr-1" /> Incluir
            </Button>
          </DialogTitle>
        </DialogHeader>

        {edit ? (
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={edit.tipo}
                  onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}
                >
                  {Object.entries(TIPOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Contrato</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={edit.contrato}
                  onChange={(e) => setEdit({ ...edit, contrato: e.target.value })}
                >
                  <option value="">— sem contrato —</option>
                  {contratos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero || c.id}
                      {c.ativo ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Patrimônio</Label>
                <Input
                  value={edit.patrimonio}
                  onChange={(e) => setEdit({ ...edit, patrimonio: e.target.value })}
                  placeholder="LCC00445566"
                />
              </div>
              <div className="space-y-1">
                <Label>Número de série</Label>
                <Input
                  value={edit.numero_serie}
                  onChange={(e) => setEdit({ ...edit, numero_serie: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Marca / modelo</Label>
                <Input
                  value={edit.marca_modelo}
                  onChange={(e) => setEdit({ ...edit, marca_modelo: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Setor</Label>
                <Input
                  value={edit.setor}
                  onChange={(e) => setEdit({ ...edit, setor: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>IP</Label>
                <Input value={edit.ip} onChange={(e) => setEdit({ ...edit, ip: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Input
                  value={edit.descricao}
                  onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEdit(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                onClick={salvar}
                disabled={salvando || !edit.patrimonio}
              >
                {salvando ? '...' : 'Salvar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {lista.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                Nenhum equipamento cadastrado para esta empresa.
              </p>
            )}
            {lista.map((eq) => (
              <div key={eq.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {TIPOS[eq.tipo] ?? eq.tipo}
                    </Badge>
                    {eq.patrimonio || eq.descricao || eq.id}
                    {eq.setor ? (
                      <span className="text-xs text-muted-foreground">· {eq.setor}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {eq.numero_serie ? `série ${eq.numero_serie}` : 'sem série'}
                    {eq.marca_modelo ? ` · ${eq.marca_modelo}` : ''}
                    {eq.ip ? ` · IP ${eq.ip}` : ''}
                  </p>
                </div>
                <button
                  className="text-slate-400 hover:text-teal-700"
                  title="Editar"
                  onClick={() =>
                    setEdit({
                      id: eq.id,
                      tipo: eq.tipo,
                      patrimonio: eq.patrimonio || '',
                      numero_serie: eq.numero_serie || '',
                      marca_modelo: eq.marca_modelo || '',
                      setor: eq.setor || '',
                      ip: eq.ip || '',
                      descricao: eq.descricao || '',
                      contrato: eq.contrato || '',
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmarId === eq.id ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" onClick={() => desativar(eq.id)}>
                      Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmarId(null)}>
                      ✕
                    </Button>
                  </div>
                ) : (
                  <button
                    className="text-slate-400 hover:text-red-600"
                    title="Excluir (desativa, histórico preservado)"
                    onClick={() => setConfirmarId(eq.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
