import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getOrdens,
  getEmpresas,
  createOrdem,
  updateOrdem,
  brl,
  type OrdemServico,
  type Empresa,
} from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { jsPDF } from 'jspdf'
import { Plus } from 'lucide-react'

// MÓDULO ORDENS DE SERVIÇO (pedido dela 22/10): OS nasce da visita agendada
// (módulo Agenda), pode gerar cobrança (rota /os/cobrar → hook servico_avulso
// faz boleto+Pix+NF) e é assinada em papel (PDF) ou no celular (página pública
// /os-assinar com assinatura desenhada + nome/cargo).
const ROTULO_TIPO: Record<string, string> = {
  manutencao: 'Manutenção',
  instalacao: 'Instalação',
  entrega: 'Entrega',
  visita_tecnica: 'Visita técnica',
  outro: 'Outro',
}

const ROTULO_STATUS: Record<string, string> = {
  aberta: 'Aberta',
  aguardando_assinatura: 'Aguardando assinatura',
  assinada: 'Assinada',
  faturada: 'Faturada',
  cancelada: 'Cancelada',
}

const COR_STATUS: Record<string, string> = {
  aberta: 'bg-sky-600',
  aguardando_assinatura: 'bg-amber-500',
  assinada: 'bg-teal-600',
  faturada: 'bg-indigo-600',
  cancelada: 'bg-slate-400',
}

const NAVY: [number, number, number] = [15, 42, 67]
const TEAL: [number, number, number] = [13, 148, 136]
const CINZA: [number, number, number] = [107, 114, 128]

