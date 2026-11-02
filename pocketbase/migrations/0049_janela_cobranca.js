/// <reference path="../pb_data/types.d.ts" />
// 0049 — Janela de segurança antes de gerar boleto / NFS-e (pedido 02/11/2026)
//
// Por que existe: hoje o boleto e a NFS-e saem NO INSTANTE em que o fechamento
// ou o serviço avulso é criado. Se o lançamento estava errado — ou se era só um
// teste — o documento fiscal já foi emitido e o e-mail já foi para o cliente.
// Aconteceu com a MID HOME em 02/11: voltar o status para "emitido" disparou o
// e-mail de fechamento para a cliente sem precisar.
//
// A partir daqui o registro nasce em "aguardando". Um cron de 5 em 5 minutos
// processa o que já passou da janela. Dentro da janela dá para corrigir o
// lançamento ou cancelar — e nada é gerado, nem no Asaas nem na prefeitura.
//
// Campos (nas duas coleções: fechamentos e servicos):
//   cobranca_agendada_em  = quando o registro entrou na fila
//   cobranca_processar_em = quando pode gerar (agendada + janela)
//   cobranca_status       = aguardando | gerando | gerada | cancelada | erro
//   cobranca_erro         = motivo, quando cobranca_status = erro
//
// O tamanho da janela fica em config.janela_cobranca_minutos (padrão 60).
migrate(
  (app) => {
    for (const nome of ['fechamentos', 'servicos']) {
      const col = app.findCollectionByNameOrId(nome)

      // getByName devolve null (não lança) — padrão desde o bug da 0031.
      if (!col.fields.getByName('cobranca_agendada_em')) {
        col.fields.add(
          new DateField({ name: 'cobranca_agendada_em', required: false, presentable: false }),
        )
      }
      if (!col.fields.getByName('cobranca_processar_em')) {
        col.fields.add(
          new DateField({ name: 'cobranca_processar_em', required: false, presentable: false }),
        )
      }
      if (!col.fields.getByName('cobranca_status')) {
        col.fields.add(
          new SelectField({
            name: 'cobranca_status',
            required: false,
            presentable: false,
            maxSelect: 1,
            values: ['aguardando', 'gerando', 'gerada', 'cancelada', 'erro'],
          }),
        )
      }
      if (!col.fields.getByName('cobranca_erro')) {
        col.fields.add(
          new TextField({ name: 'cobranca_erro', required: false, max: 500, presentable: false }),
        )
      }
      if (!col.fields.getByName('tentativas_cobranca')) {
        col.fields.add(
          new NumberField({
            name: 'tentativas_cobranca',
            required: false,
            presentable: false,
            onlyInt: true,
            min: 0,
          }),
        )
      }
      if (!col.fields.getByName('cobranca_suspensa')) {
        col.fields.add(
          new BoolField({ name: 'cobranca_suspensa', required: false, presentable: false }),
        )
      }

      // índice para o cron achar rápido o que está vencido
      try {
        col.indexes = col.indexes.concat([
          'CREATE INDEX idx_' +
            nome +
            '_cobranca_fila ON ' +
            nome +
            ' (cobranca_status, cobranca_processar_em)',
        ])
      } catch (_) {}

      app.save(col)
    }

    // janela padrão de 60 minutos, configurável na tela
    try {
      const colCfg = app.findCollectionByNameOrId('config')
      if (!colCfg.fields.getByName('janela_cobranca_minutos')) {
        colCfg.fields.add(
          new NumberField({
            name: 'janela_cobranca_minutos',
            required: false,
            presentable: false,
            onlyInt: true,
            min: 0,
          }),
        )
        app.save(colCfg)
      }
      const lista = app.findRecordsByFilter('config', 'id != ""', '', 1, 0)
      if (lista.length > 0) {
        const cfg = lista[0]
        if (!cfg.get('janela_cobranca_minutos')) {
          cfg.set('janela_cobranca_minutos', 60)
          app.save(cfg)
        }
      }
    } catch (err) {
      console.warn('[0049] nao consegui gravar a janela na config', err)
    }
  },
  (app) => {
    for (const nome of ['fechamentos', 'servicos']) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        for (const campo of [
          'cobranca_agendada_em',
          'cobranca_processar_em',
          'cobranca_status',
          'cobranca_erro',
          'tentativas_cobranca',
          'cobranca_suspensa',
        ]) {
          const f = col.fields.getByName(campo)
          if (f) col.fields.removeById(f.id)
        }
        app.save(col)
      } catch (_) {}
    }
  },
)
