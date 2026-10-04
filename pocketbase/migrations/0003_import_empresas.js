/// <reference path="../pb_data/types.d.ts" />
// 0003 — Importação: empresas
migrate(
  (app) => {
    const eid = (p, nn) => p + String(nn).padStart(14, '0')
    const col = app.findCollectionByNameOrId('empresas')
    const EMP = [
      [
        17,
        'GDS FIGO2',
        '000.000.000/0001-00',
        '(00) 0 0000-0000',
        'gds_figo@gmail.com',
        'RUA EMILIANO PERNETA,390 - CONJ 1701 ANDAR 17 COND NEW CONCEPT ED BLOCO A - CENTRO- CURITIBA-PR',
        '',
        '',
        0,
      ],
      [
        18,
        'Clinica Copec',
        '07.755.110/0001-02',
        '(41) 9 9597-2376',
        'copec_adm@hotmail.com',
        'Av. Silva Jardim, 2042 - 14º andar - Rebouças, Curitiba - PR, 80250-200',
        '',
        '',
        0,
      ],
      [
        19,
        'JANDIRA RESERVA LTDA',
        '56.986.855/0001-98',
        '(41) 9642-0222',
        'FINANCEIRO@JANDIRA.COM',
        'R RIO AZUL 247',
        '',
        '',
        1,
      ],
      [20, 'MAXIGRAFICA', '', '', '', '', '', '', 1],
      [
        21,
        'MARCOL Informatica',
        '02.566.885/0001-16',
        '',
        'adriana@marcol.com.br',
        'Av. Brasília, 5964 loja 06',
        '',
        '',
        1,
      ],
      [
        22,
        'Jandira Comércio de Produtos Alimentícios Ltda',
        '78.565.389/0001-00',
        '',
        '',
        'Rua Rio Azul, 247   Bairro: Emiliano Perneta cep 83.325-110 Pinhais Paraná',
        '',
        '',
        1,
      ],
      [23, 'VRM', '', '', '', '', '', '', 0],
      [
        24,
        'Olimpica academia',
        '00624530000100',
        '(41) 9 9971-8278',
        '',
        'Rua Vereador Antônio Carnasciali, 1260 cep 81670-420',
        '',
        '',
        1,
      ],
      [
        25,
        'Demo do Brasil ind. plástico imp. exp.',
        '14.795.364/0001-10',
        '',
        'nfe@safe-demo.com',
        'antonio jose dias pires  200',
        '',
        '',
        1,
      ],
      [
        26,
        'HELP OPERATIONAL ACTIVITIES SOLUCOES EMPRESARIAIS LTDA',
        '47.709.727/0001-06',
        '(41) 9 9989-3163',
        'OPERATION.HELP@GMAIL.COM',
        'R PAULINA PEREIRA DA LUZ SOBRINHO',
        '',
        '',
        0,
      ],
      [
        28,
        'Academia AMR',
        '04290728000156',
        '(41) 9 1146-768',
        '',
        'R. Reinaldino Schaffenberg de Quadros, 750',
        '',
        '',
        1,
      ],
      [
        29,
        'ACADEMIS HIDROFIT',
        '114523670001-62',
        '(41) 9 9883-1991',
        '',
        'Rua Marechal Otávio Saldanha Mazza, 7500',
        '',
        '',
        1,
      ],
      [30, 'MID HOME', '20892181000115', '', '', 'Av. Visc. de Guarapuava, 2764', 'MID', '', 1],
      [31, 'MID WORK', '20892181000115', '', '', 'Av. Visc. de Guarapuava, 2764', 'MID', '', 1],
      [32, 'CLINICA SANTORINI', '33483284000173', '', '', 'R. Euclides da Cunha, 610', '', '', 1],
      [33, 'Ares', '30296654000175', '', '', '', '', '', 1],
      [34, 'Avante', '50017084000144', '', '', '', '', '', 1],
      [35, 'Dna hilda', '73205528000170', '', '', '', '', '', 0],
      [
        36,
        'FISCHER ASSESSORIA CONTABIL LTDA',
        '77.062.941/0001-84',
        '(41) 9 9861-0109',
        'fischercontabilidade@fischercontabilidade.com.br',
        'av.cel.francisco heraclito dos santos nº640',
        '',
        '',
        0,
      ],
      [
        40,
        'NL pinheiros Centro de Natação Nado Livre Eireli ME',
        '80.376.155/0001-66',
        '',
        '',
        'Rua Nicolau José Gravina 1948',
        'Nado Livre',
        'Pinheiros',
        1,
      ],
      [
        41,
        'NL_Merces Nado Esportivo Academia de Natação Eireli',
        '32.696.182/0001-73',
        '',
        '',
        'Rua Antônio Grade,  563',
        'Nado Livre',
        'Mercês',
        1,
      ],
      [
        42,
        'Elise Zimmermann Mathias',
        'CPF 026.997.119-00',
        '',
        '',
        'Rua Silva Jardim, 2042 -  14 andar',
        '',
        '',
        1,
      ],
    ]
    for (const r of EMP) {
      const rec = new Record(col)
      rec.set('id', eid('e', r[0]))
      rec.set('id_legado', r[0])
      rec.set('nome', r[1])
      rec.set('cnpj_cpf', r[2])
      rec.set('telefone', r[3])
      rec.set('email', r[4])
      rec.set('endereco', r[5])
      rec.set('grupo', r[6])
      rec.set('unidade', r[7])
      rec.set('ativo', r[8] === 1)
      app.save(rec)
    }
  },
  (app) => {
    try {
      app.truncateCollection(app.findCollectionByNameOrId('empresas'))
    } catch (_) {}
  },
)
