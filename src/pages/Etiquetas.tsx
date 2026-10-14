import { useEffect, useMemo, useState } from 'react'
import { getEquipamentosPatrimonio, type Equipamento } from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import QRCode from 'qrcode'

// Etiquetas de patrimônio com QR (pedido 13-14/10; revisão 14/10 09h — feedback
// da impressão real na Elgin L42 Pro Full):
// 1) header do sistema NÃO sai mais na impressão (print:hidden no Layout)
// 2) patrimônio sobe p/ 14px bold (10px era ilegível na bobina — pedido dela)
// 3) conteúdo ocupa os 100mm (justify-between — não sobram 30mm vazios)
// 4) PRETO 100% em tudo (térmica não tem cor — teal saía cinza)
// 5) busca por patrimônio normalizada (ignora espaços/maiúsculas) e mostra matches
// 6) escopo empresa: enquanto não escolher, mostra NADA (não todas)
// 14/10 11h45 (pedido dela): QR SEPARADO só para leitura — 3 modos:
//    chamado (como era) · leitura (só contador) · ambos (2 QRs na mesma etiqueta)
const URL_BASE = typeof window !== 'undefined' ? window.location.origin : ''

const normalizar = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '')

type Modo = 'chamado' | 'leitura' | 'ambos'

function useQr(url: string, lado = 320) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 0,
      width: lado,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setQr(''))
  }, [url, lado])
  return qr
}

// QR + legendinha em cima (LEITURA / CHAMADO) — para o modo "ambos"
function QrBloco({ url, legenda, ladoMm }: { url: string; legenda: string; ladoMm: number }) {
  const qr = useQr(url, 300)
  return (
    <div className="flex flex-col items-center" style={{ color: '#000' }}>
      <div className="font-bold" style={{ fontSize: 11, letterSpacing: 0.5, color: '#000' }}>
        {legenda}
      </div>
      {qr && (
        <img
          src={qr}
          alt={`QR ${legenda}`}
          style={{ width: `${ladoMm}mm`, height: `${ladoMm}mm` }}
        />
      )}
    </div>
  )
}

