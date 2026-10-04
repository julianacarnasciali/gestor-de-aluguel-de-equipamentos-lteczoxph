import { useEffect, useState } from 'react'
import { getEmpresas, updateEmpresa, type Empresa } from '@/services/gestor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

export default function Empresas() {
  const { user, signOut } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    getEmpresas()
      .then(setEmpresas)
      .finally(() => setCarregando(false))
  }, [])

  const alternarNota = async (e: Empresa, valor: boolean) => {
    setEmpresas((prev) => prev.map((x) => (x.id === e.id ? { ...x, emite_nf: valor } : x)))
    try {
      await updateEmpresa(e.id, { emite_nf: valor })
    } catch {
      setEmpresas((prev) => prev.map((x) => (x.id === e.id ? { ...x, emite_nf: !valor } : x)))
    }
  }

  const ativas = empresas.filter((e) => e.ativo)
  const inativas = empresas.filter((e) => !e.ativo)

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            {ativas.length} ativas · {inativas.length} históricas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sair
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...ativas, ...inativas].map((e) => (
            <Card key={e.id} className={e.ativo ? '' : 'opacity-60'}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{e.nome}</CardTitle>
                  {e.ativo ? (
                    <Badge className="bg-teal-600">Ativa</Badge>
                  ) : (
                    <Badge variant="secondary">Histórica</Badge>
                  )}
                </div>
                {e.grupo && (
                  <p className="text-xs text-muted-foreground">
                    {e.grupo}
                    {e.unidade ? ` · ${e.unidade}` : ''}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {e.cnpj_cpf && <p className="text-muted-foreground">{e.cnpj_cpf}</p>}
                {e.responsavel_email && (
                  <p className="text-muted-foreground">✉ {e.responsavel_email}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Emite nota fiscal</span>
                  <Switch checked={e.emite_nf} onCheckedChange={(v) => alternarNota(e, v)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
