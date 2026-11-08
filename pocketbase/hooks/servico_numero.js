// NÚMERO do serviço avulso — gerado no SERVIDOR (08/11/2026)
//
// Pedido da Juliana: o relatório do serviço avulso saía sem numeração (mostrava
// o ID do banco, `cp7k73ln6w43nrc`). A partir daqui todo serviço ganha um
// número no formato `SA 2026/0001`.
//
// POR QUE NO SERVIDOR E NÃO NA TELA: a tela não sabe o que a outra pessoa está
// criando ao mesmo tempo. Se ela lança um serviço no escritório enquanto o Luiz
// lança outro na rua, as duas telas calculariam "0004" e sairiam dois
// documentos com o mesmo número. Aqui a conta é feita no banco, uma de cada vez.
//
// MODEL HOOK (onRecordCreate) e não BeforeCreateRequest: o request hook só
// pega criação pela API HTTP, e existem serviços criados internamente (o
// os_cobrar.js cria um `servicos` quando a OS vira cobrança). O model hook roda
// em qualquer $app.save(), venha de onde vier.
//
// O índice UNIQUE (migração 0052) é a rede de segurança: no pior caso de dois
// lançamentos no mesmo instante o segundo falha com erro claro em vez de gravar
// documento repetido — e ela simplesmente clica de novo.
onRecordCreate((e) => {
  try {
    const rec = e.record
    if (rec.collection().name !== 'servicos') {
      e.next()
      return
    }

    // já veio numerado (importação/recuperação de backup): respeita
    if (String(rec.getString('numero') || '').trim() !== '') {
      e.next()
      return
    }

    // o ano do número é o do SERVIÇO, não o de hoje: um serviço prestado em
    // 30/12 e lançado em 02/01 pertence ao ano anterior.
    const ref = String(rec.getString('data_servico') || '')
    const hoje = new Date()
    const anoRef = Number(ref.slice(0, 4))
    const ano = anoRef > 2000 && anoRef < 3000 ? anoRef : hoje.getFullYear()

    let maior = 0
    try {
      // prefixo fixo e zero à esquerda => ordem alfabética = ordem numérica
      const ultimos = $app.findRecordsByFilter(
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
    } catch (err) {
      console.warn('[servico-numero] falha ao buscar o ultimo numero', err)
    }

    const numero = 'SA ' + ano + '/' + String(maior + 1).padStart(4, '0')
    rec.set('numero', numero)
    console.log('[servico-numero] servico', rec.id, 'recebeu', numero)
  } catch (err) {
    // nunca derrubar a criação do serviço por causa da numeração: sem número é
    // ruim, serviço não criado (e cliente sem boleto) é pior.
    console.warn('[servico-numero] erro ao numerar', err)
  }
  e.next()
}, 'servicos')
