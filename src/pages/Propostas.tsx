import { useEffect, useState } from 'react'
import { pbExport, getEmpresas, brl, type Empresa } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { jsPDF } from 'jspdf'
import { Plus } from 'lucide-react'

// MÓDULO PROPOSTAS COMERCIAIS (pedido dela 23/10): o Luiz descreve a oferta,
// a IA corrige/melhora e faz perguntas; PDF layout LCCA (logo no cabeçalho,
// CNPJ/endereço no rodapé). Preparado p/ automação: origem 'whatsapp' já
// existe no schema/rota — o envio automático reusa /backend/v1/proposta/gerar.

interface ItemProposta {
  descricao: string
  qtd: number
  valor_unit: number
  total: number
}

interface RevisaoIA {
  perguntas?: { campo: string; pergunta: string }[]
  correcoes?: { de: string; para: string }[]
  sugestoes?: string[]
}

interface Proposta {
  id: string
  numero: string
  empresa: string
  cliente_nome: string
  cliente_doc: string
  cliente_email: string
  cliente_telefone: string
  tipo: 'locacao' | 'venda' | 'servico'
  titulo: string
  descricao: string
  itens: ItemProposta[]
  valor_total: number
  validade_dias: number
  condicoes: string
  texto_final: string
  revisao_ia: RevisaoIA
  status: 'rascunho' | 'enviada' | 'aceita' | 'recusada'
  origem: 'manual' | 'whatsapp' | 'ia'
  created: string
  expand?: { empresa?: Empresa }
}

const NAVY: [number, number, number] = [15, 42, 67]
const TEAL: [number, number, number] = [13, 148, 136]
const CINZA: [number, number, number] = [107, 114, 128]
const ZEBRA: [number, number, number] = [244, 246, 248]

const ROTULO_STATUS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  recusada: 'Recusada',
}

const COR_STATUS: Record<string, string> = {
  rascunho: 'bg-slate-400',
  enviada: 'bg-sky-600',
  aceita: 'bg-teal-600',
  recusada: 'bg-red-500',
}

