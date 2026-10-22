import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { pbExport, type OrdemServico } from '@/services/gestor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// PÁGINA PÚBLICA DE ASSINATURA DA OS (pedido dela 22/10: assinatura digital no
// celular do cliente). Sem login: a OS é buscada pelo id na URL (?id=...), o
// cliente confere o resumo, desenha a assinatura com o dedo e confirma.
// A imagem da assinatura (dataURL PNG) grava no campo assinatura_imagem.

const NAVY = '#0F2A43'

export default function OsAssinar() {
  const [params] = useSearchParams()
  const id = params.get('id') || ''
  const [os, setOs] = useState<OrdemServico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const temTraco = useRef(false)

  useEffect(() => {
    if (!id) {
      setErro('Link inválido — sem identificação da OS.')
      setCarregando(false)
      return
    }
    pbExport
      .collection('ordens_servico')
      .getOne<OrdemServico>(id)
      .then((r) => {
        if ((r as unknown as { status: string }).status === 'cancelada') {
          setErro('Esta OS foi cancelada.')
          return
        }
        setOs(r)
      })
      .catch(() => setErro('OS não encontrada — confira o link.'))
      .finally(() => setCarregando(false))
  }, [id])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !os) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    // fundo branco (o PNG sai com fundo sólido p/ colar no PDF)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.strokeStyle = NAVY
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const pos = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      return {
        x: (e.clientX - r.left) * (cv.width / r.width),
        y: (e.clientY - r.top) * (cv.height / r.height),
      }
    }
    const down = (e: PointerEvent) => {
      desenhando.current = true
      temTraco.current = true
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }
    const move = (e: PointerEvent) => {
      if (!desenhando.current) return
      const p = pos(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    const up = () => {
      desenhando.current = false
    }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [os])

  const limpar = () => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    temTraco.current = false
  }

  const confirmar = async () => {
    if (!os || !nome.trim()) return
    if (!temTraco.current) {
      alert('Desenhe a assinatura antes de confirmar.')
      return
    }
    setSalvando(true)
    try {
      const dataUrl = canvasRef.current?.toDataURL('image/png') || ''
      await pbExport.collection('ordens_servico').update(os.id, {
        status: 'assinada',
        assinatura_nome: nome.trim(),
        assinatura_cargo: cargo.trim(),
        assinatura_imagem: dataUrl,
        assinado_em: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
      })
      setOk(true)
    } catch {
      alert('Não foi possível salvar a assinatura — tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const fmt = (s: string) =>
    String(s || '')
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('/')

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded bg-[#0F2A43] flex items-center justify-center text-white font-bold">
            L
          </div>
          <span className="font-bold text-[#0F2A43]">LCCA Tech — Ordem de Serviço</span>
        </div>

        {carregando ? (
          <p className="text-slate-500 text-sm">Carregando…</p>
        ) : erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {erro}
          </div>
        ) : ok ? (
          <div className="rounded-lg border border-lime-200 bg-lime-50 p-5 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-bold text-lime-800">Assinatura registrada!</p>
            <p className="text-sm text-lime-700 mt-1">
              Obrigado, {nome.split(' ')[0]}. A LCCA recebeu a confirmação da OS.
            </p>
          </div>
        ) : os ? (
          <>
            <div className="rounded-lg border bg-slate-50 p-4 mb-4 text-sm">
              <p className="font-bold text-slate-800">
                {os.numero || 'OS'} · {fmt(os.data)}
              </p>
              <p className="text-slate-600 mt-1 whitespace-pre-wrap">{os.descricao}</p>
              {os.valor_total > 0 && (
                <p className="mt-2 font-bold text-slate-800">
                  Valor:{' '}
                  {os.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Seu nome completo *</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="quem assina"
                />
              </div>
              <div className="space-y-1">
                <Label>Cargo/função</Label>
                <Input
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div className="space-y-1">
                <Label>Assine com o dedo (ou mouse) *</Label>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={180}
                  className="w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
                />
                <button className="text-xs text-slate-500 underline" onClick={limpar}>
                  limpar assinatura
                </button>
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700"
                disabled={salvando || !nome.trim()}
                onClick={confirmar}
              >
                {salvando ? 'Enviando…' : 'Confirmar assinatura'}
              </Button>
              <p className="text-[11px] text-slate-400 text-center">
                Ao assinar, você confirma que o serviço descrito foi executado. Este registro fica
                guardado no sistema da LCCA Tech.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
