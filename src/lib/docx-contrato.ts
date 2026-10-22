import { Document, Packer, Paragraph, TextRun } from 'docx'

// DOCX do contrato/aditivo gerado — texto simples editável no Word
// (o Luiz costuma ajustar datas/valores antes de imprimir).
export async function gerarDocxContrato(texto: string, nomeArquivo: string) {
  const paragrafos = (texto || '').split('\n').map(
    (l) =>
      new Paragraph({
        children: [new TextRun({ text: l, font: 'Calibri', size: 22 })],
      }),
  )
  const d = new Document({
    sections: [{ properties: {}, children: paragrafos }],
  })
  const blob = await Packer.toBlob(d)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
