// Consulta CNPJ (Receita Federal, via rota do backend) + dupla checagem do CEP
// na base dos Correios (ViaCEP). Usada nos cadastros de empresa para preencher
// o endereço no PADRÃO DO ASAAS: "Rua X, N, Bairro, Cidade - UF, CEP, Complemento".
// Fluxo pedido pela Juliana: digita CNPJ -> preenche -> confere o CEP -> ajusta.

export interface DadosCnpj {
  fonte: string
  razao_social: string
  nome_fantasia: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone_1: string
  email: string
}

export interface DadosCep {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
}

export interface ResultadoCnpj {
  ok: boolean
  erro?: string
  dados?: DadosCnpj
  endereco?: string
  cep?: string
  avisoCep?: string
}

const titleCase = (s: string) =>
  (s || '')
    .toLowerCase()
    .split(/(\s|\/|-)/)
    .map((p) => (p.length > 2 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join('')

const montarEndereco = (
  rua: string,
  numero: string,
  bairro: string,
  cidade: string,
  uf: string,
  cep: string,
  complemento: string,
) => {
  const partes = [rua, numero, bairro, `${cidade} - ${uf}`, cep].filter(Boolean)
  const base = partes.join(', ')
  return complemento ? `${base}, ${complemento}` : base
}

// Consulta o CNPJ no backend e CONFERE o CEP nos Correios (2ª consulta).
// Se o CEP da Receita não for encontrado, mantém o endereço da Receita e avisa.
export async function consultarCnpj(cnpjDigitado: string): Promise<ResultadoCnpj> {
  const cnpj = (cnpjDigitado || '').replace(/\D/g, '')
  if (cnpj.length !== 14) {
    return { ok: false, erro: 'CNPJ incompleto — precisa ter 14 dígitos.' }
  }

  const base = import.meta.env.VITE_POCKETBASE_URL
  let d: DadosCnpj | null = null
  try {
    const r = await fetch(`${base}/backend/v1/cnpj?cnpj=${cnpj}`)
    if (!r.ok) {
      const j = await r.json().catch(() => null)
      return { ok: false, erro: j?.erro || 'Consulta falhou — tente de novo.' }
    }
    d = await r.json()
  } catch {
    return { ok: false, erro: 'Consulta falhou — confira a conexão.' }
  }
  if (!d || !d.razao_social) {
    return { ok: false, erro: 'CNPJ não encontrado na Receita.' }
  }

  const cepLimpo = (d.cep || '').replace(/\D/g, '')
  let avisoCep = ''
  let rua = titleCase(d.logradouro)
  let bairro = titleCase(d.bairro)
  let cidade = titleCase(d.municipio)
  let uf = (d.uf || '').toUpperCase()
  const cepFinal = cepLimpo

  // 2ª consulta: confere o CEP na base dos Correios
  if (cepLimpo.length === 8) {
    try {
      const rc = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const dc = await rc.json()
      if (dc && !dc.erro) {
        // Correios confirma: usa o logradouro/bairro OFICIAIS (padrão melhor)
        if (dc.logradouro) rua = dc.logradouro
        if (dc.bairro) bairro = dc.bairro
        if (dc.localidade) cidade = dc.localidade
        if (dc.uf) uf = dc.uf
      } else {
        avisoCep = 'CEP da Receita não confirmado nos Correios — confere antes de salvar.'
      }
    } catch {
      avisoCep = 'Não deu para conferir o CEP agora — confere antes de salvar.'
    }
  } else {
    avisoCep = 'Receita sem CEP — preenche o CEP para completar o endereço.'
  }

  const endereco = montarEndereco(
    rua,
    (d.numero || '').trim(),
    bairro,
    cidade,
    ufFinal || uf,
    cepFinal,
    titleCase(d.complemento || ''),
  )

  return {
    ok: true,
    dados: d,
    endereco,
    cep: cepFinal,
    avisoCep,
  }
}
