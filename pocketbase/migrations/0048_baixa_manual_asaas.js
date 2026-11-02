/// <reference path="../pb_data/types.d.ts" />
// 0048 — Baixa manual espelhada no Asaas (pedido 02/11/2026)
//
// Por que existe: o Luiz dá baixa no sistema quando o cliente paga por fora
// (Pix em outra conta da LCCA, dinheiro, etc). O boleto no Asaas continua em
// aberto, aparece como vencido nos relatórios e a conciliação não fecha.
//
// Caso concreto: Jandira Reserva, serviço avulso de R$ 1.320 (pay_vuxumky61c5pjt11),
// pago por Pix em 21/10 numa conta que não é a do Asaas. Baixa dada no sistema,
// boleto em aberto no Asaas até hoje.
//
// Estes três campos registram no próprio lançamento que a baixa foi espelhada,
// para não repetir a chamada e para auditar depois:
//   asaas_baixa_dinheiro = true quando a baixa foi feita pelo botão
//   asaas_baixa_em       = quando foi espelhada (timestamp)
//   asaas_status         = último status que o Asaas devolveu para a cobrança
migrate(
  (app) => {
    for (const nome of ['fechamentos', 'servicos']) {
      const col = app.findCollectionByNameOrId(nome)

      // getByName devolve null (não lança) — padrão adotado desde o bug da 0031.
      if (!col.fields.getByName('asaas_baixa_dinheiro')) {
        col.fields.add(
          new BoolField({ name: 'asaas_baixa_dinheiro', required: false, presentable: false }),
        )
      }
      if (!col.fields.getByName('asaas_baixa_em')) {
        col.fields.add(
          new DateField({ name: 'asaas_baixa_em', required: false, presentable: false }),
        )
      }
      if (!col.fields.getByName('asaas_status')) {
        col.fields.add(
          new TextField({ name: 'asaas_status', required: false, max: 40, presentable: false }),
        )
      }

      app.save(col)
    }
  },
  (app) => {
    for (const nome of ['fechamentos', 'servicos']) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        for (const campo of ['asaas_baixa_dinheiro', 'asaas_baixa_em', 'asaas_status']) {
          const f = col.fields.getByName(campo)
          if (f) col.fields.removeById(f.id)
        }
        app.save(col)
      } catch (_) {}
    }
  },
)