export default function Propostas() {
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // formulário
  const [fEmpresa, setFEmpresa] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fDoc, setFDoc] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fFone, setFFone] = useState('')
  const [fTipo, setFTipo] = useState('servico')
  const [fTitulo, setFTitulo] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fValidade, setFValidade] = useState('15')
  const [fCondicoes, setFCondicoes] = useState('')
  const [fItens, setFItens] = useState<{ descricao: string; qtd: string; valor: string }[]>([
    { descricao: '', qtd: '1', valor: '' },
  ])
  // resposta da IA
  const [iaResultado, setIaResultado] = useState<{
    ok: boolean
    id?: string
    numero?: string
    perguntas: { campo: string; pergunta: string }[]
    sugestoes: string[]
    texto_final: string
  } | null>(null)
  const [respostasLuiz, setRespostasLuiz] = useState('')
  // modal PDF
  const [pdfProp, setPdfProp] = useState<Proposta | null>(null)

  const carregar = () => {
    Promise.all([
      pbExport
        .collection('propostas_comerciais')
        .getFullList<Proposta>({ sort: '-created', expand: 'empresa' }),
      getEmpresas(),
    ])
      .then(([ps, emps]) => {
        setPropostas(ps)
        setEmpresas(emps)
      })
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, [])

  const totalItens = fItens.reduce((s, it) => {
    const q = Number(it.qtd) || 0
    const v = Number(it.valor.replace(',', '.')) || 0
    return s + q * v
  }, 0)

  const gerar = async () => {
    if (!fCliente.trim() || !fTitulo.trim() || !fDesc.trim()) {
      setErro('Cliente, título e descrição são obrigatórios.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/proposta/gerar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: pbExport.authStore.token,
        },
        body: JSON.stringify({
          empresa_id: fEmpresa,
          cliente_nome: fCliente,
          cliente_doc: fDoc,
          cliente_email: fEmail,
          cliente_telefone: fFone,
          tipo: fTipo,
          titulo: fTitulo,
          descricao: fDesc,
          itens: fItens
            .filter((it) => it.descricao.trim() || it.valor)
            .map((it) => ({
              descricao: it.descricao.trim(),
              qtd: Number(it.qtd) || 1,
              valor_unit: Number(it.valor.replace(',', '.')) || 0,
            })),
          validade_dias: Number(fValidade) || 15,
          condicoes: fCondicoes,
          respostas: respostasLuiz,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setErro(d.error || 'Falhou a geração — tente novamente.')
        return
      }
      setIaResultado({
        ok: !!d.ok,
        id: d.id,
        numero: d.numero,
        perguntas: d.perguntas || [],
        sugestoes: d.sugestoes || [],
        texto_final: d.texto_final || '',
      })
      carregar()
    } catch {
      setErro('Falhou a geração — tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const limparForm = () => {
    setFEmpresa('')
    setFCliente('')
    setFDoc('')
    setFEmail('')
    setFFone('')
    setFTipo('servico')
    setFTitulo('')
    setFDesc('')
    setFValidade('15')
    setFCondicoes('')
    setFItens([{ descricao: '', qtd: '1', valor: '' }])
    setIaResultado(null)
    setRespostasLuiz('')
  }

  const gerarPdf = async (p: Proposta) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const W = 595
    const H = 842
    const emp = empresas.find((e) => e.id === p.empresa)

    // CABEÇALHO — faixa navy + LOGO (jsPDF não aceita URL remota: baixa e
    // converte p/ dataURL antes — corrigido 23/10 após o PDF sair sem logo)
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, W, 92, 'F')
    aplicarLogo(doc)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('PROPOSTA COMERCIAL', 40, 88)

    // dados do cliente
    doc.setTextColor(...NAVY)
    doc.setFontSize(10.5)
    doc.setFont('helvetica', 'bold')
    doc.text('Cliente: ' + (p.cliente_nome || ''), 40, 122)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...CINZA)
    let y = 136
    if (p.cliente_doc) {
      doc.text('CNPJ/CPF: ' + p.cliente_doc, 40, y)
      y += 13
    }
    if (p.cliente_email) {
      doc.text('E-mail: ' + p.cliente_email, 40, y)
      y += 13
    }
    if (p.cliente_telefone) {
      doc.text('Telefone: ' + p.cliente_telefone, 40, y)
      y += 13
    }
    doc.text(
      'Proposta nº ' + (p.numero || '') + ' · ' + new Date().toLocaleDateString('pt-BR'),
      40,
      y,
    )
    y += 13
    doc.text('Validade da proposta: ' + (p.validade_dias || 15) + ' dias', 40, y)
    y += 22

    // título da oferta
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text((p.titulo || '').slice(0, 90), 40, y)
    y += 20

    // texto final da IA (ou rascunho)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(26, 32, 38)
    const texto = p.texto_final || p.descricao
    const palavras = (texto || '').split(/\s+/)
    let linha = ''
    for (const w of palavras) {
      if ((linha + w).length > 92) {
        doc.text(linha, 40, y)
        y += 13
        linha = ''
      }
      linha += w + ' '
    }
    if (linha.trim()) {
      doc.text(linha, 40, y)
      y += 13
    }
    y += 10

    // tabela de itens
    doc.setFillColor(...NAVY)
    doc.rect(40, y, W - 80, 18, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.8)
    const cols = [40, 340, 400, 460, 515]
    const heads = ['Item', 'Qtd', 'Valor unit.', 'Total']
    doc.text(heads[0], cols[0] + 5, y + 12.5)
    doc.text(heads[1], cols[1], y + 12.5)
    doc.text(heads[2], cols[2], y + 12.5)
    doc.text(heads[3], cols[3], y + 12.5)
    y += 18
    const itens = Array.isArray(p.itens) ? p.itens : []
    itens.forEach((it, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(...ZEBRA)
        doc.rect(40, y, W - 80, 17, 'F')
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(26, 32, 38)
      doc.text((it.descricao || '').slice(0, 58), 45, y + 12)
      doc.text(String(it.qtd ?? 1), cols[1], y + 12)
      doc.text(brl(it.valor_unit), cols[2], y + 12)
      doc.text(brl(it.total ?? it.qtd * it.valor_unit), cols[3], y + 12)
      y += 17
    })

    // total
    y += 10
    doc.setFillColor(...TEAL)
    doc.rect(360, y, 195, 30, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('VALOR TOTAL', 370, y + 12)
    doc.setFontSize(13)
    doc.text(brl(p.valor_total), 370, y + 26)
    y += 48

    // condições
    if (p.condicoes) {
      doc.setTextColor(...CINZA)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const condWords = p.condicoes.split(/\s+/)
      let condLine = ''
      for (const w of condWords) {
        if ((condLine + w).length > 92) {
          doc.text(condLine, 40, y)
          y += 12
          condLine = ''
        }
        condLine += w + ' '
      }
      if (condLine.trim()) {
        doc.text(condLine, 40, y)
        y += 12
      }
    }

    // RODAPÉ — endereço, CNPJ, contato
    doc.setFillColor(...NAVY)
    doc.rect(0, H - 54, W, 54, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      'LCCA INFORMATICA LTDA · CNPJ 07.667.971/0001-39 · Curitiba/PR · (41) 98406-4557 · contato@lccatech.com',
      40,
      H - 34,
    )
    doc.setTextColor(180, 200, 210)
    doc.text(
      'Proposta válida por ' +
        (p.validade_dias || 15) +
        ' dias · LCCA Tech — tecnologia que trabalha por você',
      40,
      H - 20,
    )

    doc.save(`proposta-${(p.numero || p.id).replace(/[/\s]/g, '-')}.pdf`)
  }

  // LOGO no PDF: baixa a imagem e converte p/ dataURL (jsPDF não aceita URL
  // remota — lição 23/10). Cache em memória p/ não baixar 2x.
  const [logoDataUrl, setLogoDataUrl] = useState('')
  useEffect(() => {
    if (logoDataUrl) return
    fetch(
      'https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/ib0smsxri8sw6q2/full_branco_y8024354gz.png',
    )
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) =>
        b
          ? new Promise<string>((res) => {
              const fr = new FileReader()
              fr.onload = () => res(String(fr.result))
              fr.readAsDataURL(b)
            })
          : '',
      )
      .then((d) => d && setLogoDataUrl(d))
      .catch(() => {})
  }, [])

  // injeta a logo no PDF logo após o cabeçalho (antes do save)
  const aplicarLogo = (doc: jsPDF) => {
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', 40, 22, 190, 48)
      } catch (_) {
        // logo inválida — segue sem ela
      }
    }
  }
  const marcarStatus = async (p: Proposta, status: string) => {
    await pbExport.collection('propostas_comerciais').update(p.id, { status })
    carregar()
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Propostas comerciais</h1>
          <p className="text-sm text-muted-foreground">
            Descreva a oferta — a IA corrige, melhora e faz perguntas. PDF pronto para
            e-mail/WhatsApp.
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700"
          size="sm"
          onClick={() => {
            if (formAberto) limparForm()
            else setFormAberto(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova proposta
        </Button>
      </div>

      {formAberto && (
        <Card className="mb-6">
          <CardContent className="py-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Input
                  value={fCliente}
                  onChange={(e) => setFCliente(e.target.value)}
                  placeholder="nome do cliente"
                />
              </div>
              <div className="space-y-1">
                <Label>Empresa cadastrada (opcional)</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={fEmpresa}
                  onChange={(e) => setFEmpresa(e.target.value)}
                >
                  <option value="">— cliente novo (sem cadastro) —</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={fTipo}
                  onChange={(e) => setFTipo(e.target.value)}
                >
                  <option value="locacao">Locação</option>
                  <option value="venda">Venda</option>
                  <option value="servico">Serviço</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>CNPJ/CPF</Label>
                <Input
                  value={fDoc}
                  onChange={(e) => setFDoc(e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div className="space-y-1">
                <Label>Telefone/WhatsApp</Label>
                <Input
                  value={fFone}
                  onChange={(e) => setFFone(e.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Título da oferta *</Label>
              <Input
                value={fTitulo}
                onChange={(e) => setFTitulo(e.target.value)}
                placeholder="ex.: Locação de 3 impressoras multifuncionais"
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição da oferta (o que o Luiz quer oferecer) *</Label>
              <textarea
                className="w-full rounded-md border bg-transparent p-2 text-sm min-h-24"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="descreva como se estivesse explicando ao cliente — a IA corrige e melhora"
              />
            </div>
            <div>
              <Label>Itens e valores</Label>
              {fItens.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_70px_110px_36px] gap-2 mb-2 items-center"
                >
                  <Input
                    value={it.descricao}
                    onChange={(e) => {
                      const novo = [...fItens]
                      novo[idx] = { ...novo[idx], descricao: e.target.value }
                      setFItens(novo)
                    }}
                    placeholder="item (ex.: Impressora multifuncional Kyocera)"
                  />
                  <Input
                    value={it.qtd}
                    onChange={(e) => {
                      const novo = [...fItens]
                      novo[idx] = { ...novo[idx], qtd: e.target.value }
                      setFItens(novo)
                    }}
                    placeholder="qtd"
                    inputMode="numeric"
                  />
                  <Input
                    value={it.valor}
                    onChange={(e) => {
                      const novo = [...fItens]
                      novo[idx] = { ...novo[idx], valor: e.target.value }
                      setFItens(novo)
                    }}
                    placeholder="R$ unit."
                    inputMode="decimal"
                  />
                  <button
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => setFItens(fItens.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="text-xs text-teal-700 underline"
                onClick={() => setFItens([...fItens, { descricao: '', qtd: '1', valor: '' }])}
              >
                + adicionar item
              </button>
              {totalItens > 0 && (
                <p className="text-sm font-bold text-slate-700 mt-1">Total: {brl(totalItens)}</p>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Validade (dias)</Label>
                <Input
                  value={fValidade}
                  onChange={(e) => setFValidade(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label>Condições (pagamento, entrega, garantia…)</Label>
                <Input
                  value={fCondicoes}
                  onChange={(e) => setFCondicoes(e.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                size="sm"
                disabled={salvando}
                onClick={gerar}
              >
                {salvando ? '🤖 IA revisando…' : '🤖 Gerar com revisão da IA'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RESULTADO DA IA — perguntas + sugestões + texto final */}
      {iaResultado && (
        <Card className="mb-6 border-sky-300">
          <CardContent className="py-4 space-y-3">
            <h3 className="font-bold text-sky-800">🤖 Revisão da IA — {iaResultado.numero}</h3>
            {iaResultado.perguntas.length > 0 && (
              <div className="rounded-md border bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800 mb-2">
                  Perguntas para o Luiz responder (responda aqui e clique em gerar de novo):
                </p>
                <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                  {iaResultado.perguntas.map((q, i) => (
                    <li key={i}>{q.pergunta}</li>
                  ))}
                </ul>
                <textarea
                  className="w-full rounded-md border bg-white p-2 text-sm mt-2 min-h-16"
                  value={respostasLuiz}
                  onChange={(e) => setRespostasLuiz(e.target.value)}
                  placeholder="responda as perguntas aqui (a IA usa na próxima geração)"
                />
              </div>
            )}
            {iaResultado.sugestoes.length > 0 && (
              <div className="rounded-md border bg-sky-50 p-3">
                <p className="text-sm font-semibold text-sky-800 mb-1">Sugestões da IA:</p>
                <ul className="list-disc pl-5 text-sm text-sky-900 space-y-1">
                  {iaResultado.sugestoes.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {iaResultado.texto_final && (
              <div className="rounded-md border bg-lime-50 p-3">
                <p className="text-sm font-semibold text-lime-800 mb-1">Texto final da proposta:</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {iaResultado.texto_final}
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setIaResultado(null)}>
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : propostas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma proposta ainda. Clique em "Nova proposta" — o Luiz descreve, a IA revisa e o PDF
            sai pronto.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {propostas.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-56">
                  <p className="font-medium text-sm">
                    {p.numero} · {p.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.cliente_nome} ·{' '}
                    {new Date(p.created.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}
                    {p.origem === 'whatsapp' ? ' · via WhatsApp' : ''}
                  </p>
                </div>
                {p.valor_total > 0 && (
                  <span className="text-sm font-bold text-slate-700">{brl(p.valor_total)}</span>
                )}
                <Badge className={COR_STATUS[p.status] || 'bg-slate-400'}>
                  {ROTULO_STATUS[p.status] || p.status}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => gerarPdf(p)}>
                  PDF
                </Button>
                {p.status === 'rascunho' && (
                  <Button
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700"
                    onClick={() => marcarStatus(p, 'enviada')}
                  >
                    ✉️ Marcar enviada
                  </Button>
                )}
                {p.status === 'enviada' && (
                  <>
                    <Button
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700"
                      onClick={() => marcarStatus(p, 'aceita')}
                    >
                      ✓ Aceita
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-400 text-red-600"
                      onClick={() => marcarStatus(p, 'recusada')}
                    >
                      ✗ Recusada
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
