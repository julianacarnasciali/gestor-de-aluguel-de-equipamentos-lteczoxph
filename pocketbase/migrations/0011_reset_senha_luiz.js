/// <reference path="../pb_data/types.d.ts" />
// 0011 — reset da senha do Luiz p/ provisória (eles trocam de novo no final)
migrate(
  (app) => {
    try {
      const luiz = app.findAuthRecordByEmail('_pb_users_auth_', 'lcca.informatica@gmail.com')
      luiz.setPassword('Trocar@2026')
      app.save(luiz)
    } catch (_) {}
  },
  (app) => {},
)
