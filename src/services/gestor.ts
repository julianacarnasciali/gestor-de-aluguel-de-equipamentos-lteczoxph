import pb from '@/lib/pocketbase/client'

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
  expand?: { empresa?: Empresa }
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
  tipo: 'impressora' | 'dispositivo' | 'servidor'
  empresa: string
  contrato: string
  patrimonio: string
  setor: string
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
export const getEmpresas = () => pb.collection('empresas').getFullList<Empresa>({ sort: 'nome' })
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
    filter: pb.filter('tipo = {:t} && ativo = true', { t: 'impressora' }),
    expand: 'empresa,contrato',
  })

// ---------- Leituras ----------
export const getLeituras = (competencia: string) =>
  pb.collection('leituras').getFullList<Leitura>({
    filter: pb.filter('competencia = {:c}', { c: competencia }),
    expand: 'equipamento',
  })
export const createLeitura = (data: Record<string, unknown>) =>
  pb.collection('leituras').create<Leitura>(data)

export const brl = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
