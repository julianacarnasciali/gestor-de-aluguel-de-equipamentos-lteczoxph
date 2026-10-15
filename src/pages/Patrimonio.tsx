import { useEffect, useMemo, useState } from 'react'
import { getEquipamentosPatrimonio, type Equipamento } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DialogEquipamento, type DialogEquipState } from '@/components/DialogEquipamento'
import { Pencil } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const TIPO_LABEL: Record<string, string> = {
  impressora: 'Impressora',
  computador: 'Computador',
  monitor: 'Monitor',
  servidor: 'Servidor',
  camera: 'Câmera',
  central_telefonica: 'Central telefônica',
  sistema_servico: 'Sistema/serviço',
  outros: 'Outros',
}

// Módulo Patrimônio (pedido dela 13/10 — o Luiz quer a correlação completa):
// lista TODOS os equipamentos pelo nº de patrimônio e diz onde está:
// empresa, setor e contrato (nº). Busca por qualquer um desses campos.
export default function Patrimonio() {
  const [eqs, setEqs] = useState<Equipamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [soAtivos, setSoAtivos] = useState(true)
  // edição direto da linha (pedido dela 15/10): clicou na linha → diálogo
  const [dialog, setDialog] = useState<DialogEquipState | null>(null)

  const abrirEdicao = (e: Equipamento) => {
    const emp = e.expand?.empresa
    setDialog({
      empresaId: e.empresa,
      empresaNome: emp?.nome || '—',
      eq: e,
    })
  }

  const recarregar = () => {
    getEquipamentosPatrimonio()
      .then(setEqs)
      .catch(() => {})
  }

  useEffect(() => {
    getEquipamentosPatrimonio()
      .then(setEqs)
      .finally(() => setCarregando(false))
  }, [])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return eqs
      .filter((e) => (soAtivos ? e.ativo : true))
      .filter((e) => {
        if (!q) return true
        const emp = e.expand?.empresa?.nome ?? ''
        const ctr = e.expand?.contrato?.numero ?? ''
        return [e.patrimonio, e.setor, e.marca_modelo, emp, ctr, TIPO_LABEL[e.tipo] ?? e.tipo]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
  }, [eqs, busca, soAtivos])

  const resumo = useMemo(() => {
    const ativos = eqs.filter((e) => e.ativo)
    return {
      total: ativos.length,
      inativos: eqs.length - ativos.length,
      empresas: new Set(ativos.map((e) => e.empresa)).size,
      contratos: new Set(ativos.map((e) => e.contrato).filter(Boolean)).size,
    }
  }, [eqs])

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            {resumo.total} equipamentos ativos · {resumo.empresas} empresas · {resumo.contratos}{' '}
            contratos · {resumo.inativos} históricos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-72"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar patrimônio, setor, empresa, contrato…"
          />
          <Button
            size="sm"
            variant={soAtivos ? 'default' : 'outline'}
            className={soAtivos ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setSoAtivos((v) => !v)}
          >
            {soAtivos ? 'Só ativos' : 'Mostrando todos'}
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patrimônio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Marca/Modelo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((e) => {
                  const emp = e.expand?.empresa
                  const ctr = e.expand?.contrato
                  return (
                    <TableRow
                      key={e.id}
                      className={`cursor-pointer hover:bg-slate-50 ${e.ativo ? '' : 'opacity-50'}`}
                      onClick={() => abrirEdicao(e)}
                    >
                      <TableCell className="font-mono font-semibold text-teal-700">
                        <span className="inline-flex items-center gap-1.5">
                          {e.patrimonio || '—'}
                          <Pencil className="h-3 w-3 text-slate-400" />
                        </span>
                      </TableCell>
                      <TableCell>{TIPO_LABEL[e.tipo] ?? e.tipo}</TableCell>
                      <TableCell>{e.marca_modelo || '—'}</TableCell>
                      <TableCell>{e.setor || '—'}</TableCell>
                      <TableCell>
                        {emp ? (
                          <span className={emp.ativo ? '' : 'text-muted-foreground line-through'}>
                            {emp.nome}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ctr ? (
                          <span className={ctr.ativo ? '' : 'text-muted-foreground'}>
                            nº {ctr.numero}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.ativo ? (
                          <Badge className="bg-teal-600">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nada encontrado{busca ? ` para "${busca}"` : ''}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <DialogEquipamento estado={dialog} onFechar={() => setDialog(null)} onSalvo={recarregar} />
    </div>
  )
}
