/// <reference path="../pb_data/types.d.ts" />
// 0007 — emite_nf por empresa + usuários (Juliana, Luiz) + config da empresa emissora
migrate(
  (app) => {
    // 1) campo emite_nf em empresas
    const emp = app.findCollectionByNameOrId('empresas')
    if (!emp.fields.getByName('emite_nf')) {
      emp.fields.add(new BoolField({ name: 'emite_nf' }))
    }
    app.save(emp)

    // 2) usuários
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const seedUser = (email, nome) => {
      try {
        app.findAuthRecordByEmail('_pb_users_auth_', email)
        return
      } catch (_) {}
      const rec = new Record(users)
      rec.setEmail(email)
      rec.setPassword('Trocar@2026')
      rec.setVerified(true)
      rec.set('name', nome)
      app.save(rec)
    }
    seedUser('julianacrc@icloud.com', 'Juliana Carnasciali')
    seedUser('lcca.informatica@gmail.com', 'Luiz Carlos Carnasciali')

    // 3) config (1 linha, idempotente)
    try {
      app.findFirstRecordByData('config', 'cnpj', '07.667.971/0001-39')
      return
    } catch (_) {}
    const cfg = new Record(app.findCollectionByNameOrId('config'))
    cfg.set('razao_social', 'L.C.C.A Informática LTDA')
    cfg.set('nome_fantasia', 'LCA Tecnologia')
    cfg.set('cnpj', '07.667.971/0001-39')
    cfg.set('endereco', 'Rua Paschoal Bordignon, Nº 150-42F, Jardim Botânico')
    cfg.set('cidade_uf', 'Curitiba/PR')
    cfg.set('telefone', '(41) 9 98406-4557')
    cfg.set('email', 'lcca.informatica@gmail.com')
    cfg.set(
      'rodape_legal',
      'RECIBO DE LOCAÇÃO DE BENS MÓVEIS — NÃO INCIDÊNCIA DE ISS (SÚMULA VINCULANTE 31/STF). NÃO SUJEITO À RETENÇÃO DE PIS/COFINS/CSLL — PRESTADOR OPTANTE PELO SIMPLES NACIONAL (LC 123/2006, ART. 12; IN RFB 459/2004, ART. 3º, II).',
    )
    app.save(cfg)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'julianacrc@icloud.com'))
    } catch (_) {}
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'lcca.informatica@gmail.com'))
    } catch (_) {}
    try {
      const emp = app.findCollectionByNameOrId('empresas')
      if (emp.fields.getByName('emite_nf')) {
        emp.fields.removeByName('emite_nf')
        app.save(emp)
      }
    } catch (_) {}
  },
)
