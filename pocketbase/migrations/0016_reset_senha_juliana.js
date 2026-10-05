/// <reference path="../pb_data/types.d.ts" />
// 0016 — reset da senha da Juliana p/ provisória (ela vai trocar depois)
migrate(
  (app) => {
    try {
      const jul = app.findAuthRecordByEmail('_pb_users_auth_', 'julianacrc@icloud.com')
      jul.setPassword('Trocar@2026')
      jul.set('perfil', 'admin')
      app.save(jul)
    } catch (_) {}
  },
  (app) => {},
)
