import { useEffect, useState } from 'react'
import { getEquipamentosPatrimonio, type Equipamento } from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import QRCode from 'qrcode'

// Etiquetas de patrimônio com QR (pedido 13/10; layout refeito 14/10 — ela
// pediu 60×40 distribuído + frase de chamada MAIOR e em NEGRITO).
// Bobinas reais: 100×40 e 60×40 mm (Elgin L42 Pro Full). O tamanho da página
// de impressão (@page) acompanha a bobina escolhida — sai 1 etiqueta por corte.
const URL_BASE = typeof window !== 'undefined' ? window.location.origin : ''

const TAMANHOS: Record<
  string,
  {
    w: number
    h: number
    qrMm: number
    pat: number
    emp: number
    setor: number
    frase: number
    marca: number
  }
> = {
  // tamanhos de fonte em px (Chrome não respeita <9px — mínimo prático)
  '100x40': { w: 100, h: 40, qrMm: 22, pat: 18, emp: 9, setor: 8, frase: 11, marca: 8 },
  '60x40': { w: 60, h: 40, qrMm: 20, pat: 14, emp: 9, setor: 8, frase: 9.5, marca: 7 },
}

function Etiqueta({ eq, tamanho }: { eq: Equipamento; tamanho: string }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${URL_BASE}/chamado?eq=${eq.id}`, { margin: 0, width: 320 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [eq.id])
  const t = TAMANHOS[tamanho] ?? TAMANHOS['60x40']

  return (
    <div
      className="etiqueta bg-white border-2 border-slate-900 flex flex-col overflow-hidden"
      style={{ width: `${t.w}mm`, height: `${t.h}mm` }}
    >
      <div className="flex-1 flex items-stretch gap-1 px-1.5 pt-1 pb-0.5 min-h-0">
        {/* coluna de texto */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="font-bold text-slate-900 leading-none" style={{ fontSize: t.marca }}>
            LCCA TECH
          </div>
          <div
            className="font-mono font-bold text-slate-900 leading-none"
            style={{ fontSize: t.pat }}
          >
            {eq.patrimonio || '—'}
          </div>
          <div className="text-slate-800 leading-tight" style={{ fontSize: t.emp }}>
            {eq.expand?.empresa?.nome || ''}
          </div>
          {eq.setor && (
            <div className="text-slate-600 leading-tight truncate" style={{ fontSize: t.setor }}>
              {eq.setor}
            </div>
          )}
        </div>
        {/* QR — tamanho fixo em mm p/ escanear de perto */}
        {qr && (
          <img
            src={qr}
            alt={`QR ${eq.patrimonio}`}
            style={{ width: `${t.qrMm}mm`, height: `${t.qrMm}mm` }}
            className="self-center"
          />
        )}
      </div>
      {/* faixa de chamada — o pedido dela: frase GRANDE e em NEGRITO */}
      <div className="bg-teal-600 text-white font-bold text-center uppercase leading-none py-1">
        <span style={{ fontSize: t.frase }}>Problema? Escaneie o QR</span>
      </div>
    </div>
  )
}

export default function Etiquetas() {
  const [eqs, setEqs] = useState<Equipamento[]>([])
  const [busca, setBusca] = useState('')
  const [tamanho, setTamanho] = useState<'100x40' | '60x40'>('60x40')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    getEquipamentosPatrimonio()
      .then(setEqs)
      .finally(() => setCarregando(false))
  }, [])

  // @page do tamanho da bobina — a impressão térmica sai fiel (1 etiqueta/corte)
  useEffect(() => {
    const t = TAMANHOS[tamanho]
    const style = document.createElement('style')
    style.id = 'etiqueta-page'
    style.textContent = `@media print { @page { size: ${t.w}mm ${t.h}mm; margin: 0; } body { margin: 0; } }`
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [tamanho])

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
    <div className="container mx-auto py-8 px-4 print:p-0 print:m-0">
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
            variant={tamanho === '60x40' ? 'default' : 'outline'}
            className={tamanho === '60x40' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setTamanho('60x40')}
          >
            60 × 40
          </Button>
          <Button
            size="sm"
            variant={tamanho === '100x40' ? 'default' : 'outline'}
            className={tamanho === '100x40' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setTamanho('100x40')}
          >
            100 × 40
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={imprimir}>
            Imprimir
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-wrap gap-3 print:gap-0">
          {lista.map((e) => (
            <Etiqueta key={e.id} eq={e} tamanho={tamanho} />
          ))}
        </div>
      )}
    </div>
  )
}
