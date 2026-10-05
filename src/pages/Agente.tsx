import { useState, useRef, useEffect } from 'react'
import { pbExport as pb } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Msg = { role: 'user' | 'agent'; text: string }

export default function Agente() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'agent',
      text: 'Oi! Sou o assistente do gestor. Posso consultar empresas, contratos e leituras, calcular fechamentos e lançar coisas. Pergunte algo ou peça "feche o mês da empresa X".',
    },
  ])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const enviar = async () => {
    const msg = input.trim()
    if (!msg || enviando) return
    setInput('')
    setMsgs((m) => [...m, { role: 'user', text: msg }])
    setEnviando(true)
    try {
      const res = await pb.send('/backend/v1/agente/chat', {
        method: 'POST',
        body: { message: msg, conversation_id: convId },
      })
      setConvId(res.conversation_id || convId)
      setMsgs((m) => [...m, { role: 'agent', text: res.reply || '(sem resposta)' }])
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { role: 'agent', text: 'Deu erro na comunicação com o agente. Tenta de novo.' },
      ])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Assistente IA</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Consulta dados, calcula e lança fechamentos no sistema.
      </p>
      <Card>
        <CardContent className="py-4">
          <div className="space-y-3 max-h-[60vh] overflow-y-auto mb-4">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 bg-slate-100 text-slate-400 text-sm">
                  pensando...
                </div>
              </div>
            )}
            <div ref={fimRef} />
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviar()}
              placeholder="Ex.: quanto a Maxigráfica deve este mês?"
              disabled={enviando}
            />
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={enviar}
              disabled={enviando || !input.trim()}
            >
              Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
