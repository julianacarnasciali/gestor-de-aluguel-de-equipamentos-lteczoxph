import { useEffect, useMemo, useState } from 'react'
import { getEquipamentosPatrimonio, type Equipamento } from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import QRCode from 'qrcode'

// Etiquetas de patrimônio com QR (pedido 13-14/10).
// LAYOUT 100×40 = o print APROVADO dela (14/10): "Problema?" 28px bold,
// "Escaneie e abra o chamado técnico" 16px, "LCCA Tech" 23px, patrimônio 10px
// embaixo do QR — SEM setor/empresa cliente (ela tirou de propósito).
// Saída de impressão: @page exatamente 100mm×40mm (Elgin L42 Pro Full).
const URL_BASE = typeof window !== 'undefined' ? window.location.origin : ''

function Etiqueta({ eq }: { eq: Equipamento }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${URL_BASE}/chamado?eq=${eq.id}`, { margin: 0, width: 320 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [eq.id])

  return (
    <div
      className="etiqueta bg-white flex items-center justify-between overflow-hidden"
      style={{ width: '100mm', height: '40mm', padding: '2mm 3mm' }}
    >
      {/* coluna de texto — fontes do print dela */}
      <div className="flex flex-col justify-center" style={{ lineHeight: 1.15 }}>
        <div className="font-bold text-slate-900" style={{ fontSize: 28 }}>
          Problema?
        </div>
        <div className="text-slate-900" style={{ fontSize: 16 }}>
          Escaneie e abra o
          <br />
          chamado técnico
        </div>
        <div className="font-bold text-slate-900" style={{ fontSize: 23, marginTop: 2 }}>
          LCCA Tech
        </div>
      </div>
      {/* QR + patrimônio embaixo */}
      <div className="flex flex-col items-center justify-center">
        {qr && (
          <img src={qr} alt={`QR ${eq.patrimonio}`} style={{ width: '22mm', height: '22mm' }} />
        )}
        <div className="font-mono text-slate-900" style={{ fontSize: 10, marginTop: 1 }}>
          {eq.patrimonio || '—'}
        </div>
      </div>
    </div>
  )
}

type Escopo = 'todas' | 'empresa' | 'uma'

export default function Etiquetas() {
  const [eqs, setEqs] = useState<Equipamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [escopo, setEscopo] = useState<Escopo>('todas')
  const [empresaSel, setEmpresaSel] = useState('')
  const [patrimonioBusca, setPatrimonioBusca] = useState('')

  useEffect(() => {
    getEquipamentosPatrimonio()
      .then(setEqs)
      .finally(() => setCarregando(false))
  }, [])

  // @page EXATAMENTE do tamanho da etiqueta — sai 1 etiqueta por corte na térmica
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'etiqueta-page'
    style.textContent =
      '@media print { @page { size: 100mm 40mm; margin: 0; } body { margin: 0; } .etiqueta { page-break-after: always; } }'
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  const empresas = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const e of eqs) {
      const nome = e.expand?.empresa?.nome
      if (nome) mapa.set(e.empresa, nome)
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [eqs])

  const lista = useMemo(() => {
    if (escopo === 'empresa' && empresaSel) return eqs.filter((e) => e.empresa === empresaSel)
    if (escopo === 'uma') {
      const q = patrimonioBusca.trim().toLowerCase()
      if (!q) return []
      return eqs.filter((e) => (e.patrimonio || '').toLowerCase().includes(q)).slice(0, 1)
    }
    return eqs
  }, [eqs, escopo, empresaSel, patrimonioBusca])

  const imprimir = () => window.print()

  return (
    <div className="container mx-auto py-8 px-4 print:p-0 print:m-0">
      <div className="mb-6 space-y-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas de patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            {lista.length} etiqueta(s) · 100×40 mm · QR abre o chamado técnico
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={escopo === 'todas' ? 'default' : 'outline'}
            className={escopo === 'todas' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setEscopo('todas')}
          >
            Todas
          </Button>
          <Button
            size="sm"
            variant={escopo === 'empresa' ? 'default' : 'outline'}
            className={escopo === 'empresa' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setEscopo('empresa')}
          >
            Por empresa
          </Button>
          <Button
            size="sm"
            variant={escopo === 'uma' ? 'default' : 'outline'}
            className={escopo === 'uma' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setEscopo('uma')}
          >
            Uma etiqueta
          </Button>

          {escopo === 'empresa' && (
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={empresaSel}
              onChange={(e) => setEmpresaSel(e.target.value)}
            >
              <option value="">Escolha a empresa…</option>
              {empresas.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          )}
          {escopo === 'uma' && (
            <Input
              className="w-56"
              value={patrimonioBusca}
              onChange={(e) => setPatrimonioBusca(e.target.value)}
              placeholder="Número do patrimônio (ex.: LCCA026)"
            />
          )}
          <Button
            className="bg-teal-600 hover:bg-teal-700"
            onClick={imprimir}
            disabled={lista.length === 0}
          >
            Imprimir {lista.length > 0 ? `(${lista.length})` : ''}
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3 print:gap-0">
          {lista.map((e) => (
            <Etiqueta key={e.id} eq={e} />
          ))}
          {lista.length === 0 && (
            <p className="text-muted-foreground">
              {escopo === 'uma'
                ? 'Digite o número do patrimônio para escolher a etiqueta.'
                : escopo === 'empresa'
                  ? 'Escolha a empresa para ver as etiquetas dela.'
                  : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
