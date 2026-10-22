import { useEffect, useState } from 'react'
import { pbExport as pb, brl, type Empresa } from '@/services/gestor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { gerarPdfContrato } from '@/lib/pdf-contrato'
import { gerarDocxContrato } from '@/lib/docx-contrato'

// MÓDULO CONTRATOS (pedido dela 23/10): todos os contratos/aditivos gerados
// de todas as empresas em uma tela — PDF/DOCX de cada documento e upload do
// contrato ASSINADO digitalizado. Sem arquivo assinado = mostra o contrato
// das regras atuais (texto gerado pelo sistema).
const ROTULOS: Record<string, string> = {
  contrato: 'Contrato',
  aditivo_renovacao: 'Aditivo — renovação',
  aditivo_inclusao: 'Aditivo — inclusão',
  aditivo_exclusao: 'Aditivo — exclusão',
}

interface Doc {
  id: string
  empresa: string
  tipo: string
  numero: string
  texto: string
  assinado: boolean
  assinado_em: string
  arquivo: string
  created: string
  expand?: { empresa?: Empresa }
}

export default function Contratos() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'assinados' | 'sem_assinatura'>('todos')
  const [subindo, setSubindo] = useState<string | null>(null)
  // ASSINATURA GOVBR (pedido dela 23/10): a API oficial é só p/ órgãos públicos
  // (gov.br/governodigital) — o caminho real p/ empresa privada é o Portal de
  // Assinaturas gov.br (assinadordigital.gov.br): cliente assina lá (conta
  // prata/ouro, assinatura avançada Lei 14.063/2020) e sobe o PDF assinado aqui.
  const [govbr, setGovbr] = useState<Doc | null>(null)

  const carregar = () => {
    pb.collection('documentos_contrato')
      .getFullList<Doc>({ sort: '-created', expand: 'empresa' })
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, [])

  const abrirTexto = async (id: string) => {
    if (aberto === id) {
      setAberto(null)
      return
    }
    const rec = await pb.collection('documentos_contrato').getOne(id)
    setTexto((rec as unknown as { texto: string }).texto || '')
    setAberto(id)
  }

  const nomeArquivo = (d: Doc) =>
    `${ROTULOS[d.tipo] || d.tipo}-${(d.expand?.empresa?.nome || 'empresa').replace(/\s+/g, '-')}${d.numero ? '-' + d.numero.replace('/', '-') : ''}`

  const uploadAssinado = async (id: string, file: File) => {
    setSubindo(id)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('assinado', 'true')
      fd.append('assinado_em', new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z')
      await pb.collection('documentos_contrato').update(id, fd)
      carregar()
    } finally {
      setSubindo(null)
    }
  }

  const urlArquivo = (d: Doc) =>
    d.arquivo ? `${pb.baseUrl}/api/files/documentos_contrato/${d.id}/${d.arquivo}` : ''

  const lista = docs.filter((d) =>
    filtro === 'assinados' ? d.assinado : filtro === 'sem_assinatura' ? !d.assinado : true,
  )

  const empresasCount = new Set(docs.map((d) => d.empresa)).size
  const assinadosCount = docs.filter((d) => d.assinado).length

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contratos</h1>
          <p className="text-sm text-muted-foreground">
            {docs.length} documento(s) de {empresasCount} empresas · {assinadosCount} assinado(s)
          </p>
        </div>
        <div className="flex gap-2">
          {(['todos', 'assinados', 'sem_assinatura'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? 'default' : 'outline'}
              className={filtro === f ? 'bg-teal-600 hover:bg-teal-700' : ''}
              onClick={() => setFiltro(f)}
            >
              {f === 'todos' ? 'Todos' : f === 'assinados' ? 'Assinados' : 'Sem assinatura'}
            </Button>
          ))}
        </div>
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum documento ainda. Gere contratos e aditivos dentro do cadastro de cada empresa
            (seção "Contrato e aditivos").
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((d) => {
            const emp = d.expand?.empresa
            return (
              <Card key={d.id}>
                <CardContent className="py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-56">
                    <p className="font-medium">
                      {ROTULOS[d.tipo] || d.tipo}
                      {d.numero ? ` nº ${d.numero}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {emp?.nome || '—'} · gerado em{' '}
                      {new Date(d.created.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {d.assinado ? (
                    <Badge className="bg-teal-600">
                      Assinado
                      {d.assinado_em
                        ? ` em ${new Date(d.assinado_em.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}`
                        : ''}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="animate-pulse">
                      Sem assinatura
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => abrirTexto(d.id)}>
                    {aberto === d.id ? 'Fechar' : 'Ver texto'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-teal-600 text-teal-700 hover:bg-teal-50"
                    onClick={() => gerarPdfContrato(d.texto, `${nomeArquivo(d)}.pdf`)}
                  >
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                    onClick={() => gerarDocxContrato(d.texto, `${nomeArquivo(d)}.docx`)}
                  >
                    DOCX
                  </Button>
                  {d.arquivo ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(urlArquivo(d), '_blank')}
                    >
                      📎 Assinado
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-sky-600 text-sky-700 hover:bg-sky-50"
                        onClick={() => setGovbr(d)}
                      >
                        🇧🇷 Assinar via GovBR
                      </Button>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadAssinado(d.id, f)
                          }}
                        />
                        <span className="inline-flex h-9 items-center justify-center rounded-md border border-amber-500 bg-background px-3 text-sm font-medium text-amber-700 hover:bg-amber-50">
                          {subindo === d.id ? 'Enviando…' : '⬆ Enviar assinado'}
                        </span>
                      </label>
                    </>
                  )}
                  {aberto === d.id && (
                    <div className="w-full">
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border bg-slate-50 p-3 text-xs text-slate-700">
                        {texto}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* MODAL ASSINATURA GOVBR — passo a passo p/ o cliente */}
      {govbr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-lg w-full rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-lg font-bold">
                🇧🇷 Assinar via GovBR — {ROTULOS[govbr.tipo] || govbr.tipo}
                {govbr.numero ? ` nº ${govbr.numero}` : ''}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setGovbr(null)}
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Documento: <b>{govbr.expand?.empresa?.nome || '—'}</b>
            </p>
            <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-2 mb-4">
              <li>
                Baixe o PDF do contrato (botão <b>PDF</b> na linha dele).
              </li>
              <li>
                Mande o PDF para o cliente e peça para ele acessar{' '}
                <a
                  className="text-sky-700 underline"
                  href="https://assinadordigital.gov.br"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  assinadordigital.gov.br
                </a>{' '}
                com a conta gov.br dele (precisa ser <b>nível prata ou ouro</b> — conta bronze não
                assina).
              </li>
              <li>
                Lá ele clica em <b>"Nova assinatura"</b>, sobe o PDF, coloca o nome dele como
                signatário e assina. É <b>gratuito</b> e tem validade jurídica (assinatura
                eletrônica avançada — Lei 14.063/2020).
              </li>
              <li>
                O portal devolve o <b>PDF assinado</b> — o cliente te manda de volta (WhatsApp ou
                e-mail).
              </li>
              <li>
                Você sobe o PDF assinado aqui embaixo: o contrato fica marcado como <b>Assinado</b>{' '}
                com a data, e o arquivo fica guardado no sistema. Qualquer pessoa pode conferir a
                assinatura em{' '}
                <a
                  className="text-sky-700 underline"
                  href="https://validar.iti.gov.br"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  validar.iti.gov.br
                </a>
                .
              </li>
            </ol>
            <label className="cursor-pointer block">
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    uploadAssinado(govbr.id, f)
                    setGovbr(null)
                  }
                }}
              />
              <span className="inline-flex w-full h-10 items-center justify-center rounded-md bg-teal-600 px-3 text-sm font-bold text-white hover:bg-teal-700">
                {subindo ? 'Enviando…' : '⬆ Subir o PDF assinado (passo 5)'}
              </span>
            </label>
            <p className="text-xs text-slate-400 mt-2">
              Nota: a API oficial do gov.br para assinatura automática dentro de sistemas é
              exclusiva de órgãos públicos — por isso o fluxo usa o portal oficial, que dá o mesmo
              resultado jurídico.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
