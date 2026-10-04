/// <reference path="../pb_data/types.d.ts" />
// 0010 — perfil técnico master (Luiz) + reset da senha da Juliana p/ provisória
migrate(
  (app) => {
    // 1) campo perfil no users
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('perfil')) {
      users.fields.add(
        new SelectField({
          name: 'perfil',
          maxSelect: 1,
          values: ['admin', 'tecnico_master', 'operador'],
        }),
      )
    }
    app.save(users)

    // 2) Luiz = técnico master
    try {
      const luiz = app.findAuthRecordByEmail('_pb_users_auth_', 'lcca.informatica@gmail.com')
      luiz.set('perfil', 'tecnico_master')
      app.save(luiz)
    } catch (_) {}

    // 3) reset da senha da Juliana p/ Trocar@2026 (ela pediu p/ eu testar)
    try {
      const jul = app.findAuthRecordByEmail('_pb_users_auth_', 'julianacrc@icloud.com')
      jul.setPassword('Trocar@2026')
      app.save(jul)
    } catch (_) {}
  },
  (app) => {},
)
