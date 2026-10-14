import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Equipamento } from '@/services/gestor'

// Página PÚBLICA: cliente escaneou o QR da etiqueta → /chamado?eq=<id>
// Descreve o defeito + anexa vídeo curto (opcional). Sem login.
export default function ChamadoPublico() {
  const [params] = useSearchParams()
  const eqId = params.get('eq') || ''
  const [eq, setEq] = useState<Equipamento | null>(null)
  const [erro, setErro] = useState('')
  const [contato, setContato] = useState('')
  const [descricao, setDescricao] = useState('')
  const [video, setVideo] = useState<File | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  useEffect(() => {
    if (!eqId) {
      setErro('Etiqueta inválida — escaneie o QR code colado no equipamento.')
      return
    }
    // visitantes não leem a coleção (viewRule logada) — rota pública MÍNIMA
    fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/chamado-info?eq=${eqId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEq({ ...d, id: eqId } as unknown as Equipamento))
      .catch(() => setErro('Equipamento não encontrado — confira a etiqueta.'))
  }, [eqId])

  const enviar = async () => {
    if (!descricao.trim()) {
      setErro('Descreva o problema — é o que o técnico leva de informação.')
      return
    }
    setErro('')
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('equipamento', eqId)
      fd.append('contato', contato)
      fd.append('descricao', descricao)
      if (video) fd.append('video', video)
      if (foto) fd.append('foto', foto)
      const r = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/chamado`, {
        method: 'POST',
        body: fd,
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.message || 'Falhou')
      setFeito(j.prioridade || 'media')
    } catch (err) {
      const msg = (err as Error).message || ''
      setErro(
        msg.includes('52428800')
          ? 'Vídeo muito grande (máx. 50 MB) — envie sem o vídeo ou um mais curto.'
          : 'Não foi possível enviar. Tente de novo ou chame o suporte: (41) 98406-4557.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (feito) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-3">
            <div className="text-5xl">✅</div>
            <h1 className="text-xl font-bold">Chamado aberto!</h1>
            <p className="text-sm text-muted-foreground">
              O técnico LCCA já recebeu o aviso com a máquina, o setor e o problema. Prioridade:{' '}
              <b className={feito === 'urgente' ? 'text-red-600' : 'text-teal-700'}>
                {feito === 'urgente' ? 'URGENTE' : 'normal'}
              </b>
              . Qualquer dúvida: Luiz — (41) 98406-4557.
            </p>
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
              LCCA TECH · CHAMADO TÉCNICO
            </div>
            <h1 className="text-xl font-bold mt-1">Reportar problema no equipamento</h1>
          </div>

          {eq && (
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patrimônio</span>
                <span className="font-mono font-bold text-teal-700">{eq.patrimonio || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empresa</span>
                <span>{eq.expand?.empresa?.nome || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Setor</span>
                <span>{eq.setor || '—'}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Seu nome (opcional)</label>
            <Input
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              placeholder="Quem está reportando"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">O que está acontecendo? *</label>
            <textarea
              className="w-full min-h-28 rounded-md border bg-background p-3 text-sm"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: papel travando ao imprimir, ruído estranho na parte de trás…"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Foto do problema (opcional)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Ex.: foto da página impressa com a cor errada — máx. 10 MB.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Vídeo do problema (opcional — ajuda muito)
            </label>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Máx. 50 MB — um vídeo curto do defeito já basta.
            </p>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            disabled={enviando}
            onClick={enviar}
          >
            {enviando ? 'Enviando…' : 'Abrir chamado'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Só precisa registrar o contador do mês?{' '}
            <a className="text-teal-700 underline" href={`/leitura?eq=${eqId}`}>
              Registrar leitura
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
