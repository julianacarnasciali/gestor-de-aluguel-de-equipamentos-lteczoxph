import jsPDF from 'jspdf'

interface DadosServico {
  id?: string
  descricao?: string
  valor?: number
  data_servico?: string
  data_vencimento?: string
  asaas_boleto_url?: string
  asaas_linha_digitavel?: string
  asaas_pix_payload?: string
  asaas_invoice_url?: string
}

interface DadosEmpresa {
  nome?: string
  cnpj_cpf?: string
  endereco?: string
}

interface DadosConfig {
  razao_social?: string
  nome_fantasia?: string
  cnpj?: string
  endereco?: string
  cidade_uf?: string
  telefone?: string
  email?: string
}

const NAVY: [number, number, number] = [15, 42, 67]
const TEAL: [number, number, number] = [13, 148, 136]
const CINZA: [number, number, number] = [100, 116, 139]

const dataBR = (iso?: string) => {
  if (!iso) return '—'
  const d = String(iso).slice(0, 10)
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : iso
}

export function gerarPdfServico(
  s: DadosServico,
  empresa: DadosEmpresa | null | undefined,
  config: DadosConfig | null | undefined,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  // cabeçalho
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(config?.nome_fantasia || 'LCCA Tecnologia', 14, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`${config?.razao_social ?? ''} · CNPJ ${config?.cnpj ?? ''}`.trim(), 14, 22)
  doc.text(
    `${config?.cidade_uf ?? ''} · ${config?.telefone ?? ''} · ${config?.email ?? ''}`.trim(),
    14,
    27,
  )

  // título
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('ORDEM DE SERVIÇO', 14, 46)

  // dados do cliente
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Cliente', 14, 56)
  doc.setFont('helvetica', 'normal')
  doc.text(empresa?.nome || '—', 14, 62)
  if (empresa?.cnpj_cpf) doc.text(`CNPJ/CPF: ${empresa.cnpj_cpf}`, 14, 67)
  if (empresa?.endereco) doc.text(empresa.endereco, 14, 72)

  // dados do serviço
  doc.setFont('helvetica', 'bold')
  doc.text('Serviço prestado', 14, 84)
  doc.setFont('helvetica', 'normal')
  const desc = doc.splitTextToSize(s.descricao || '—', W - 28)
  doc.text(desc, 14, 90)

  let y = 90 + desc.length * 5 + 4

  // resumo em cards
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, y, 60, 18, 2, 2)
  doc.roundedRect(78, y, 60, 18, 2, 2)
  doc.roundedRect(142, y, 54, 18, 2, 2)
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text('DATA DO SERVIÇO', 20, y + 6)
  doc.text('VENCIMENTO', 84, y + 6)
  doc.text('VALOR', 148, y + 6)
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.text(dataBR(s.data_servico), 20, y + 13)
  doc.text(dataBR(s.data_vencimento), 84, y + 13)
  doc.text(
    (s.valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    148,
    y + 13,
  )

  y += 30

  // pagamento
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  if (s.asaas_linha_digitavel) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text('Linha digitável do boleto:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(s.asaas_linha_digitavel, 14, y + 5)
    y += 14
  }
  if (s.asaas_pix_payload) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text('Pix copia e cola:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const pix = doc.splitTextToSize(s.asaas_pix_payload, W - 28)
    doc.text(pix, 14, y + 5)
    y += 5 + pix.length * 3 + 4
  }

  // rodapé legal
  doc.setFontSize(7)
  doc.setTextColor(...CINZA)
  doc.text(
    'Documento gerado pelo sistema LCCA Tecnologia. Serviço avulso — não substitui a nota fiscal de serviço.',
    14,
    285,
  )

  const nomeArquivo = `os-servico-${(empresa?.nome || 'cliente').toLowerCase().replace(/\s+/g, '-')}.pdf`
  doc.save(nomeArquivo)
}
