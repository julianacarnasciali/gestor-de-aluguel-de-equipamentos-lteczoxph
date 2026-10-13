import { useEffect, useState } from 'react'
import { getEquipamentosPatrimonio, type Equipamento } from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Etiquetas de patrimônio com QR code (pedido 13/10 — 1ª frente do módulo):
// cada etiqueta mostra o nº de patrimônio + QR que abre o chamado técnico
// público (/chamado?eq=<id>). Filtro por empresa e folha A4 p/ imprimir.
// QR gerado no navegador (qrcode lib) — sem serviço externo.
import QRCode from 'qrcode'

const URL_BASE = typeof window !== 'undefined' ? window.location.origin : ''

function Etiqueta({ eq }: { eq: Equipamento }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${URL_BASE}/chamado?eq=${eq.id}`, { margin: 1, width: 240 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [eq.id])

  return (
    <div className="border-2 border-slate-800 rounded-lg p-3 flex items-center gap-3 bg-white break-inside-avoid">
      <div className="flex-1">
        <div className="text-[10px] font-bold tracking-wider text-slate-800">LCCA TECH</div>
        <div className="font-mono text-lg font-bold leading-tight">{eq.patrimonio || '—'}</div>
        <div className="text-[10px] text-slate-600 leading-tight">
          {eq.expand?.empresa?.nome}
          {eq.setor ? ` · ${eq.setor}` : ''}
        </div>
        <div className="text-[9px] text-slate-500 mt-1">Problema? Escaneie e abra o chamado</div>
      </div>
      {qr && <img src={qr} alt={`QR ${eq.patrimonio}`} className="h-20 w-20" />}
    </div>
  )
}

export default function Etiquetas() {
  const [eqs, setEqs] = useState<Equipamento[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    getEquipamentosPatrimonio()
      .then(setEqs)
      .finally(() => setCarregando(false))
  }, [])

  const lista = eqs.filter((e) => {
    const q = busca.trim().toLowerCase()
    if (!q) return true
    return [e.patrimonio, e.setor, e.expand?.empresa?.nome ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q)
  })

  const imprimir = () => window.print()

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas de patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            {lista.length} etiquetas · QR abre o chamado técnico · imprimir em A4
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-64"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por empresa ou patrimônio…"
          />
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={imprimir}>
            Imprimir
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map((e) => (
            <Etiqueta key={e.id} eq={e} />
          ))}
        </div>
      )}
    </div>
  )
}
