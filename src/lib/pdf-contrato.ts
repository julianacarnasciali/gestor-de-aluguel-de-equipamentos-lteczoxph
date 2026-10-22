import { jsPDF } from 'jspdf'

// PDF do contrato/aditivo gerado — layout LCCA (faixa navy, corpo A4),
// texto quebrado em múltiplas páginas. Reusa o padrão do pdf-fechamento.
export function gerarPdfContrato(texto: string, nomeArquivo: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const W = 595
  const H = 842
  const M = 56

  // faixa superior navy
  doc.setFillColor(15, 42, 67)
  doc.rect(0, 0, W, 64, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('LCCA TECH', M, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(214, 226, 235)
  doc.text('Locação e suporte de TI  ·  contato@lccatech.com  ·  Curitiba/PR', M, 46)

  // corpo
  let y = 96
  doc.setTextColor(26, 32, 38)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const linhas = doc.splitTextToSize(texto || '', W - 2 * M)
  for (const ln of linhas) {
    if (y > H - 64) {
      doc.addPage()
      y = 64
    }
    doc.text(ln, M, y)
    y += 13.5
  }

  // rodapé de página
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(120, 130, 140)
    doc.text(
      `LCCA Tech — documento interno gerado pelo sistema · página ${p} de ${total}`,
      M,
      H - 36,
    )
  }

  doc.save(nomeArquivo)
}
