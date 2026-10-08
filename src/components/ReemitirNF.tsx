import { useState } from 'react'
import pb from '@/lib/pocketbase/client'

// Botão "Emitir NF" — para reemitir a NFS-e de um fechamento/serviço que ficou
// sem nota (ex.: endereço incompleto no Asaas na 1ª tentativa). Chama o hook
// server-side reemitir_nf, que agenda a NF de novo no Asaas.
export function ReemitirNF({
  colecao,
  id,
  onOk,
}: {
  colecao: 'fechamentos' | 'servicos'
  id?: string
  onOk?: () => void
}) {
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState('')

  const reemitir = async () => {
    if (!id || indo) return
    if (!confirm('Tentar emitir a nota fiscal deste lançamento de novo?')) return
    setIndo(true)
    setErro('')
    try {
      await pb.send(`/backend/v1/reemitir-nf`, {
        method: 'POST',
        body: JSON.stringify({ colecao, id }),
      })
      onOk?.()
    } catch (err) {
      const msg = (err as { response?: { message?: string } })?.response?.message
      setErro(msg || 'Falhou — confira o endereço/CEP da empresa no cadastro.')
    } finally {
      setIndo(false)
    }
  }

  if (!id) return null
  return (
    <span className="inline-flex items-center gap-1">
      <button
        className="text-xs text-indigo-700 underline hover:text-indigo-900 disabled:opacity-50"
        onClick={reemitir}
        disabled={indo}
      >
        {indo ? 'enviando…' : 'Emitir NF'}
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  )
}
