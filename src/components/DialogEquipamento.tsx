import { useEffect, useState } from 'react'
import {
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

export interface DialogEquipState {
  empresaId: string
  empresaNome: string
  eq: Equipamento | null // null = nova impressora
}

const vazio = {
  tipo: 'impressora',
  patrimonio: '',
  numero_serie: '',
  marca_modelo: '',
  setor: '',
  ip: '',
  descricao: '',
  contrato: '',
}

export function DialogEquipamento({
  estado,
  onFechar,
  onSalvo,
}: {
  estado: DialogEquipState | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [form, setForm] = useState({ ...vazio })
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [salvando, setSalvando] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  useEffect(() => {
    if (estado) {
      setConfirmarExclusao(false)
      if (estado.eq) {
        const e = estado.eq
        setForm({
          tipo: e.tipo,
          patrimonio: e.patrimonio || '',
          numero_serie: e.numero_serie || '',
          marca_modelo: e.marca_modelo || '',
          setor: e.setor || '',
          ip: e.ip || '',
          descricao: e.descricao || '',
          contrato: e.contrato || '',
        })
      } else {
        setForm({ ...vazio })
      }
      getContratos()
        .then((todos) => setContratos(todos.filter((c) => c.empresa === estado.empresaId)))
        .catch(() => setContratos([]))
    }
  }, [estado])

  if (!estado) return null

  const salvar = async () => {
    setSalvando(true)
    try {
      const payload: Record<string, unknown> = {
        tipo: form.tipo,
        empresa: estado.empresaId,
        patrimonio: form.patrimonio,
        numero_serie: form.numero_serie,
        marca_modelo: form.marca_modelo,
        setor: form.setor,
        ip: form.ip,
        descricao: form.descricao,
        contrato: form.contrato || null,
      }
      if (estado.eq) {
        await updateEquipamento(estado.eq.id, payload)
      } else {
        payload.ativo = true
        await createEquipamento(payload)
      }
      onSalvo()
      onFechar()
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (!estado.eq || !confirmarExclusao) return
    setSalvando(true)
    try {
      // desativa: some de todas as listas/cálculos, mas o histórico de leituras fica
      await updateEquipamento(estado.eq.id, { ativo: false })
      onSalvo()
      onFechar()
    } finally {
      setSalvando(false)
    }
  }

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  return (
    <Dialog open onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {estado.eq ? 'Editar equipamento' : 'Nova impressora'} — {estado.empresaNome}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label>Patrimônio</Label>
            <Input
              value={form.patrimonio}
              onChange={(e) => set('patrimonio', e.target.value)}
              placeholder="LCC00445566"
            />
          </div>
          <div className="space-y-1">
            <Label>Número de série</Label>
            <Input
              value={form.numero_serie}
              onChange={(e) => set('numero_serie', e.target.value)}
              placeholder="00225588"
            />
          </div>
          <div className="space-y-1">
            <Label>Marca / modelo</Label>
            <Input
              value={form.marca_modelo}
              onChange={(e) => set('marca_modelo', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Setor</Label>
              <Input value={form.setor} onChange={(e) => set('setor', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>IP</Label>
              <Input value={form.ip} onChange={(e) => set('ip', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Contrato</Label>
            <select
              className="w-full rounded-md border bg-transparent p-2 text-sm"
              value={form.contrato}
              onChange={(e) => set('contrato', e.target.value)}
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
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} />
          </div>
          <div className="flex justify-between gap-2 pt-2">
            {estado.eq ? (
              confirmarExclusao ? (
                <Button variant="destructive" onClick={excluir} disabled={salvando}>
                  Confirmar exclusão
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmarExclusao(true)}
                >
                  Excluir
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                onClick={salvar}
                disabled={salvando || !form.patrimonio}
              >
                {salvando ? '...' : 'Salvar'}
              </Button>
            </div>
          </div>
          {estado.eq && (
            <p className="text-xs text-muted-foreground">
              Excluir = desativar: a máquina some das listas e dos cálculos, mas o histórico de
              leituras fica guardado.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
