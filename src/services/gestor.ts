import pb from '@/lib/pocketbase/client'

export interface Contato {
  nome: string
  setor: string
  email: string
}

export interface Empresa {
  id: string
  nome: string
  cnpj_cpf: string
  telefone: string
  email: string
  endereco: string
  grupo: string
  unidade: string
  responsavel_email: string
  responsavel_nome: string
  emite_nf: boolean
  ativo: boolean
  observacoes: string
  tipo_cliente: 'contrato' | 'avulso' | ''
  contatos: Contato[]
  indicado_por: string
  expand?: { indicado_por?: Empresa }
}

export interface Contrato {
  id: string
  empresa: string
  ativo: boolean
  mensalidade: number
  paginas_contratadas: number
  preco_excedente: number
  vlr_dispositivos: number
  vlr_servidores: number
  vlr_servicos: number
  tipo_cobranca: 'leitura' | 'media'
  paginas_media: number
  tipo_excedente: 'total' | 'por_maquina'
  dia_leitura: number
  dia_vencimento: number
  reajuste_mes: string
  reajuste_percentual: number
  mes_ini: string
  mes_fim: string
  numero: string
  observacoes: string
  expand?: { empresa?: Empresa }
}

export interface Equipamento {
  id: string
  tipo:
    | 'impressora'
    | 'computador'
    | 'monitor'
    | 'servidor'
    | 'camera'
    | 'central_telefonica'
    | 'sistema_servico'
    | 'outros'
  empresa: string
  contrato: string
  patrimonio: string
  marca_modelo: string
  numero_serie: string
  setor: string
  ip: string
  descricao: string
  ativo: boolean
  expand?: { empresa?: Empresa; contrato?: Contrato }
}

export interface Leitura {
  id: string
  equipamento: string
  contrato: string
  competencia: string
  leitura_anterior: number
  leitura_atual: number
  paginas_mes: number
  arquivo?: string
}

// ---------- Empresas ----------
export const getEmpresas = () =>
  pb.collection('empresas').getFullList<Empresa>({ sort: 'nome', expand: 'indicado_por' })
export const updateEmpresa = (id: string, data: Partial<Empresa>) =>
  pb.collection('empresas').update<Empresa>(id, data)

// ---------- Contratos ----------
export const getContratos = () =>
  pb.collection('contratos').getFullList<Contrato>({
    sort: '-ativo',
    expand: 'empresa',
  })

// ---------- Equipamentos ----------
export const getEquipamentos = () =>
  pb.collection('equipamentos').getFullList<Equipamento>({
    sort: 'patrimonio',
    filter: 'tipo = "impressora" && ativo = true',
    expand: 'empresa',
  })

// ---------- Leituras ----------
export const getLeituras = (competencia: string) =>
  pb.collection('leituras').getFullList<Leitura>({
    filter: `competencia = "${competencia}"`,
    expand: 'equipamento',
  })
export const createLeitura = (data: Record<string, unknown>) =>
  pb.collection('leituras').create<Leitura>(data)
export const updateLeitura = (id: string, data: Record<string, unknown>) =>
  pb.collection('leituras').update<Leitura>(id, data)

// ---------- leitura anterior (competência anterior, última lançada) ----------
export const getLeituraAnterior = async (equipamento: string, competencia: string) => {
  const [mes, ano] = competencia.split('/')
  const d = new Date(Number(ano), Number(mes) - 2, 1)
  const compAnterior = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const lista = await pb.collection('leituras').getList<Leitura>(1, 1, {
    filter: `equipamento = "${equipamento}" && competencia = "${compAnterior}"`,
    sort: '-created',
  })
  return lista.items[0] ?? null
}

export const brl = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
