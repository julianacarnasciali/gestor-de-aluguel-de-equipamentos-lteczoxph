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
  tipo_cliente: 'impressora' | 'misto' | 'computador' | 'avulso' | ''
  contatos: Contato[]
  indicado_por: string
  indicado_por_texto: string
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
  contador_manual: boolean
  vlr_mensal: number
  franquia_paginas: number
  substituido_em: string
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
  origem: 'contador' | 'manual' | 'media'
}

// ---------- Empresas ----------
export const getEmpresas = () =>
  pb.collection('empresas').getFullList<Empresa>({ sort: 'nome', expand: 'indicado_por' })
export const updateEmpresa = (id: string, data: Partial<Empresa>) =>
  pb.collection('empresas').update<Empresa>(id, data)
export const createEmpresa = (data: Partial<Empresa>) =>
  pb.collection('empresas').create<Empresa>(data)

// ---------- Patrimônio (relação geral: patrimônio → empresa/setor/contrato) ----------
export const getEquipamentosPatrimonio = () =>
  pb.collection('equipamentos').getFullList<Equipamento>({
    sort: 'patrimonio',
    expand: 'empresa,contrato',
  })

// ---------- Contratos ----------
export const getContratos = () =>
  pb.collection('contratos').getFullList<Contrato>({
    sort: '-ativo',
    expand: 'empresa',
  })
export const updateContrato = (id: string, data: Partial<Contrato>) =>
  pb.collection('contratos').update<Contrato>(id, data)

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

export const getHistorico = async (equipamento: string, competencia: string) => {
  const lista = await pb.collection('leituras').getList<Leitura>(1, 6, {
    filter: `equipamento = "${equipamento}" && competencia != "${competencia}"`,
    sort: '-created',
  })
  return lista.items
}

export const pbExport = pb

export const getLeiturasAll = () =>
  pb.collection('leituras').getFullList<Leitura>({ sort: '-created' })

export const updateEquipamento = (id: string, data: Partial<Equipamento>) =>
  pb.collection('equipamentos').update<Equipamento>(id, data)
export const createEquipamento = (data: Record<string, unknown>) =>
  pb.collection('equipamentos').create<Equipamento>(data)
export const deleteEquipamento = (id: string) => pb.collection('equipamentos').delete(id)
export const getEquipamentosEmpresa = (empresaId: string) =>
  pb.collection('equipamentos').getFullList<Equipamento>({
    filter: `empresa = "${empresaId}"`,
    sort: 'patrimonio',
  })
export const getEquipamentosAllTipos = (empresaId: string) =>
  pb.collection('equipamentos').getFullList<Equipamento>({
    filter: `empresa = "${empresaId}" && ativo = true`,
    sort: 'tipo,patrimonio',
  })

export interface Fechamento {
  id: string
  contrato: string
  empresa: string
  competencia: string
  paginas_consumidas: number
  paginas_excedentes: number
  vlr_impressoras: number
  vlr_excedentes: number
  vlr_dispositivos: number
  vlr_servidores: number
  vlr_servicos: number
  desconto: number
  total: number
  tipo_documento: 'recibo' | 'fatura' | ''
  data_emissao: string
  data_vencimento: string
  status: string
  pdf: string
  observacoes: string
  forma_pgto: string
  mostrar_periodo: boolean
  desconto_percentual: number
  desconto_valor: number
  valor_final: number
  periodo_de: string
  periodo_ate: string
}

export const createFechamento = (data: Record<string, unknown>) =>
  pb.collection('fechamentos').create<Fechamento>(data)
export const getFechamentos = (competencia: string) =>
  pb.collection('fechamentos').getFullList<Fechamento>({
    filter: `competencia = "${competencia}"`,
    expand: 'empresa,contrato',
  })

export const createServico = (data: Record<string, unknown>) =>
  pb.collection('servicos').create(data)
export const getServicos = () =>
  pb.collection('servicos').getFullList({ sort: '-created', expand: 'empresa' })

export const getFechamentosAll = () =>
  pb.collection('fechamentos').getFullList<Fechamento>({
    sort: '-competencia',
    expand: 'empresa',
  })

export const getFechamentosContrato = (contratoId: string) =>
  pb.collection('fechamentos').getFullList<Fechamento>({
    filter: `contrato = "${contratoId}"`,
    sort: '-competencia',
  })

export const brl = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ---------- AGENDA + ORDENS DE SERVIÇO (módulos novos, pedido dela 22/10) ----------
export interface AgendaItem {
  id: string
  empresa: string
  titulo: string
  tipo: 'visita_tecnica' | 'entrega_instalacao' | 'comercial' | 'outro'
  data: string
  hora: string
  duracao_min: number
  responsavel: 'luiz' | 'juliana' | 'ambos' | ''
  endereco: string
  descricao: string
  status: 'agendado' | 'realizado' | 'cancelado'
  os_gerada: boolean
  expand?: { empresa?: Empresa }
}

export const getAgenda = () =>
  pb.collection('agenda').getFullList<AgendaItem>({ sort: 'data', expand: 'empresa' })
export const createAgenda = (data: Record<string, unknown>) =>
  pb.collection('agenda').create<AgendaItem>(data)
export const updateAgenda = (id: string, data: Record<string, unknown>) =>
  pb.collection('agenda').update<AgendaItem>(id, data)

export interface OrdemServico {
  id: string
  numero: string
  empresa: string
  agenda: string
  tipo: 'manutencao' | 'instalacao' | 'entrega' | 'visita_tecnica' | 'outro'
  data: string
  descricao: string
  tecnico: string
  valor_pecas: number
  valor_servico: number
  valor_total: number
  gerar_cobranca: boolean
  cobranca_gerada: boolean
  servico_id: string
  data_vencimento: string
  status: 'aberta' | 'aguardando_assinatura' | 'assinada' | 'faturada' | 'cancelada'
  assinatura_nome: string
  assinatura_cargo: string
  assinatura_imagem: string
  assinado_em: string
  expand?: { empresa?: Empresa }
}

export const getOrdens = () =>
  pb.collection('ordens_servico').getFullList<OrdemServico>({ sort: '-created', expand: 'empresa' })
export const createOrdem = (data: Record<string, unknown>) =>
  pb.collection('ordens_servico').create<OrdemServico>(data)
export const updateOrdem = (id: string, data: Record<string, unknown>) =>
  pb.collection('ordens_servico').update<OrdemServico>(id, data)
