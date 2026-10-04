/// <reference path="../pb_data/types.d.ts" />
// 0012 — troca de hardware: flag na máquina + origem da leitura
// regras: leitura manual SÓ técnico master; Juliana = admin (vê tudo, não lança manual)
migrate(
  (app) => {
    const eq = app.findCollectionByNameOrId('equipamentos')
    if (!eq.fields.getByName('contador_manual')) {
      eq.fields.add(new BoolField({ name: 'contador_manual' }))
    }
    if (!eq.fields.getByName('substituido_em')) {
      eq.fields.add(new DateField({ name: 'substituido_em' }))
    }
    app.save(eq)

    const leit = app.findCollectionByNameOrId('leituras')
    if (!leit.fields.getByName('origem')) {
      leit.fields.add(
        new SelectField({
          name: 'origem',
          maxSelect: 1,
          values: ['contador', 'manual', 'media'],
        }),
      )
    }
    // leitura manual: só usuário com perfil tecnico_master
    leit.createRule =
      '@request.auth.id != "" && (@request.body.origem != "manual" || @request.auth.perfil = "tecnico_master")'
    leit.updateRule =
      '@request.auth.id != "" && (origem != "manual" || @request.auth.perfil = "tecnico_master")'
    leit.deleteRule =
      '@request.auth.id != "" && (origem != "manual" || @request.auth.perfil = "tecnico_master")'
    app.save(leit)

    // Juliana = admin
    try {
      const jul = app.findAuthRecordByEmail('_pb_users_auth_', 'julianacrc@icloud.com')
      jul.set('perfil', 'admin')
      app.save(jul)
    } catch (_) {}
  },
  (app) => {},
)
