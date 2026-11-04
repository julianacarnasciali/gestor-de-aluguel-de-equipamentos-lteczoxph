// TESTE TEMPORÁRIO (04/11/2026) — validar se o jsPDF roda no JSVM.
// Se rodar, o gerador de relatório passa a viver no servidor e o e-mail
// consegue anexar o PDF. Apagar depois do teste.
routerAdd('GET', '/backend/v1/teste-pdf', (e) => {
  const out = { passos: [] }
  try {
    const { jsPDF } = require('jspdf')
    out.passos.push('require ok')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    out.passos.push('new jsPDF ok')
    doc.setFillColor(15, 42, 67)
    doc.rect(0, 0, 595, 80, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('LCCA TECH', 40, 38)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Teste de geracao de PDF no servidor', 40, 120)
    out.passos.push('desenho ok')

    const buf = doc.output('arraybuffer')
    out.arraybuffer = buf ? buf.byteLength || buf.length || 0 : 0
    const bytes = new Uint8Array(buf)
    out.bytesLen = bytes.length
    out.head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
    out.passos.push('arraybuffer ok')

    const dataUri = doc.output('datauristring')
    out.dataUriLen = String(dataUri).length
    out.dataUriHead = String(dataUri).slice(0, 40)
    out.passos.push('datauristring ok')

    return e.json(200, out)
  } catch (err) {
    out.erro = String(err && err.message ? err.message : err)
    out.stack = String(err && err.stack ? err.stack : '').slice(0, 600)
    return e.json(500, out)
  }
})
