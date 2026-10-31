import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  // FILTRO POR EMPRESA (pedido dela 21/10): vem da URL (?empresa=ID) quando
  // aberto pelo card da empresa, ou pelo seletor aqui na tela
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const empresaFiltro = params.get('empresa') ?? ''
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([])

  // histórico da máquina a partir do nº de patrimônio (pedido dela 31/10):
  // 1 clique na linha → /historico já filtrado por este patrimônio
  const verHistorico = (patrimonio: string) => {
    if (!patrimonio) return
    navigate(`/historico?p=${encodeURIComponent(patrimonio)}`)
  }

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
      .then((todos) => {
        setEqs(todos)
        // nomes das empresas para o seletor de filtro
        const mapa = new Map<string, string>()
        for (const e of todos) {
          if (e.expand?.empresa?.nome) mapa.set(e.empresa, e.expand.empresa.nome)
        }
        setEmpresas(
          [...mapa.entries()]
            .map(([id, nome]) => ({ id, nome }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        )
      })
      .finally(() => setCarregando(false))
  }, [])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return eqs
      .filter((e) => (soAtivos ? e.ativo : true))
      .filter((e) => (empresaFiltro ? e.empresa === empresaFiltro : true))
      .filter((e) => {
        if (!q) return true
        const emp = e.expand?.empresa?.nome ?? ''
        const ctr = e.expand?.contrato?.numero ?? ''
        return [e.patrimonio, e.setor, e.marca_modelo, emp, ctr, TIPO_LABEL[e.tipo] ?? e.tipo]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
  }, [eqs, busca, soAtivos, empresaFiltro])

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
          <h1 className="text-2xl font-bold">
            Patrimônio
            {empresaFiltro && (
              <span className="text-base font-normal text-teal-700">
                {' '}
                — {empresas.find((x) => x.id === empresaFiltro)?.nome ?? 'empresa'}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lista.length} equipamento(s){' '}
            {empresaFiltro ? 'desta empresa' : `ativos de ${resumo.empresas} empresas`} ·{' '}
            {resumo.contratos} contratos · {resumo.inativos} históricos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={empresaFiltro}
            onChange={(e) => {
              const v = e.target.value
              if (v) params.set('empresa', v)
              else params.delete('empresa')
              setParams(params, { replace: true })
            }}
          >
            <option value="">Todas as empresas</option>
            {empresas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
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
                  <TableHead>Histórico</TableHead>
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
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            verHistorico(e.patrimonio)
                          }}
                        >
                          🔧 Histórico
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
