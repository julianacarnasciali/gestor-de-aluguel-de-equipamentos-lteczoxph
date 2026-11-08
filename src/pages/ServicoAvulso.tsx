import { useEffect, useRef, useState } from 'react'
import { getEmpresas, createEmpresa, createServico, brl, type Empresa } from '@/services/gestor'
import pb from '@/lib/pocketbase/client'
import { ReemitirNF } from '@/components/ReemitirNF'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { gerarPdfServico } from '@/lib/pdf-servico'
import { consultarCnpj } from '@/lib/cnpj'

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
  // busca CNPJ na Receita (preenche nome/endereço/CEP sozinho)
  const [cnpjBuscando, setCnpjBuscando] = useState(false)
  const [cnpjAviso, setCnpjAviso] = useState('')
  const ultimoCnpjBuscado = useRef('')

  // serviço
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataServico, setDataServico] = useState(new Date().toISOString().slice(0, 10))
  const [dataVenc, setDataVenc] = useState('')
  // NF é escolha POR SERVIÇO (não automática) — pedido 08/10
  const [emitirNfServico, setEmitirNfServico] = useState(false)
  // quando a empresa escolhida emite NF por padrão, o switch já vem LIGADO
  // (o Luiz pode desligar na hora — a escolha dele prevalece por serviço)
  useEffect(() => {
    setEmitirNfServico(Boolean(selecionada?.emite_nf))
  }, [selecionada])

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [criado, setCriado] = useState<Record<string, unknown> | null>(null)
  // busca de CEP (ViaCEP — base oficial dos Correios) — CEP PRIMEIRO
  const [cepBuscando, setCepBuscando] = useState(false)
  const [cepErro, setCepErro] = useState('')
  const [cep, setCep] = useState('')
  const [numeroComplemento, setNumeroComplemento] = useState('')

  const buscarCnpj = async (valor: string) => {
    const limpo = (valor || '').replace(/\D/g, '')
    if (limpo.length !== 14) return
    if (ultimoCnpjBuscado.current === limpo) return
    ultimoCnpjBuscado.current = limpo
    setCnpjBuscando(true)
    setCnpjAviso('')
    try {
      const r = await consultarCnpj(limpo)
      if (!r.ok || !r.dados) {
        setCnpjAviso(r.erro || 'CNPJ não encontrado.')
        ultimoCnpjBuscado.current = ''
        return
      }
      setNome((n) => (n.trim() ? n : r.dados!.razao_social || n))
      setEndereco(r.endereco || '')
      if (r.cep) setCep(r.cep)
      if (r.dados.email && !email.trim()) setEmail(r.dados.email)
      if (r.avisoCep) setCnpjAviso(r.avisoCep)
    } catch {
      setCnpjAviso('Consulta falhou — preenche na mão.')
      ultimoCnpjBuscado.current = ''
    } finally {
      setCnpjBuscando(false)
    }
  }

  const buscarCep = async (cepDigitado: string) => {
    const cepLimpo = cepDigitado.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return
    setCepBuscando(true)
    setCepErro('')
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const d = await r.json()
      if (d.erro) {
        setCepErro('CEP não encontrado — confere o número.')
        return
      }
      // montagem no PADRÃO ASAAS: "Rua X, N, Bairro, Cidade - UF, CEP, Complemento"
      const partes = [
        d.logradouro || '',
        numeroComplemento.trim(),
        d.bairro || '',
        `${d.localidade || ''} - ${d.uf || ''}`,
        cepLimpo,
      ].filter(Boolean)
      const base = partes.join(', ')
      setEndereco(base)
    } catch {
      setCepErro('Falhou a consulta — preenche na mão.')
    } finally {
      setCepBuscando(false)
    }
  }

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
      const v = valorNum()
      if (Number.isNaN(v) || v <= 0) {
        setErro(`Valor inválido: "${valor}". Use números, ex.: 450 ou 450,00.`)
        return
      }
      const nova = await createEmpresa({
        nome,
        cnpj_cpf: cnpjCpf,
        email,
        endereco,
        emite_nf: emitirNfServico,
        ativo: true,
        tipo_cliente: 'avulso',
      })
      setSelecionada(nova)
      setNovoCliente(false)
      await criarServico(nova.id)
    } catch (err) {
      const detalhe =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || ''
      setErro(
        'Não foi possível cadastrar o cliente/criar o serviço.' +
          (detalhe ? ` Detalhe: ${detalhe}` : ' Confira os dados e tente de novo.'),
      )
    } finally {
      setSalvando(false)
    }
  }

  // aceita "450", "450,00" e "450.00" (formato brasileiro)
  const valorNum = () => {
    const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
    const n = Number(limpo)
    return Number.isFinite(n) ? n : NaN
  }

  const criarServico = async (empresaId: string) => {
    setErro('')
    if (!valor || !descricao || !dataVenc) {
      setErro('Preencha: descrição do serviço, valor e vencimento.')
      return
    }
    const v = valorNum()
    if (Number.isNaN(v) || v <= 0) {
      setErro(`Valor inválido: "${valor}". Use números, ex.: 450 ou 450,00.`)
      return
    }
    setSalvando(true)
    try {
      const s = await createServico({
        empresa: empresaId,
        descricao,
        valor: v,
        data_servico: dataServico,
        data_vencimento: dataVenc,
        // NF é por SERVIÇO (decisão 08/10): usa a escolha da tela, não a da empresa
        emite_nf: emitirNfServico,
        status: 'emitido',
      })
      setCriado(s as unknown as Record<string, unknown>)
    } catch (err) {
      const detalhe =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || ''
      setErro(
        'Não foi possível criar o serviço.' +
          (detalhe ? ` Detalhe: ${detalhe}` : ' Tente novamente.'),
      )
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
              {/* Número do documento (SA 2026/0001), gerado no servidor pelo
                  hook servico_numero.js. Ele é gravado no MESMO save da
                  criação, então já vem preenchido aqui. */}
              {String((criado as { numero?: string }).numero || '').trim() && (
                <Badge variant="outline" className="font-mono">
                  {String((criado as { numero?: string }).numero)}
                </Badge>
              )}
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
              ) : (criado as { asaas_invoice_id?: string }).asaas_invoice_id ? (
                <Badge variant="secondary" className="animate-pulse">
                  NF na fila da prefeitura…
                </Badge>
              ) : null}
              {/* serviço criado sem NF: link para emitir depois */}
              {!(criado as { asaas_invoice_id?: string }).asaas_invoice_id &&
                !(criado as { asaas_invoice_url?: string }).asaas_invoice_url && (
                  <ReemitirNF
                    colecao="servicos"
                    id={String(criado.id ?? '')}
                    onOk={() => window.location.reload()}
                  />
                )}
              <Button
                variant="outline"
                onClick={async () => {
                  // config REAL do banco (marca/e-mail sempre atualizados)
                  const cfgList = await pb.collection('config').getFullList()
                  const cfg = cfgList[0]
                  gerarPdfServico(criado, selecionada, {
                    razao_social: cfg?.razao_social ?? '',
                    nome_fantasia: cfg?.nome_fantasia ?? '',
                    cnpj: cfg?.cnpj ?? '',
                    endereco: cfg?.endereco ?? '',
                    cidade_uf: cfg?.cidade_uf ?? '',
                    telefone: cfg?.telefone ?? '',
                    email: cfg?.email ?? '',
                  })
                }}
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
                setEmitirNfServico(false)
                setCep('')
                setNumeroComplemento('')
                setEndereco('')
                setNome('')
                setCnpjCpf('')
                setEmail('')
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
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <span className="text-sm font-medium">Emitir nota fiscal (NFS-e)</span>
                  <p className="text-xs text-muted-foreground">
                    Desligado = só relatório (OS) + boleto/Pix
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={emitirNfServico}
                  onChange={(e) => setEmitirNfServico(e.target.checked)}
                />
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
                <Label>
                  CPF/CNPJ{' '}
                  {cnpjBuscando && (
                    <span className="text-xs text-teal-700">buscando na Receita…</span>
                  )}
                </Label>
                <Input
                  value={cnpjCpf}
                  onChange={(e) => {
                    setCnpjCpf(e.target.value)
                    const digits = e.target.value.replace(/\D/g, '')
                    if (digits.length === 14) buscarCnpj(digits)
                  }}
                  onBlur={(e) => buscarCnpj(e.target.value)}
                  placeholder="14 dígitos — busca o endereço na Receita"
                />
                {cnpjAviso && <p className="text-xs text-amber-600">{cnpjAviso}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  CEP {cepBuscando && <span className="text-xs text-teal-700">buscando…</span>}
                </Label>
                <Input
                  value={cep}
                  onChange={(e) => {
                    setCep(e.target.value)
                    const limpo = e.target.value.replace(/\D/g, '')
                    if (limpo.length === 8) buscarCep(limpo)
                  }}
                  onBlur={(e) => buscarCep(e.target.value)}
                  inputMode="numeric"
                  placeholder="8 dígitos — busca a rua"
                />
                {cepErro && <p className="text-xs text-red-600">{cepErro}</p>}
              </div>
              <div className="space-y-1">
                <Label>Número + complemento</Label>
                <Input
                  value={numeroComplemento}
                  onChange={(e) => setNumeroComplemento(e.target.value)}
                  placeholder="150 ou 150 apto 42F"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Endereço completo (auto — ajusta se precisar)</Label>
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <span className="text-sm font-medium">Emitir nota fiscal (NFS-e)</span>
                <p className="text-xs text-muted-foreground">
                  Escolha por serviço — desligado = só OS + boleto/Pix
                </p>
              </div>
              <input
                type="checkbox"
                checked={emitirNfServico}
                onChange={(e) => setEmitirNfServico(e.target.checked)}
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