export default function Ordens() {
  const [params] = useSearchParams()
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // formulário
  const [fEmpresa, setFEmpresa] = useState('')
  const [fTipo, setFTipo] = useState('manutencao')
  const [fData, setFData] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fTecnico, setFTecnico] = useState('')
  const [fPecas, setFPecas] = useState('')
  const [fServico, setFServico] = useState('')
  const [fVenc, setFVenc] = useState('')
  const [fCobrar, setFCobrar] = useState(false)
  // modal de assinatura digital
  const [assinando, setAssinando] = useState<OrdemServico | null>(null)
  const [sigNome, setSigNome] = useState('')
  const [sigCargo, setSigCargo] = useState('')
  const [sigEnviando, setSigEnviando] = useState(false)

  const carregar = () => {
    Promise.all([getOrdens(), getEmpresas()])
      .then(([os, emps]) => {
        setOrdens(os)
        setEmpresas(emps)
      })
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    carregar()
    // ?nova=1 (vem da agenda): abre o formulário
    if (params.get('nova') === '1') setFormAberto(true)
  }, [])

  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome || ''

  const salvar = async () => {
    if (!fEmpresa || !fData || !fDesc.trim()) {
      setErro('Empresa, data e descrição são obrigatórios.')
      return
    }
    const pecas = Number(fPecas.replace(',', '.')) || 0
    const servico = Number(fServico.replace(',', '.')) || 0
    const total = pecas + servico
    setSalvando(true)
    setErro('')
    try {
      const hoje = new Date()
      const numero = `OS ${hoje.getFullYear()}/${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}-${String(hoje.getHours()).padStart(2, '0')}${String(hoje.getMinutes()).padStart(2, '0')}`
      await createOrdem({
        numero,
        empresa: fEmpresa,
        tipo: fTipo,
        data: `${fData} 00:00:00.000Z`,
        descricao: fDesc.trim(),
        tecnico: fTecnico,
        valor_pecas: pecas,
        valor_servico: servico,
        valor_total: total,
        gerar_cobranca: fCobrar && total > 0,
        data_vencimento: fVenc ? `${fVenc} 00:00:00.000Z` : '',
        status: 'aberta',
      })
      setFormAberto(false)
      setFDesc('')
      setFPecas('')
      setFServico('')
      setFVenc('')
      setFCobrar(false)
      carregar()
    } catch {
      setErro('Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const gerarPdf = (o: OrdemServico) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const W = 595
    const H = 842
    const emp = empresas.find((e) => e.id === o.empresa)
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, W, 80, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('LCCA Tecnologia', 40, 38)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(228, 238, 244)
    doc.text('LCCA INFORMATICA LTDA  ·  CNPJ 07.667.971/0001-39', 40, 55)
    doc.setFontSize(9)
    doc.text('Curitiba/PR  ·  (41) 98406-4557  ·  contato@lccatech.com', 40, 68)

    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(`ORDEM DE SERVICO ${o.numero || ''}`, 40, 106)

    doc.setFontSize(10.5)
    doc.setTextColor(26, 32, 38)
    doc.text('Cliente: ' + (emp?.nome ?? ''), 40, 130)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...CINZA)
    doc.text('CNPJ/CPF: ' + (emp?.cnpj_cpf ?? ''), 40, 145)
    if (emp?.endereco) doc.text('Endereço: ' + emp.endereco, 40, 158)
    doc.text(
      'Data: ' +
        String(o.data || '')
          .slice(0, 10)
          .split('-')
          .reverse()
          .join('/') +
        '  ·  Tipo: ' +
        (ROTULO_TIPO[o.tipo] || o.tipo) +
        '  ·  Técnico: ' +
        (o.tecnico || '—'),
      40,
      173,
    )

    let y = 195
    doc.setFillColor(...NAVY)
    doc.rect(40, y, W - 80, 18, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('DESCRIÇÃO DO SERVIÇO EXECUTADO', 45, y + 12.5)
    y += 18
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(26, 32, 38)
    const words = (o.descricao || '').split(' ')
    let line = ''
    for (const w of words) {
      if ((line + w).length > 95) {
        doc.text(line, 45, y + 12)
        y += 13
        line = ''
      }
      line += w + ' '
    }
    if (line.trim()) {
      doc.text(line, 45, y + 12)
      y += 13
    }

    y += 12
    const cardW = (W - 80 - 30) / 3
    const cards = [
      { label: 'Peças/material', valor: brl(o.valor_pecas), cor: NAVY },
      { label: 'Serviço', valor: brl(o.valor_servico), cor: TEAL },
      { label: 'Total', valor: brl(o.valor_total), cor: NAVY },
    ]
    cards.forEach((c, i) => {
      const x = 40 + i * (cardW + 15)
      doc.setFillColor(...c.cor)
      doc.rect(x, y, cardW, 50, 'F')
      doc.setTextColor(235, 244, 248)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(c.label, x + 10, y + 16)
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(13)
      doc.text(c.valor, x + 10, y + 36)
    })
    y += 74

    // assinatura digital embutida (se houver)
    if (o.assinatura_imagem) {
      try {
        doc.addImage(o.assinatura_imagem, 'PNG', 40, y, 180, 60)
      } catch (_) {}
      doc.setTextColor(...CINZA)
      doc.setFontSize(8)
      doc.text('Assinado digitalmente em ' + String(o.assinado_em || '').slice(0, 10), 40, y + 70)
      if (o.assinatura_nome) {
        doc.setTextColor(26, 32, 38)
        doc.text(`${o.assinatura_nome} (${o.assinatura_cargo || 'responsável'})`, 230, y + 40)
      }
    } else {
      doc.setDrawColor(...CINZA)
      doc.line(40, y + 60, 280, y + 60)
      doc.setFontSize(8)
      doc.setTextColor(...CINZA)
      doc.text('Assinatura do cliente (carimbo/assinatura)', 40, y + 74)
      doc.line(320, y + 60, 555, y + 60)
      doc.text('LCCA Tecnologia', 320, y + 74)
    }

    doc.save(`os-${(o.numero || o.id).replace(/[/\s]/g, '-')}.pdf`)
  }

  const marcarAssinada = async (o: OrdemServico, nome: string, cargo: string) => {
    await updateOrdem(o.id, {
      status: 'assinada',
      assinatura_nome: nome,
      assinatura_cargo: cargo,
      assinado_em: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
    })
    carregar()
  }

  const cobrar = async (o: OrdemServico) => {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/os/cobrar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: (await import('@/lib/pocketbase/client')).default.authStore.token,
      },
      body: JSON.stringify({ os_id: o.id }),
    })
    if (!res.ok) {
      alert('Falhou a cobrança — tente novamente.')
      return
    }
    carregar()
  }

  const linkAssinatura = (o: OrdemServico) => `${window.location.origin}/os-assinar?id=${o.id}`

  const copiarLink = (o: OrdemServico) => {
    navigator.clipboard.writeText(linkAssinatura(o))
    alert('Link copiado! Mande ao cliente pelo WhatsApp — ele assina no celular.')
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">
            Nascem da agenda (visita realizada) ou direto aqui — com assinatura e cobrança opcional
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700"
          size="sm"
          onClick={() => setFormAberto(!formAberto)}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova OS
        </Button>
      </div>

      {formAberto && (
        <Card className="mb-6">
          <CardContent className="py-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Empresa *</Label>
                <select
                  className="w-full rounded-md border bg-transparent p-2 text-sm"
                  value={fEmpresa}
                  onChange={(e) => setFEmpresa(e.target.value)}
                >
                  <option value="">Escolha…</option>
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
                  <option value="manutencao">Manutenção</option>
                  <option value="instalacao">Instalação</option>
                  <option value="entrega">Entrega</option>
                  <option value="visita_tecnica">Visita técnica</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Data *</Label>
                <Input type="date" value={fData} onChange={(e) => setFData(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição do serviço *</Label>
              <textarea
                className="w-full rounded-md border bg-transparent p-2 text-sm min-h-20"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="o que foi executado, equipamentos, observações…"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Técnico</Label>
                <Input
                  value={fTecnico}
                  onChange={(e) => setFTecnico(e.target.value)}
                  placeholder="quem executou"
                />
              </div>
              <div className="space-y-1">
                <Label>Peças/material (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={fPecas}
                  onChange={(e) => setFPecas(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1">
                <Label>Serviço (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={fServico}
                  onChange={(e) => setFServico(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1">
                <Label>Vencimento (se cobrar)</Label>
                <Input type="date" value={fVenc} onChange={(e) => setFVenc(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fCobrar}
                onChange={(e) => setFCobrar(e.target.checked)}
              />
              Gerar cobrança (boleto/Pix + NFS-e se a empresa emite nota)
            </label>
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                size="sm"
                disabled={salvando}
                onClick={salvar}
              >
                {salvando ? 'Salvando…' : 'Salvar OS'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : ordens.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma OS ainda. Elas nascem sozinhas quando uma visita da agenda é marcada como
            realizada ("Gerar OS") — ou crie uma direto em "Nova OS".
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ordens.map((o) => (
            <Card key={o.id}>
              <CardContent className="py-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-56">
                  <p className="font-medium text-sm">
                    {o.numero || 'OS'} · {ROTULO_TIPO[o.tipo] || o.tipo} — {nomeEmpresa(o.empresa)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {String(o.data || '')
                      .slice(0, 10)
                      .split('-')
                      .reverse()
                      .join('/')}{' '}
                    · {o.descricao.slice(0, 80)}
                    {o.descricao.length > 80 ? '…' : ''}
                  </p>
                </div>
                {o.valor_total > 0 && (
                  <span className="text-sm font-bold text-slate-700">{brl(o.valor_total)}</span>
                )}
                <Badge className={COR_STATUS[o.status] || 'bg-slate-400'}>
                  {ROTULO_STATUS[o.status] || o.status}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => gerarPdf(o)}>
                  PDF
                </Button>
                {(o.status === 'aberta' || o.status === 'aguardando_assinatura') && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-sky-600 text-sky-700 hover:bg-sky-50"
                      onClick={() => {
                        setAssinando(o)
                        setSigNome('')
                        setSigCargo('')
                      }}
                    >
                      ✍️ Assinar no celular
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-400 text-slate-600"
                      onClick={() => copiarLink(o)}
                    >
                      🔗 Copiar link
                    </Button>
                  </>
                )}
                {o.status === 'assinada' && !o.cobranca_gerada && o.valor_total > 0 && (
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => cobrar(o)}
                  >
                    💰 Cobrar
                  </Button>
                )}
                {o.cobranca_gerada && <Badge variant="outline">Cobrança gerada</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL ASSINATURA DIGITAL */}
      {assinando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-md w-full rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-lg font-bold">✍️ Assinatura da {assinando.numero || 'OS'}</h3>
              <button className="text-slate-400" onClick={() => setAssinando(null)}>
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Duas formas: o cliente assina <b>no celular dele</b> (mande o link — ele desenha a
              assinatura e confirma) ou você preenche aqui os dados de quem assinou em papel e
              guarda o PDF.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Link de assinatura (copiado pelo botão 🔗)</Label>
                <Input readOnly value={linkAssinatura(assinando)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Nome de quem assina (papel)</Label>
                  <Input value={sigNome} onChange={(e) => setSigNome(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Cargo</Label>
                  <Input value={sigCargo} onChange={(e) => setSigCargo(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAssinando(null)}>
                Fechar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                size="sm"
                disabled={sigEnviando || !sigNome.trim()}
                onClick={async () => {
                  setSigEnviando(true)
                  await marcarAssinada(assinando, sigNome.trim(), sigCargo.trim())
                  setSigEnviando(false)
                  setAssinando(null)
                }}
              >
                {sigEnviando ? 'Salvando…' : 'Marcar como assinada (papel)'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
