/// <reference path="../pb_data/types.d.ts" />
// 0052 — NÚMERO do serviço avulso (pedido da Juliana, 08/11/2026)
//
// Pedido dela: "eu gerei uma ordem de serviço avulsa. Ele gerou o relatório bem
// bonitinho, porém está sem numeração, e eu acredito que seria bacana ter uma
// numeração nas ordens de serviço."
//
// O QUE ESTAVA ACONTECENDO: a coleção `servicos` não tinha campo de número, e o
// relatório arquivado (email_servico.js) imprimia `rec.id` — o ID do banco, tipo
// `cp7k73ln6w43nrc`. Isso não é número de documento: ninguém consegue ditar
// isso ao telefone nem procurar por ele.
//
// FORMATO: `SA 2026/0001` — SA de Serviço Avulso, ano e sequência de 4 dígitos,
// zerada à esquerda para ordenar certo como texto. Escolhido por ela: por ora a
// numeração vale SÓ para o serviço avulso (a OS de visita técnica fica para
// depois, quando ela pedir).
//
// A numeração é feita no hook `servico_numero.js` (servidor), não na tela: se
// dois serviços forem criados ao mesmo tempo — ela no escritório, o Luiz na rua
// — a tela não teria como saber um do outro e sairiam dois `0001`.
//
// DUAS ARMADILHAS QUE JÁ MORDERAM (08/11, na primeira tentativa):
//  1. ORDEM. Criar o índice UNIQUE antes do backfill falha: os serviços que já
//     existem ficam com `numero` VAZIO, e no SQLite vários textos vazios são
//     valores iguais entre si — o índice acusa duplicata na hora. Por isso o
//     preenchimento vem PRIMEIRO e o índice DEPOIS.
//  2. ÍNDICE PARCIAL. Mesmo assim o índice tem de ignorar registro sem número
//     (`WHERE numero != ''`): serviço antigo sem número não pode impedir um
//     serviço novo de ser criado. A garantia de "nunca dois 0001" vale só entre
//     os que TÊM número — que é exatamente o que importa.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('servicos')

    // getByName devolve null (não lança) quando o campo não existe — padrão
    // desde o bug da migração 0031, que falhava em silêncio.
    if (!col.fields.getByName('numero')) {
      col.fields.add(new TextField({ name: 'numero', required: false, max: 20 }))
      app.save(col)
    }

    // ---------- 1. backfill dos que já existem (ANTES do índice) ----------
    let pendentes = []
    try {
      pendentes = app.findRecordsByFilter('servicos', 'numero = ""', 'created', 0, 0)
    } catch (err) {
      console.warn('[0052] nao consegui listar servicos', err)
    }

    const proximo = (ano) => {
      // maior número do ano; o formato é fixo (SA AAAA/NNNN), então ordem
      // alfabética = ordem numérica por causa do zero à esquerda.
      let maior = 0
      try {
        const ultimos = app.findRecordsByFilter(
          'servicos',
          'numero ~ "SA ' + ano + '/"',
          '-numero',
          1,
          0,
        )
        if (ultimos.length > 0) {
          const m = String(ultimos[0].getString('numero')).match(/\/(\d+)$/)
          if (m) maior = Number(m[1])
        }
      } catch (_) {}
      return maior + 1
    }

    for (let i = 0; i < pendentes.length; i++) {
      const r = pendentes[i]
      try {
        const ref = String(r.getString('data_servico') || r.getString('created') || '')
        const ano = Number(ref.slice(0, 4)) || new Date().getFullYear()
        const n = proximo(ano)
        r.set('numero', 'SA ' + ano + '/' + String(n).padStart(4, '0'))
        app.save(r)
        console.log('[0052] numerado', r.id, r.getString('numero'), 'ano', ano)
      } catch (err) {
        console.warn('[0052] falha ao numerar', r.id, err)
      }
    }

    // ---------- 2. índice UNIQUE só entre os que têm número ----------
    try {
      col.removeIndex('idx_servicos_numero')
    } catch (_) {}
    col.addIndex('idx_servicos_numero', true, 'numero', 'numero != ""')
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('servicos')
      try {
        col.removeIndex('idx_servicos_numero')
      } catch (_) {}
      const f = col.fields.getByName('numero')
      if (f) col.fields.removeById(f.id)
      app.save(col)
    } catch (_) {}
  },
)