function Etiqueta({ eq, modo }: { eq: Equipamento; modo: Modo }) {
  const qrChamado = useQr(`${URL_BASE}/chamado?eq=${eq.id}`, 320)
  const qrLeitura = useQr(`${URL_BASE}/leitura?eq=${eq.id}`, 320)

  if (modo === 'ambos') {
    // duas colunas de QR à direita, texto à esquerda, patrimônio embaixo dos QRs
    return (
      <div
        className="etiqueta bg-white flex items-center justify-between overflow-hidden"
        style={{ width: '100mm', height: '40mm', padding: '2mm 6mm', color: '#000' }}
      >
        <div className="flex flex-col justify-center" style={{ lineHeight: 1.1, color: '#000' }}>
          <div className="font-bold" style={{ fontSize: 24, color: '#000' }}>
            Problema?
          </div>
          <div style={{ fontSize: 13, color: '#000' }}>
            Escaneie e abra o
            <br />
            chamado técnico
          </div>
          <div className="font-bold" style={{ fontSize: 20, marginTop: 2, color: '#000' }}>
            LCCA Tech
          </div>
        </div>
        <div className="flex flex-col items-center" style={{ color: '#000' }}>
          <div className="flex items-start" style={{ gap: '4mm' }}>
            <QrBloco url={`${URL_BASE}/leitura?eq=${eq.id}`} legenda="LEITURA" ladoMm={21} />
            <QrBloco url={`${URL_BASE}/chamado?eq=${eq.id}`} legenda="CHAMADO" ladoMm={21} />
          </div>
          <div
            className="font-mono font-bold"
            style={{ fontSize: 14, marginTop: 1, color: '#000' }}
          >
            {eq.patrimonio || '—'}
          </div>
        </div>
      </div>
    )
  }

  const url =
    modo === 'leitura' ? `${URL_BASE}/leitura?eq=${eq.id}` : `${URL_BASE}/chamado?eq=${eq.id}`
  const qr = modo === 'leitura' ? qrLeitura : qrChamado

  return (
    <div
      className="etiqueta bg-white flex items-center justify-between overflow-hidden"
      style={{ width: '100mm', height: '40mm', padding: '2mm 7mm', color: '#000' }}
    >
      {/* coluna de texto — mais central (padding 7mm) e fontes MAIORES */}
      <div className="flex flex-col justify-center" style={{ lineHeight: 1.12, color: '#000' }}>
        {modo === 'leitura' ? (
          <>
            <div className="font-bold" style={{ fontSize: 30, color: '#000' }}>
              Leitura do mês?
            </div>
            <div style={{ fontSize: 17, color: '#000' }}>
              Escaneie e registre
              <br />
              o contador
            </div>
            <div className="font-bold" style={{ fontSize: 25, marginTop: 2, color: '#000' }}>
              LCCA Tech
            </div>
          </>
        ) : (
          <>
            <div className="font-bold" style={{ fontSize: 30, color: '#000' }}>
              Problema?
            </div>
            <div style={{ fontSize: 17, color: '#000' }}>
              Escaneie e abra o
              <br />
              chamado técnico
            </div>
            <div className="font-bold" style={{ fontSize: 25, marginTop: 2, color: '#000' }}>
              LCCA Tech
            </div>
          </>
        )}
      </div>
      {/* QR à direita + patrimônio LEGÍVEL embaixo */}
      <div className="flex flex-col items-center justify-center">
        {qr && (
          <img src={qr} alt={`QR ${eq.patrimonio}`} style={{ width: '22mm', height: '22mm' }} />
        )}
        <div className="font-mono font-bold" style={{ fontSize: 15, marginTop: 1, color: '#000' }}>
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
  const [escopo, setEscopo] = useState<Escopo>('uma')
  const [empresaSel, setEmpresaSel] = useState('')
  const [patrimonioBusca, setPatrimonioBusca] = useState('')
  const [modo, setModo] = useState<Modo>('chamado')

  useEffect(() => {
    getEquipamentosPatrimonio()
      .then(setEqs)
      .finally(() => setCarregando(false))
  }, [])

  // @page EXATAMENTE 100×40mm, sem margem — 1 etiqueta por corte na térmica
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'etiqueta-page'
    style.textContent =
      '@media print { @page { size: 100mm 40mm; margin: 0; } body { margin: 0; } .etiqueta { page-break-after: auto; } .etiqueta + .etiqueta { page-break-before: always; } }'
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
    if (escopo === 'empresa') {
      // sem empresa escolhida = NADA (não imprimir todas por engano)
      if (!empresaSel) return []
      return eqs.filter((e) => e.empresa === empresaSel)
    }
    if (escopo === 'uma') {
      const q = normalizar(patrimonioBusca)
      if (!q) return []
      // acha por CONTÉM normalizado (LCCA026 acha "lcca 026" também)
      return eqs.filter((e) => normalizar(e.patrimonio).includes(q))
    }
    return eqs
  }, [eqs, escopo, empresaSel, patrimonioBusca])

  const imprimir = () => window.print()

  const rotuloModo: Record<Modo, string> = {
    chamado: 'QR abre o chamado técnico',
    leitura: 'QR abre a leitura do contador',
    ambos: '2 QRs: leitura + chamado',
  }

  return (
    <div className="container mx-auto py-8 px-4 print:p-0 print:m-0">
      <div className="mb-6 space-y-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas de patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            {lista.length} etiqueta(s) · 100×40 mm · preto 100% · {rotuloModo[modo]}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={escopo === 'uma' ? 'default' : 'outline'}
            className={escopo === 'uma' ? 'bg-black hover:bg-slate-800' : ''}
            onClick={() => setEscopo('uma')}
          >
            Uma etiqueta
          </Button>
          <Button
            size="sm"
            variant={escopo === 'empresa' ? 'default' : 'outline'}
            className={escopo === 'empresa' ? 'bg-black hover:bg-slate-800' : ''}
            onClick={() => setEscopo('empresa')}
          >
            Por empresa
          </Button>
          <Button
            size="sm"
            variant={escopo === 'todas' ? 'default' : 'outline'}
            className={escopo === 'todas' ? 'bg-black hover:bg-slate-800' : ''}
            onClick={() => setEscopo('todas')}
          >
            Todas
          </Button>

          {escopo === 'uma' && (
            <Input
              className="w-64"
              value={patrimonioBusca}
              onChange={(e) => setPatrimonioBusca(e.target.value)}
              placeholder="Número do patrimônio (ex.: LCCA026)"
            />
          )}
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
          <Button
            className="bg-black hover:bg-slate-800"
            onClick={imprimir}
            disabled={lista.length === 0}
          >
            Imprimir {lista.length > 0 ? `(${lista.length})` : ''}
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Modelo:</span>
          <Button
            size="sm"
            variant={modo === 'chamado' ? 'default' : 'outline'}
            className={modo === 'chamado' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setModo('chamado')}
          >
            Chamado
          </Button>
          <Button
            size="sm"
            variant={modo === 'leitura' ? 'default' : 'outline'}
            className={modo === 'leitura' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setModo('leitura')}
          >
            Leitura
          </Button>
          <Button
            size="sm"
            variant={modo === 'ambos' ? 'default' : 'outline'}
            className={modo === 'ambos' ? 'bg-teal-600 hover:bg-teal-700' : ''}
            onClick={() => setModo('ambos')}
          >
            Ambos (2 QRs)
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3 print:gap-0">
          {lista.map((e) => (
            <Etiqueta key={e.id} eq={e} modo={modo} />
          ))}
          {lista.length === 0 && (
            <p className="text-muted-foreground">
              {escopo === 'uma'
                ? 'Digite o número do patrimônio — mostro as etiquetas que combinam.'
                : escopo === 'empresa'
                  ? 'Escolha a empresa no seletor para ver só as etiquetas dela.'
                  : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
