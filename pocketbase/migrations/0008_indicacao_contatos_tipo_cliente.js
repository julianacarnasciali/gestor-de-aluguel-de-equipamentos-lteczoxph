/// <reference path="../pb_data/types.d.ts" />
// 0008 — indicação (quem indicou / indicados), contatos extras (nome+setor), tipo de cliente
// e tipos de equipamento expandidos (impressora, computador, monitor, servidor, câmera,
// central telefônica, sistema/serviço, outros)
migrate(
  (app) => {
    // ---- empresas: novo campo tipo_cliente ----
    const emp = app.findCollectionByNameOrId('empresas')
    if (!emp.fields.getByName('tipo_cliente')) {
      emp.fields.add(
        new SelectField({
          name: 'tipo_cliente',
          maxSelect: 1,
          values: ['contrato', 'avulso'],
        }),
      )
    }
    app.save(emp)

    // ---- empresas: contatos adicionais (JSON: [{nome, setor, email}]) ----
    if (!emp.fields.getByName('contatos')) {
      emp.fields.add(new JSONField({ name: 'contatos', maxSize: 4000000 }))
    }
    app.save(emp)

    // ---- empresas: quem indicou (relation p/ própria empresas) ----
    if (!emp.fields.getByName('indicado_por')) {
      emp.fields.add(
        new RelationField({
          name: 'indicado_por',
          collectionId: emp.id,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    app.save(emp)

    // ---- equipamentos: tipo expandido ----
    const eq = app.findCollectionByNameOrId('equipamentos')
    const campoTipo = eq.fields.getByName('tipo')
    if (campoTipo && 'values' in campoTipo) {
      campoTipo.values = [
        'impressora',
        'computador',
        'monitor',
        'servidor',
        'camera',
        'central_telefonica',
        'sistema_servico',
        'outros',
      ]
    }
    app.save(eq)
  },
  (app) => {
    try {
      const eq = app.findCollectionByNameOrId('equipamentos')
      const campoTipo = eq.fields.getByName('tipo')
      if (campoTipo && 'values' in campoTipo) {
        campoTipo.values = ['impressora', 'dispositivo', 'servidor']
        app.save(eq)
      }
    } catch (_) {}
    try {
      const emp = app.findCollectionByNameOrId('empresas')
      for (const f of ['tipo_cliente', 'contatos', 'indicado_por']) {
        if (emp.fields.getByName(f)) emp.fields.removeByName(f)
      }
      app.save(emp)
    } catch (_) {}
  },
)
