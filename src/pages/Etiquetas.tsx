import { useEffect, useState } from 'react'
import { getEquipamentosPatrimonio, type Equipamento } from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import QRCode from 'qrcode'

// Etiquetas de patrimônio com QR code (pedido 13/10 — 1ª frente do módulo):
// nº de patrimônio + QR que abre o chamado técnico público (/chamado?eq=<id>).
// TAMANHOS = bobinas reais dela (impressora térmica Zebra/Elgin L42 Pro Full):
// 100×40 e 60×40 mm, sem coluna. Impressão: uma etiqueta por página térmica
// (o driver da Elgin/Zebra corta no tamanho da bobina) ou folha A4 p/ teste.
const URL_BASE = typeof window !== 'undefined' ? window.location.origin : ''

const TAMANHOS: Record<
  string,
  { w: string; h: string; qr: string; nome: string; pat: string; desc: string }
> = {
  '100x40': {
    w: '100mm',
    h: '40mm',
    qr: 'h-9 w-9',
    nome: 'text-[8px]',
    pat: 'text-base',
    desc: 'text-[7px]',
  },
  '60x40': {
    w: '60mm',
    h: '40mm',
    qr: 'h-8 w-8',
    nome: 'text-[7px]',
    pat: 'text-sm',
    desc: 'text-[6px]',
  },
}

function Etiqueta({ eq, tamanho }: { eq: Equipamento; tamanho: string }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${URL_BASE}/chamado?eq=${eq.id}`, { margin: 0, width: 240 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [eq.id])
  const t = TAMANHOS[tamanho] ?? TAMANHOS['100x40']

  return (
    <div
      className="border border-slate-800 bg-white flex items-center gap-1 px-1.5 py-1 break-inside-avoid"
      style={{ width: t.w, height: t.h }}
    >
      <div className="flex-1 min-w-0">
        <div className={`font-bold tracking-wider text-slate-800 ${t.nome}`}>LCCA TECH</div>
        <div className={`font-mono font-bold leading-none ${t.pat}`}>{eq.patrimonio || '—'}</div>
        <div className={`text-slate-700 leading-tight truncate ${t.nome}`}>
          {eq.expand?.empresa?.nome}
        </div>
        <div className={`text-slate-500 leading-tight truncate ${t.desc}`}>{eq.setor || ''}</div>
        <div className={`text-slate-500 leading-none ${t.desc}`}>Problema? Escaneie o QR</div>
      </div>
      {qr && <img src={qr} alt={`QR ${eq.patrimonio}`} className={t.qr} />}
    </div>
  )
}

export default function Etiquetas() {
  const [eqs, setEqs] = useState<Equipamento[]>([])
  const [busca, setBusca] = useState('')
  const [tamanho, setTamanho] = useState<'100x40' | '60x40'>('100x40')
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
            {lista.length} etiquetas · QR abre o chamado técnico · bobinas 100×40 e 60×40 mm
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-64"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por empresa ou patrimônio…"
          />
          <Button
            size="sm"
            variant={tamanho === '100x40' ? 'default' : 'outline'}
            className={tamanho === '100x40' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setTamanho('100x40')}
          >
            100 × 40
          </Button>
          <Button
            size="sm"
            variant={tamanho === '60x40' ? 'default' : 'outline'}
            className={tamanho === '60x40' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setTamanho('60x40')}
          >
            60 × 40
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={imprimir}>
            Imprimir
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {lista.map((e) => (
            <Etiqueta key={e.id} eq={e} tamanho={tamanho} />
          ))}
        </div>
      )}
    </div>
  )
}
