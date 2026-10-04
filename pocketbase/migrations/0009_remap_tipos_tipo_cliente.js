/// <reference path="../pb_data/types.d.ts" />
// 0009 — remapeia tipos antigos p/ a nova lista e preenche tipo_cliente
migrate(
  (app) => {
    const validos = new Set([
      'impressora',
      'computador',
      'monitor',
      'servidor',
      'camera',
      'central_telefonica',
      'sistema_servico',
      'outros',
    ])
    const eqs = app.findRecordsByFilter('equipamentos', 'id != ""', '', 500, 0)
    for (const r of eqs) {
      const t = r.getString('tipo')
      if (!validos.has(t)) {
        r.set('tipo', 'outros')
        app.save(r)
      }
    }

    // tipo_cliente: 'contrato' p/ quem tem contrato ativo
    const contratos = app.findRecordsByFilter('contratos', 'ativo = true', '', 500, 0)
    const comContrato = new Set(contratos.map((c) => c.getString('empresa')))
    for (const id of comContrato) {
      try {
        const e = app.findRecordById('empresas', id)
        if (!e.getString('tipo_cliente')) {
          e.set('tipo_cliente', 'contrato')
          app.save(e)
        }
      } catch (_) {}
    }
  },
  (app) => {},
)
