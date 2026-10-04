import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'

export default function Conta() {
  const { user, signOut } = useAuth()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setErro('')
    if (nova !== confirma) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }
    if (nova.length < 8) {
      setErro('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setSalvando(true)
    try {
      await pb.collection('users').update(user!.id, {
        oldPassword: atual,
        password: nova,
        passwordConfirm: nova,
      })
      setMsg('Senha alterada com sucesso!')
      setAtual('')
      setNova('')
      setConfirma('')
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, { message?: string }> } }).response
        ?.data
      const detalhe = data?.oldPassword?.message
        ? 'A senha atual está incorreta.'
        : data?.password?.message
          ? `Nova senha inválida: ${data.password.message}`
          : 'Não foi possível trocar a senha. Tente novamente.'
      setErro(detalhe)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Minha conta</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{user?.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={trocarSenha} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="atual">Senha atual</Label>
              <Input
                id="atual"
                type="password"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nova">Nova senha</Label>
              <Input
                id="nova"
                type="password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirma">Confirmar nova senha</Label>
              <Input
                id="confirma"
                type="password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                required
              />
            </div>
            {msg && <p className="text-sm text-teal-700 font-medium">{msg}</p>}
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Trocar senha'}
              </Button>
              <Button type="button" variant="outline" onClick={signOut}>
                Sair
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
