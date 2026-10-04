/// <reference path="../pb_data/types.d.ts" />
// 0001 — Modelo de dados do Gestor de Aluguel de Equipamentos (LCCA/LCA)
// Collections: empresas, contratos, equipamentos, leituras, fechamentos, documentos, config
migrate(
  (app) => {
    const RULE_AUTH = "@request.auth.id != ''"

    // ---------- EMPRESAS (clientes) ----------
    app.save(
      new Collection({
        name: 'empresas',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          { name: 'nome', type: 'text', required: true, max: 200 },
          { name: 'cnpj_cpf', type: 'text', max: 25 },
          { name: 'telefone', type: 'text', max: 30 },
          { name: 'email', type: 'text', max: 200 },
          { name: 'endereco', type: 'text', max: 300 },
          { name: 'grupo', type: 'text', max: 120 }, // ex.: "Nado Livre" (mesmo grupo, várias sedes)
          { name: 'unidade', type: 'text', max: 120 }, // ex.: "Pinheiros", "Mercês"
          { name: 'responsavel_email', type: 'email' }, // destino do e-mail do fechamento
          { name: 'responsavel_nome', type: 'text', max: 120 },
          { name: 'ativo', type: 'bool' },
          { name: 'observacoes', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_empresas_nome ON empresas (nome)'],
      }),
    )

    const empresasId = app.findCollectionByNameOrId('empresas').id

    // ---------- CONTRATOS ----------
    app.save(
      new Collection({
        name: 'contratos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'empresa',
            type: 'relation',
            required: true,
            collectionId: empresasId,
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'ativo', type: 'bool' },
          // cobrança
          { name: 'mensalidade', type: 'number' }, // locação de impressoras
          { name: 'paginas_contratadas', type: 'number', onlyInt: true }, // franquia
          { name: 'preco_excedente', type: 'number' }, // R$ por página excedente
          { name: 'vlr_dispositivos', type: 'number' }, // comodato
          { name: 'vlr_servidores', type: 'number' },
          { name: 'vlr_servicos', type: 'number' }, // serviços avulsos recorrentes
          // tipo de cobrança
          { name: 'tipo_cobranca', type: 'select', values: ['leitura', 'media'], maxSelect: 1 }, // leitura real x média fixa (AMR/HIDROFIT)
          { name: 'paginas_media', type: 'number', onlyInt: true }, // quando tipo_cobranca = media
          {
            name: 'tipo_excedente',
            type: 'select',
            values: ['total', 'por_maquina'],
            maxSelect: 1,
          }, // franquia no total do contrato (padrão antigo) ou por máquina
          // datas e reajuste
          { name: 'dia_leitura', type: 'number', onlyInt: true },
          { name: 'dia_vencimento', type: 'number', onlyInt: true },
          { name: 'reajuste_mes', type: 'text', max: 7 }, // MM/YYYY
          { name: 'reajuste_percentual', type: 'number' },
          { name: 'mes_ini', type: 'text', max: 7 },
          { name: 'mes_fim', type: 'text', max: 7 },
          // controle
          { name: 'numero', type: 'text', max: 20 }, // nº do contrato no sistema antigo (histórico)
          { name: 'observacoes', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_contratos_empresa ON contratos (empresa)'],
      }),
    )

    const contratosId = app.findCollectionByNameOrId('contratos').id

    // ---------- EQUIPAMENTOS (impressoras, dispositivos, servidores) ----------
    app.save(
      new Collection({
        name: 'equipamentos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['impressora', 'dispositivo', 'servidor'],
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: true,
            collectionId: empresasId,
            maxSelect: 1,
          },
          { name: 'contrato', type: 'relation', collectionId: contratosId, maxSelect: 1 },
          { name: 'patrimonio', type: 'text', max: 60 }, // ex.: LCCA0036
          { name: 'marca_modelo', type: 'text', max: 120 },
          { name: 'numero_serie', type: 'text', max: 60 },
          { name: 'setor', type: 'text', max: 120 },
          { name: 'ip', type: 'text', max: 40 },
          { name: 'descricao', type: 'text', max: 300 }, // ex.: "Dell 7010 LCC070 SUELI"
          { name: 'ativo', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_equipamentos_empresa ON equipamentos (empresa)',
          'CREATE INDEX idx_equipamentos_patrimonio ON equipamentos (patrimonio)',
        ],
      }),
    )

    const equipamentosId = app.findCollectionByNameOrId('equipamentos').id

    // ---------- LEITURAS (contadores mensais) ----------
    app.save(
      new Collection({
        name: 'leituras',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'equipamento',
            type: 'relation',
            required: true,
            collectionId: equipamentosId,
            maxSelect: 1,
          },
          { name: 'contrato', type: 'relation', collectionId: contratosId, maxSelect: 1 },
          { name: 'competencia', type: 'text', required: true, max: 7 }, // MM/YYYY
          { name: 'leitura_anterior', type: 'number', onlyInt: true },
          { name: 'leitura_atual', type: 'number', onlyInt: true },
          { name: 'paginas_mes', type: 'number', onlyInt: true }, // leitura_atual - leitura_anterior
          {
            name: 'arquivo',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
          }, // relatório do equipamento
          { name: 'observacoes', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_leituras_unica ON leituras (equipamento, competencia)'],
      }),
    )

    const leiturasId = app.findCollectionByNameOrId('leituras').id

    // ---------- FECHAMENTOS (recibo/fatura do mês) ----------
    app.save(
      new Collection({
        name: 'fechamentos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'contrato',
            type: 'relation',
            required: true,
            collectionId: contratosId,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            required: true,
            collectionId: empresasId,
            maxSelect: 1,
          },
          { name: 'competencia', type: 'text', required: true, max: 7 }, // MM/YYYY
          // valores calculados (snapshot no fechamento)
          { name: 'paginas_consumidas', type: 'number', onlyInt: true },
          { name: 'paginas_excedentes', type: 'number', onlyInt: true },
          { name: 'vlr_impressoras', type: 'number' },
          { name: 'vlr_excedentes', type: 'number' },
          { name: 'vlr_dispositivos', type: 'number' },
          { name: 'vlr_servidores', type: 'number' },
          { name: 'vlr_servicos', type: 'number' },
          { name: 'desconto', type: 'number' },
          { name: 'total', type: 'number' },
          // documento
          { name: 'tipo_documento', type: 'select', values: ['documento', 'fatura'], maxSelect: 1 },
          { name: 'data_emissao', type: 'date' },
          { name: 'data_vencimento', type: 'date' },
          {
            name: 'status',
            type: 'select',
            values: ['rascunho', 'emitido', 'enviado', 'pago'],
            maxSelect: 1,
          },
          {
            name: 'pdf',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf'],
          },
          { name: 'observacoes', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_fechamentos_contrato ON fechamentos (contrato, competencia)'],
      }),
    )

    const fechamentosId = app.findCollectionByNameOrId('fechamentos').id

    // ---------- DOCUMENTOS (relatório, boleto, NF anexos ao fechamento) ----------
    app.save(
      new Collection({
        name: 'documentos',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          {
            name: 'fechamento',
            type: 'relation',
            required: true,
            collectionId: fechamentosId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['relatorio', 'boleto', 'nfse', 'recibo'],
            maxSelect: 1,
          },
          {
            name: 'arquivo',
            type: 'file',
            required: true,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf'],
          },
          { name: 'numero', type: 'text', max: 40 }, // nº da NF, linha do boleto, etc.
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_documentos_fechamento ON documentos (fechamento)'],
      }),
    )

    // ---------- CONFIG (dados da empresa emissora — 1 linha) ----------
    app.save(
      new Collection({
        name: 'config',
        type: 'base',
        listRule: RULE_AUTH,
        viewRule: RULE_AUTH,
        createRule: RULE_AUTH,
        updateRule: RULE_AUTH,
        deleteRule: RULE_AUTH,
        fields: [
          { name: 'razao_social', type: 'text', max: 200 },
          { name: 'nome_fantasia', type: 'text', max: 120 },
          { name: 'cnpj', type: 'text', max: 25 },
          { name: 'endereco', type: 'text', max: 300 },
          { name: 'cidade_uf', type: 'text', max: 80 },
          { name: 'telefone', type: 'text', max: 30 },
          { name: 'email', type: 'email' },
          { name: 'rodape_legal', type: 'text' }, // texto legal configurável por tipo de documento
          {
            name: 'logo',
            type: 'file',
            maxSelect: 1,
            maxSize: 2097152,
            mimeTypes: ['image/png', 'image/jpeg'],
          },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )
  },
  (app) => {
    for (const name of [
      'config',
      'documentos',
      'fechamentos',
      'leituras',
      'equipamentos',
      'contratos',
      'empresas',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
