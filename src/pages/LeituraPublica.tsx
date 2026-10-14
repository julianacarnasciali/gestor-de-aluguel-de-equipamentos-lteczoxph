import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Página PÚBLICA de leitura (2ª frente, pedido 14/10): escaneou o QR da
// etiqueta → /leitura?eq=<id> → digita o contador do visor → grava.
// Mobile-first (o celular do funcionário na frente da máquina).
// Do mesmo QR derivam chamado (/chamado?eq=) e leitura (/leitura?eq=).
interface InfoEq {
  patrimonio: string
  setor: string
  empresa: string
}

export default function LeituraPublica() {
  const [params] = useSearchParams()
  const eqId = params.get('eq') || ''
  const [info, setInfo] = useState<InfoEq | null>(null)
  const [erro, setErro] = useState('')
  const [atual, setAtual] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{
    competencia: string
    leitura_anterior: number
    leitura_atual: number
    paginas_mes: number
  } | null>(null)

  useEffect(() => {
    if (!eqId) {
      setErro('Etiqueta inválida — escaneie o QR code colado no equipamento.')
      return
    }
    fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/chamado-info?eq=${eqId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setErro('Equipamento não encontrado — confira a etiqueta.'))
  }, [eqId])

  const enviar = async () => {
    const n = Number(atual.replace(/\D/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      setErro('Digite o número do contador do visor (só números).')
      return
    }
    setErro('')
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('equipamento', eqId)
      fd.append('leitura_atual', String(n))
      if (foto) fd.append('arquivo', foto)
      const r = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/leitura`, {
        method: 'POST',
        body: fd,
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.message || 'Falhou')
      setResultado(j)
    } catch (err) {
      const msg = (err as Error).message || ''
      setErro(
        msg ||
          'Não foi possível registrar. Confira o número e tente de novo — ou chame o Luiz: (41) 98406-4557.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (resultado) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-3">
            <div className="text-5xl">✅</div>
            <h1 className="text-xl font-bold">Leitura registrada!</h1>
            <div className="rounded-md bg-slate-50 border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mês</span>
                <b>{resultado.competencia}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contador anterior</span>
                <span>{resultado.leitura_anterior.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contador agora</span>
                <b>{resultado.leitura_atual.toLocaleString('pt-BR')}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Páginas do mês</span>
                <b className="text-teal-700">{resultado.paginas_mes.toLocaleString('pt-BR')}</b>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Já está no sistema — o fechamento usa essa leitura. Obrigado!
            </p>
            <Link to={`/leitura?eq=${eqId}`} onClick={() => window.location.reload()}>
              <Button variant="outline" className="w-full">
                Registrar outra
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-start sm:items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6 space-y-4">
          <div>
            <div className="text-xs font-semibold tracking-wider text-teal-700">
              LCCA TECH · REGISTRO DE LEITURA
            </div>
            <h1 className="text-xl font-bold mt-1">Contador do equipamento</h1>
          </div>

          {info && (
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patrimônio</span>
                <span className="font-mono font-bold text-teal-700">{info.patrimonio || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empresa</span>
                <span>{info.empresa || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Setor</span>
                <span>{info.setor || '—'}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Número no visor do contador *</label>
            <Input
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              inputMode="numeric"
              placeholder="Ex.: 0012540"
              className="text-lg font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Digite exatamente o número que aparece no visor da máquina.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Foto do visor (opcional — confirmação)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            disabled={enviando}
            onClick={enviar}
          >
            {enviando ? 'Registrando…' : 'Registrar leitura'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Máquina com defeito?{' '}
            <a className="text-teal-700 underline" href={`/chamado?eq=${eqId}`}>
              Abrir chamado técnico
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
