import { useEffect, useState } from 'react'
import { getEmpresas, createEmpresa, createServico, brl, type Empresa } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { gerarPdfServico } from '@/lib/pdf-servico'

export default function ServicoAvulso() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<Empresa | null>(null)
  const [novoCliente, setNovoCliente] = useState(false)

  // cadastro de cliente novo
  const [nome, setNome] = useState('')
  const [cnpjCpf, setCnpjCpf] = useState('')
  const [email, setEmail] = useState('')
  const [endereco, setEndereco] = useState('')
  const [emiteNf, setEmiteNf] = useState(false)

  // serviço
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataServico, setDataServico] = useState(new Date().toISOString().slice(0, 10))
  const [dataVenc, setDataVenc] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [criado, setCriado] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    getEmpresas()
      .then(setEmpresas)
      .catch(() => setEmpresas([]))
  }, [])

  const empresasFiltradas = empresas
    .filter((e) => e.ativo)
    .filter((e) => !busca || e.nome.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 8)

  const criarClienteEServico = async () => {
    setErro('')
    if (!nome || !cnpjCpf || !email || !valor || !descricao || !dataVenc) {
      setErro('Preencha: nome, CPF/CNPJ, e-mail, descrição do serviço, valor e vencimento.')
      return
    }
    setSalvando(true)
    try {
      const nova = await createEmpresa({
        nome,
        cnpj_cpf: cnpjCpf,
        email,
        endereco,
        emite_nf: emiteNf,
        ativo: true,
        tipo_cliente: 'avulso',
      })
      setSelecionada(nova)
      setNovoCliente(false)
      await criarServico(nova.id)
    } catch {
      setErro('Não foi possível cadastrar o cliente. Confira os dados e tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  const criarServico = async (empresaId: string) => {
    setErro('')
    if (!valor || !descricao || !dataVenc) {
      setErro('Preencha: descrição do serviço, valor e vencimento.')
      return
    }
    setSalvando(true)
    try {
      const s = await createServico({
        empresa: empresaId,
        descricao,
        valor: Number(valor),
        data_servico: dataServico,
        data_vencimento: dataVenc,
        emite_nf: selecionada ? selecionada.emite_nf : emiteNf,
        status: 'emitido',
      })
      setCriado(s as unknown as Record<string, unknown>)
    } catch {
      setErro('Não foi possível criar o serviço. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Serviço avulso</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cadastrado na rua — o sistema gera boleto, Pix, NF e envia ao cliente.
      </p>

      {criado ? (
        <Card>
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center gap-2">
              <Badge className="bg-teal-600">Serviço criado</Badge>
              <span className="font-semibold">{brl(Number(criado.valor))}</span>
            </div>
            <p className="text-sm">{criado.descricao}</p>
            <div className="grid gap-2 text-sm">
              {criado.asaas_boleto_url ? (
                <a
                  className="text-teal-700 underline"
                  href={String(criado.asaas_boleto_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  📄 Boleto (PDF)
                </a>
              ) : null}
              {criado.asaas_pix_payload ? (
                <div className="rounded-md border p-3 break-all text-xs bg-slate-50">
                  <p className="font-medium mb-1">Pix copia e cola:</p>
                  {String(criado.asaas_pix_payload)}
                </div>
              ) : null}
              {criado.asaas_invoice_url ? (
                <a
                  className="text-indigo-700 underline"
                  href={String(criado.asaas_invoice_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  🧾 Nota fiscal (PDF)
                </a>
              ) : null}
              <Button
                variant="outline"
                onClick={() =>
                  gerarPdfServico(criado, selecionada, {
                    razao_social: 'LCCA Tecnologia',
                  })
                }
              >
                Ver relatório do serviço (OS)
              </Button>
            </div>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => {
                setCriado(null)
                setSelecionada(null)
                setNovoCliente(false)
                setDescricao('')
                setValor('')
                setDataVenc('')
              }}
            >
              Novo serviço
            </Button>
          </CardContent>
        </Card>
      ) : selecionada && !novoCliente ? (
        <>
          <Card className="mb-4">
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{selecionada.nome}</p>
                <p className="text-xs text-muted-foreground">{selecionada.cnpj_cpf}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelecionada(null)}>
                Trocar
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="space-y-1">
                <Label>Descrição do serviço</Label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: formatação + backup + configuração de e-mails"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="450,00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Data do serviço</Label>
                  <Input
                    type="date"
                    value={dataServico}
                    onChange={(e) => setDataServico(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Vencimento da cobrança</Label>
                <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} />
              </div>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700"
                onClick={() => criarServico(selecionada.id)}
                disabled={salvando}
              >
                {salvando ? 'Gerando...' : 'Gerar cobrança + documentos'}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : novoCliente ? (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome / Razão social</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>CPF/CNPJ</Label>
                <Input value={cnpjCpf} onChange={(e) => setCnpjCpf(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Endereço (Rua, nº, Cidade - UF, CEP)</Label>
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm font-medium">Emite nota fiscal</span>
              <input
                type="checkbox"
                checked={emiteNf}
                onChange={(e) => setEmiteNf(e.target.checked)}
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição do serviço</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: formatação + backup"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} />
              </div>
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setNovoCliente(false)}>
                Voltar
              </Button>
              <Button
                className="flex-1 bg-teal-600 hover:bg-teal-700"
                onClick={criarClienteEServico}
                disabled={salvando}
              >
                {salvando ? 'Salvando...' : 'Cadastrar + gerar cobrança'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 space-y-3">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente existente..."
            />
            <div className="divide-y">
              {empresasFiltradas.map((e) => (
                <button
                  key={e.id}
                  className="w-full text-left py-2 flex items-center justify-between"
                  onClick={() => setSelecionada(e)}
                >
                  <div>
                    <p className="text-sm font-medium">{e.nome}</p>
                    <p className="text-xs text-muted-foreground">{e.cnpj_cpf}</p>
                  </div>
                  <span className="text-xs text-teal-700">selecionar →</span>
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full border-teal-600 text-teal-700 hover:bg-teal-50"
              onClick={() => setNovoCliente(true)}
            >
              + Cliente novo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
