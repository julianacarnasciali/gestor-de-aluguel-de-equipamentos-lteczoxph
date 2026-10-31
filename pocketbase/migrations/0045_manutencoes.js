/// <reference path="../pb_data/types.d.ts" />
// 0045 — HISTÓRICO DE MANUTENÇÃO por patrimônio (pedido dela 31/10).
//
// Necessidade: consultar, pelo NÚMERO DO PATRIMÔNIO, quanto aquela máquina deu
// de problema, o que foi trocado de peça e o que era só ajuste. É o histórico
// de vida do equipamento — serve para decidir troca, cobrar excedente e
// mostrar ao cliente o que foi feito.
//
// Coleção nova `manutencoes` (registro manual do serviço) — separada de
// `chamados` porque:
//   · chamado = o problema relatado pelo cliente (pode nem virar manutenção);
//   · manutenção = o que o técnico efetivamente fez (ajuste, peça, preventiva).
// A página de histórico une as duas coisas na linha do tempo da máquina.
//
// `patrimonio` fica desnormalizado no registro para a busca funcionar mesmo se
// o equipamento for trocado/desativado depois.
//
// Guard correto: if (!getByName) add — NUNCA try{getByName;return}catch
// (getByName devolve null sem lançar; bug da migração 0031 — ver 0042).
migrate(
  (app) => {
    let existente = null
    try {
      existente = app.findCollectionByNameOrId('manutencoes')
    } catch (_) {}
    if (existente) return

    const idEquip = app.findCollectionByNameOrId('equipamentos').id
    const idEmpresas = app.findCollectionByNameOrId('empresas').id
    let idChamados = ''
    try {
      idChamados = app.findCollectionByNameOrId('chamados').id
    } catch (_) {}

    const campos = [
      { name: 'equipamento', type: 'relation', collectionId: idEquip, maxSelect: 1 },
      { name: 'empresa', type: 'relation', collectionId: idEmpresas, maxSelect: 1 },
      { name: 'patrimonio', type: 'text', max: 60 },
      { name: 'data', type: 'date' },
      {
        name: 'tipo',
        type: 'select',
        maxSelect: 1,
        values: ['ajuste', 'troca_peca', 'preventiva', 'instalacao', 'outro'],
      },
      { name: 'descricao_problema', type: 'text', max: 2000 },
      { name: 'solucao', type: 'text', max: 2000 },
      { name: 'pecas', type: 'text', max: 1000 },
      { name: 'custo_pecas', type: 'number', min: 0 },
      { name: 'tecnico', type: 'text', max: 120 },
      { name: 'numero_os', type: 'text', max: 60 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    if (idChamados) {
      campos.splice(10, 0, {
        name: 'chamado',
        type: 'relation',
        collectionId: idChamados,
        maxSelect: 1,
      })
    }

    app.save(
      new Collection({
        name: 'manutencoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: campos,
        indexes: [
          'CREATE INDEX idx_manutencoes_patrimonio ON manutencoes (patrimonio)',
          'CREATE INDEX idx_manutencoes_equip ON manutencoes (equipamento)',
          'CREATE INDEX idx_manutencoes_data ON manutencoes (data)',
        ],
      }),
    )
    console.log('[0045] colecao manutencoes criada')
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('manutencoes'))
    } catch (_) {}
  },
)
