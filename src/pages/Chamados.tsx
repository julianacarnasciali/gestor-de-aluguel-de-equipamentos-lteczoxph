import { useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Chamado {
  id: string
  equipamento: string
  empresa: string
  patrimonio: string
  setor: string
  contato: string
  descricao: string
  video: string
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  status: 'aberto' | 'em_atendimento' | 'resolvido'
  resolucao: string
  created: string
  expand?: {
    equipamento?: { marca_modelo?: string }
    empresa?: { nome?: string }
  }
}

const PRIO_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'URGENTE',
}
const PRIO_CLS: Record<string, string> = {
  baixa: 'bg-slate-400',
  media: 'bg-teal-600',
  alta: 'bg-amber-500',
  urgente: 'bg-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
}

// Painel de chamados abertos via QR (pedido 13/10): prioridade por setor,
// vídeo do defeito e fluxo aberto → em atendimento → resolvido.
export default function Chamados() {
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<'abertos' | 'resolvidos' | 'todos'>('abertos')
  const [detalhe, setDetalhe] = useState<Chamado | null>(null)

  const carregar = () =>
    pb
      .collection('chamados')
      .getFullList<Chamado>({ sort: '-created', expand: 'equipamento,empresa' })
      .then(setChamados)
      .finally(() => setCarregando(false))

  useEffect(() => {
    carregar()
  }, [])

  const lista = useMemo(() => {
    return chamados
      .filter((c) =>
        filtro === 'todos'
          ? true
          : filtro === 'abertos'
            ? c.status !== 'resolvido'
            : c.status === 'resolvido',
      )
      .sort((a, b) => {
        const ordem: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 }
        if (ordem[a.prioridade] !== ordem[b.prioridade])
          return ordem[a.prioridade] - ordem[b.prioridade]
        return b.created.localeCompare(a.created)
      })
  }, [chamados, filtro])

  const avancar = async (c: Chamado) => {
    const proximo = c.status === 'aberto' ? 'em_atendimento' : 'resolvido'
    await pb.collection('chamados').update<Chamado>(c.id, { status: proximo })
    setDetalhe(null)
    carregar()
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chamados técnicos</h1>
          <p className="text-sm text-muted-foreground">
            Abertos via QR code do patrimônio · ordenados por prioridade
          </p>
        </div>
        <div className="flex gap-2">
          {(['abertos', 'resolvidos', 'todos'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? 'default' : 'outline'}
              className={filtro === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
              onClick={() => setFiltro(f)}
            >
              {f === 'abertos' ? 'Abertos' : f === 'resolvidos' ? 'Resolvidos' : 'Todos'}
            </Button>
          ))}
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
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Patrimônio</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead>Vídeo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetalhe(c)}>
                    <TableCell>
                      <Badge className={PRIO_CLS[c.prioridade]}>{PRIO_LABEL[c.prioridade]}</Badge>
                    </TableCell>
                    <TableCell>{c.expand?.empresa?.nome || '—'}</TableCell>
                    <TableCell className="font-mono text-teal-700">{c.patrimonio || '—'}</TableCell>
                    <TableCell>{c.setor || '—'}</TableCell>
                    <TableCell className="max-w-64 truncate">{c.descricao}</TableCell>
                    <TableCell>{c.video ? '🎥' : '—'}</TableCell>
                    <TableCell>{STATUS_LABEL[c.status]}</TableCell>
                  </TableRow>
                ))}
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum chamado aqui — paz na fila. 🙂
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-lg">
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle>
                  <Badge className={PRIO_CLS[detalhe.prioridade]}>
                    {PRIO_LABEL[detalhe.prioridade]}
                  </Badge>{' '}
                  {detalhe.expand?.empresa?.nome} · {detalhe.patrimonio}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Setor:</span> {detalhe.setor || '—'} ·{' '}
                  <span className="text-muted-foreground">Equipamento:</span>{' '}
                  {detalhe.expand?.equipamento?.marca_modelo || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Contato:</span> {detalhe.contato || '—'} ·{' '}
                  <span className="text-muted-foreground">
                    {new Date(detalhe.created).toLocaleString('pt-BR')}
                  </span>
                </p>
                <div className="rounded-md bg-slate-50 border p-3">
                  <div className="text-xs text-muted-foreground mb-1">Defeito relatado:</div>
                  {detalhe.descricao}
                </div>
                {detalhe.video && (
                  <video
                    controls
                    className="w-full rounded-md border"
                    src={`${pb.baseUrl}/api/files/chamados/${detalhe.id}/${detalhe.video}`}
                  />
                )}
                <div className="flex gap-2 pt-2">
                  {detalhe.status !== 'resolvido' && (
                    <Button
                      className="bg-teal-600 hover:bg-teal-700"
                      onClick={() => avancar(detalhe)}
                    >
                      {detalhe.status === 'aberto' ? 'Iniciar atendimento' : 'Marcar resolvido'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDetalhe(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
