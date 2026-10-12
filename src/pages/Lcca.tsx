// Landing page pública da LCCA Tech — sem login (rota pública no App.tsx).
// Captura de leads: POST /backend/v1/leads (grava no banco + notifica por e-mail).
// Fotos genéricas (banco de imagens) — trocar pelas reais quando tivermos.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'

const CSS = `
.lc-root{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#1F2937;background:#fff;line-height:1.6}
.lc-root .lc-container{max-width:1120px;margin:0 auto;padding:0 24px}
.lc-root section{padding:72px 0}
.lc-root h2{font-size:clamp(1.5rem,3vw,2.1rem);color:#0F2A43;margin-bottom:8px}
.lc-root .lc-kicker{color:#0D9488;font-weight:700;letter-spacing:2px;font-size:.8rem;text-transform:uppercase}
.lc-root .lc-sub{color:#64748B;max-width:640px;margin-bottom:40px}
.lc-hero{background:linear-gradient(rgba(15,42,67,.88),rgba(15,42,67,.88)),url('https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&q=80') center/cover;color:#fff;padding:100px 0 80px}
.lc-hero h1{font-size:clamp(1.9rem,4.5vw,3rem);line-height:1.15;max-width:760px}
.lc-hero h1 em{font-style:normal;color:#7DE0D3}
.lc-hero p{max-width:640px;margin:20px 0 34px;font-size:1.1rem;color:#D7E3EC}
.lc-btn{display:inline-block;background:#0D9488;color:#fff!important;padding:15px 30px;border-radius:10px;font-weight:700;text-decoration:none;border:none;cursor:pointer;font-size:1rem;transition:.2s}
.lc-btn:hover{background:#0f766e;transform:translateY(-1px)}
.lc-btn.lc-ghost{background:transparent;border:2px solid rgba(255,255,255,.5)}
.lc-btn.lc-ghost:hover{border-color:#fff;background:rgba(255,255,255,.08)}
.lc-trust{background:#16334f;color:#fff;padding:26px 0}
.lc-trust .lc-container{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;text-align:center}
.lc-trust b{display:block;font-size:1.7rem;color:#7DE0D3}
.lc-trust span{font-size:.85rem;color:#B9CBDA}
.lc-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.lc-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
.lc-card{border:1px solid #E5E7EB;border-radius:14px;padding:26px;background:#fff;transition:.2s}
.lc-card:hover{box-shadow:0 10px 30px rgba(15,42,67,.08);transform:translateY(-2px)}
.lc-card .ico{font-size:1.9rem}
.lc-card h3{color:#0F2A43;margin:12px 0 8px;font-size:1.08rem}
.lc-card p{color:#64748B;font-size:.93rem}
.lc-card.lc-destaque{border:2px solid #0D9488;background:#F0FBF9}
.lc-tag{display:inline-block;background:#0D9488;color:#fff;font-size:.68rem;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:1px;margin-bottom:10px;text-transform:uppercase}
.lc-sla{background:linear-gradient(90deg,#0D9488,#0b8377);color:#fff;text-align:center;padding:54px 0}
.lc-sla h2{color:#fff}
.lc-sla p{max-width:680px;margin:10px auto 0;font-size:1.05rem;color:#E9FBF8}
.lc-sla b{background:#fff;color:#0f766e;padding:2px 10px;border-radius:6px}
.lc-cases{background:#F3F6F9}
.lc-case{display:flex;gap:16px;align-items:flex-start;border:1px solid #E5E7EB;border-radius:14px;padding:20px;background:#fff}
.lc-case .logo{width:52px;height:52px;border-radius:12px;background:#0F2A43;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.9rem;flex-shrink:0}
.lc-case h4{color:#0F2A43;font-size:.98rem}
.lc-case p{color:#64748B;font-size:.85rem;margin-top:4px}
.lc-case .anos{font-size:.72rem;color:#0f766e;font-weight:700;background:#E6F7F4;padding:2px 8px;border-radius:99px;display:inline-block;margin-top:6px}
.lc-cases-foot{margin-top:26px;background:#0F2A43;color:#D7E3EC;border-radius:14px;padding:20px 26px;font-size:.92rem}
.lc-familia{background:#0F2A43;color:#fff}
.lc-familia .inner{display:grid;grid-template-columns:1.2fr .8fr;gap:44px;align-items:center}
.lc-familia h2{color:#fff}
.lc-familia p{color:#C9D8E4;margin-bottom:14px}
.lc-familia img{border-radius:14px;width:100%;height:320px;object-fit:cover}
.lc-familia .nota{font-style:italic;color:#7DE0D3}
.lc-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;counter-reset:st}
.lc-step{background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:22px;position:relative}
.lc-step::before{counter-increment:st;content:counter(st);position:absolute;top:-14px;left:22px;width:28px;height:28px;background:#0D9488;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem}
.lc-step h4{color:#0F2A43;margin:10px 0 6px;font-size:.98rem}
.lc-step p{color:#64748B;font-size:.85rem}
.lc-form-wrap{background:#F3F6F9}
.lc-form-card{background:#fff;border-radius:18px;box-shadow:0 20px 50px rgba(15,42,67,.10);padding:38px;max-width:640px;margin:0 auto}
.lc-root label{display:block;font-weight:600;font-size:.85rem;margin:16px 0 6px;color:#0F2A43}
.lc-root input,.lc-root select,.lc-root textarea{width:100%;padding:12px 14px;border:1px solid #E5E7EB;border-radius:9px;font-size:.95rem;font-family:inherit;background:#FBFDFE}
.lc-root input:focus,.lc-root select:focus,.lc-root textarea:focus{outline:2px solid #0D9488;border-color:#0D9488}
.lc-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.lc-ok{background:#E6F7F4;border:1px solid #0D9488;color:#0f766e;border-radius:10px;padding:14px 16px;margin-top:16px;font-weight:600}
.lc-erro{background:#FDECEC;border:1px solid #e5a3a3;color:#9B1C1C;border-radius:10px;padding:12px 16px;margin-top:16px;font-size:.9rem}
.lc-footer{background:#0B2136;color:#8FA6B8;padding:40px 0;font-size:.85rem}
.lc-footer b{color:#fff}
.lc-footer .lc-container{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.lc-footer .marca{font-size:1.4rem;letter-spacing:2px;color:#fff;font-weight:800}
.lc-copy{border-top:1px solid rgba(255,255,255,.08);margin-top:28px;padding-top:18px;font-size:.75rem;text-align:center}
@media(max-width:860px){.lc-grid3,.lc-grid2,.lc-steps{grid-template-columns:1fr 1fr}.lc-trust .lc-container{grid-template-columns:1fr 1fr}.lc-familia .inner{grid-template-columns:1fr}.lc-footer .lc-container{grid-template-columns:1fr}.lc-row{grid-template-columns:1fr}}
@media(max-width:560px){.lc-grid3,.lc-grid2,.lc-steps{grid-template-columns:1fr}}
`

const CASES = [
  {
    logo: 'SD',
    nome: 'Safe Demo do Brasil',
    txt: 'Atendemos desde 2013 a unidade brasileira da Safe Demo, líder mundial em tampas de airbag — 9 equipamentos em operação, padrão IATF.',
    anos: 'desde 2013',
  },
  {
    logo: 'MG',
    nome: 'Maxi Gráfica',
    txt: '16 equipamentos em operação contínua na gráfica eleita Top 10 do Brasil, certificada FSC® e F.A.M.A. (Disney).',
    anos: '10+ anos',
  },
  {
    logo: 'MS',
    nome: 'Marcol Software',
    txt: '13 anos cuidando da TI de uma empresa de tecnologia — o nosso relacionamento mais longo.',
    anos: '13 anos',
  },
  {
    logo: 'CP',
    nome: 'Clínica COPEC',
    txt: '6 anos cuidando de impressoras e servidores da primeira clínica de otorrinopediatria do Paraná.',
    anos: '6 anos',
  },
  {
    logo: 'AO',
    nome: 'Academia Olímpica',
    txt: 'Uma das academias de natação mais tradicionais de Curitiba — 6+ anos de parceria.',
    anos: '6 anos',
  },
  {
    logo: 'NL',
    nome: 'Nado Livre',
    txt: 'Gestão multiunidade: mesmo grupo, várias sedes, contratos e pacotes distintos — 6 anos.',
    anos: '6 anos',
  },
  {
    logo: 'JA',
    nome: 'Jandira Alimentos',
    txt: 'Indústria paranaense com 70 anos de história — locação crescente, setor a setor.',
    anos: '2 anos',
  },
  {
    logo: 'DH',
    nome: 'Moinho Dona Hilda',
    txt: 'Implantamos toda a infraestrutura da expansão — servidores, câmeras, rede — com visitas de obra.',
    anos: 'projeto completo',
  },
]

export default function Lcca() {
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    setErro('')
    const f = new FormData(ev.currentTarget)
    const dados = Object.fromEntries(f.entries())
    setEnviando(true)
    try {
      const r = await fetch(`${pb.buildURL('')}/backend/v1/leads`.replace(/\/api$/, ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      if (!r.ok) throw new Error('http ' + r.status)
      setOk(true)
      ev.currentTarget.reset()
    } catch {
      setErro(
        'Não conseguimos enviar agora — chama no WhatsApp (41) 98859-8343 que a gente resolve na hora.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="lc-root">
      <style>{CSS}</style>

      {/* HERO */}
      <div className="lc-hero">
        <div className="lc-container">
          <div style={{ letterSpacing: 3, fontWeight: 800, fontSize: '1.5rem', marginBottom: 26 }}>
            LCCA <span style={{ color: '#7DE0D3' }}>TECH</span>
          </div>
          <h1>
            Seus equipamentos em operação.
            <br />
            <em>Sua TI sem dor de cabeça.</em>
          </h1>
          <p>
            Locação de impressoras, computadores Dell, monitores e servidores — com manutenção,
            peças e suporte técnico incluídos. Há mais de uma década cuidando da TI de empresas de
            referência em Curitiba e região.
          </p>
          <a className="lc-btn" href="#lc-contato">
            Peça um diagnóstico gratuito
          </a>
          &nbsp;
          <a className="lc-btn lc-ghost" href="#lc-servicos">
            Ver o que locamos
          </a>
        </div>
      </div>

      {/* BARRA DE CONFIANÇA */}
      <div className="lc-trust">
        <div className="lc-container">
          <div>
            <b>12+</b>
            <span>anos atendendo as mesmas empresas</span>
          </div>
          <div>
            <b>7</b>
            <span>segmentos — da indústria à saúde</span>
          </div>
          <div>
            <b>30+</b>
            <span>equipamentos gerenciados hoje</span>
          </div>
          <div>
            <b>Dono</b>
            <span>quem atende você é o dono, não call center</span>
          </div>
        </div>
      </div>

      {/* O QUE FAZEMOS */}
      <section id="lc-servicos">
        <div className="lc-container">
          <div className="lc-kicker">O que locamos</div>
          <h2>Não locamos "só a impressora".</h2>
          <p className="lc-sub">
            Locamos a infraestrutura que sua operação precisa — do equipamento de mesa ao servidor
            da sala técnica — e cuidamos de tudo enquanto ela roda.
          </p>
          <div className="lc-grid3">
            <div className="lc-card">
              <div className="ico">🖨️</div>
              <h3>Impressoras e multifuncionais</h3>
              <p>
                Equipamentos de qualidade com manutenção, peças e toner incluídos. Franquia mensal
                de páginas e cobrança transparente do excedente.
              </p>
            </div>
            <div className="lc-card">
              <div className="ico">💻</div>
              <h3>Computadores e monitores</h3>
              <p>
                Trabalhamos preferencialmente com a <b>Dell</b> — confiabilidade para o dia a dia.
                Se o reparo demorar, você recebe um computador reserva.
              </p>
            </div>
            <div className="lc-card">
              <div className="ico">🖥️</div>
              <h3>Servidores</h3>
              <p>
                Locação e monitoramento de servidores para sistemas e arquivos — com backup de
                cortesia e acompanhamento mensal.
              </p>
            </div>
            <div className="lc-card lc-destaque">
              <div className="lc-tag">Projeto completo</div>
              <h3>Infraestrutura inteira</h3>
              <p>
                Servidores, câmeras, rede — implantação completa, como fizemos na expansão de um dos
                maiores moinhos do Sul do país. Você abre a operação, a TI já está no ar.
              </p>
            </div>
            <div className="lc-card lc-destaque">
              <div className="lc-tag">Novidade</div>
              <h3>Software + impressora de cupom</h3>
              <p>
                Estamos agregando a locação de sistemas de gestão junto com a impressora de cupom
                fiscal — um só fornecedor para o caixa e para a retaguarda.
              </p>
            </div>
            <div className="lc-card">
              <div className="ico">🔧</div>
              <h3>Suporte técnico</h3>
              <p>
                Técnicos em Curitiba, atendimento no seu local. Sem call center, sem fila — você
                fala com quem resolve.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SLA */}
      <div className="lc-sla" id="lc-sla">
        <div className="lc-container">
          <div className="lc-kicker" style={{ color: '#D2F3EE' }}>
            Nosso maior orgulho
          </div>
          <h2>Chamado aberto hoje, resolvido hoje.</h2>
          <p>
            Na prática, os nossos chamados são resolvidos <b>no mesmo dia</b> — no máximo, no dia
            seguinte. Esse compromisso vai <b>escrito no contrato</b>, não é promessa de comercial.
          </p>
        </div>
      </div>

      {/* CASES */}
      <section className="lc-cases" id="lc-cases">
        <div className="lc-container">
          <div className="lc-kicker">Quem confia</div>
          <h2>Empresas de referência, relações de uma década.</h2>
          <p className="lc-sub">
            A carteira da LCCA inclui clientes que exigem rigor internacional — e que continuam com
            a gente há anos.
          </p>
          <div className="lc-grid2">
            {CASES.map((c) => (
              <div className="lc-case" key={c.nome}>
                <div className="logo">{c.logo}</div>
                <div>
                  <h4>{c.nome}</h4>
                  <p>{c.txt}</p>
                  <span className="anos">{c.anos}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="lc-cases-foot">
            🧾 A carteira da LCCA já atendeu também{' '}
            <b style={{ color: '#fff' }}>construtoras (Gadens)</b> e um{' '}
            <b style={{ color: '#fff' }}>shopping center</b> — indústria, comércio, serviços, saúde,
            esporte, alimentos e agro.
          </div>
        </div>
      </section>

      {/* FAMÍLIA */}
      <section className="lc-familia">
        <div className="lc-container inner">
          <div>
            <div className="lc-kicker" style={{ color: '#7DE0D3' }}>
              Quem está por trás
            </div>
            <h2>Uma família de tradição curitibana.</h2>
            <p>
              De <b style={{ color: '#fff' }}>Juril Carnasciali</b> — a primeira mulher na redação
              da Gazeta do Povo — aos vinhos da{' '}
              <b style={{ color: '#fff' }}>Vinícola Casa Carnasciali</b> em Apucarana, a família
              Carnasciali constrói coisas que duram.
            </p>
            <p>Até a rua da Academia Olímpica, nossa cliente, tem o nosso sobrenome. 😄</p>
            <p className="nota">É de família que cuida de tradição — e de equipamentos.</p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&q=80"
            alt="Equipe trabalhando com tecnologia"
          />
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section>
        <div className="lc-container">
          <div className="lc-kicker">Como funciona</div>
          <h2>Do primeiro contato ao equipamento instalado.</h2>
          <p className="lc-sub">
            Sem burocracia — e com contrato claro, reajuste por índice oficial e rescisão justa.
          </p>
          <div className="lc-steps">
            <div className="lc-step">
              <h4>Conversa</h4>
              <p>Você conta o que precisa por WhatsApp ou pelo formulário abaixo.</p>
            </div>
            <div className="lc-step">
              <h4>Diagnóstico gratuito</h4>
              <p>Visitamos sua empresa, entendemos o volume e o uso dos equipamentos.</p>
            </div>
            <div className="lc-step">
              <h4>Proposta em dias</h4>
              <p>Valores claros, franquia e SLA por escrito — sem letra miúda.</p>
            </div>
            <div className="lc-step">
              <h4>Instalação e cuidado</h4>
              <p>Instalamos, acompanhamos todo mês — e você esquece que impressora dá problema.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FORMULÁRIO */}
      <section className="lc-form-wrap" id="lc-contato">
        <div className="lc-container">
          <div className="lc-form-card">
            <div className="lc-kicker">Fale com a LCCA</div>
            <h2>Quero meu diagnóstico gratuito</h2>
            <p className="lc-sub" style={{ marginBottom: 10 }}>
              Resposta em até 1 dia útil — sem robô te enrolando.
            </p>
            {ok ? (
              <div className="lc-ok">
                ✅ Recebido! Vamos te responder em até 1 dia útil no WhatsApp.
              </div>
            ) : (
              <form onSubmit={enviar}>
                <div className="lc-row">
                  <div>
                    <label>Seu nome *</label>
                    <input name="nome" required placeholder="Nome e sobrenome" />
                  </div>
                  <div>
                    <label>Empresa *</label>
                    <input name="empresa" required placeholder="Nome da empresa" />
                  </div>
                </div>
                <div className="lc-row">
                  <div>
                    <label>WhatsApp *</label>
                    <input
                      name="whatsapp"
                      required
                      placeholder="(41) 9 9999-9999"
                      inputMode="tel"
                    />
                  </div>
                  <div>
                    <label>E-mail</label>
                    <input name="email" type="email" placeholder="voce@empresa.com.br" />
                  </div>
                </div>
                <label>O que você precisa? *</label>
                <select name="interesse" required defaultValue="">
                  <option value="">Selecione…</option>
                  <option>Impressoras / multifuncionais</option>
                  <option>Computadores e monitores</option>
                  <option>Servidores</option>
                  <option>Infraestrutura completa (câmeras, rede)</option>
                  <option>Software + impressora de cupom</option>
                  <option>Ainda não sei — quero conversar</option>
                </select>
                <label>Mensagem</label>
                <textarea
                  name="mensagem"
                  rows={3}
                  placeholder="Quantas pessoas? Quantas impressoras hoje? O que mais precisa?"
                />
                <br />
                <br />
                <button
                  className="lc-btn"
                  type="submit"
                  disabled={enviando}
                  style={{ width: '100%' }}
                >
                  {enviando ? 'Enviando…' : 'Quero meu diagnóstico gratuito'}
                </button>
              </form>
            )}
            {erro && <div className="lc-erro">{erro}</div>}
          </div>
        </div>
      </section>

      {/* RODAPÉ */}
      <footer className="lc-footer">
        <div className="lc-container">
          <div>
            <div className="marca">
              LCCA <span style={{ color: '#7DE0D3' }}>TECH</span>
            </div>
            <p style={{ marginTop: 10 }}>
              Locação de impressoras, computadores e servidores
              <br />+ suporte técnico em Curitiba e região.
            </p>
          </div>
          <div>
            <b>Contato</b>
            <p style={{ marginTop: 10 }}>
              📱 WhatsApp dos Negócios
              <br />
              (41) 98859-8343
            </p>
            <p style={{ marginTop: 6 }}>✉️ contato@lccatech.com</p>
          </div>
          <div>
            <b>Empresa</b>
            <p style={{ marginTop: 10 }}>
              LCCA Tecnologia Ltda
              <br />
              CNPJ 07.667.971/0001-39
              <br />
              Curitiba · Paraná
            </p>
          </div>
        </div>
        <div className="lc-copy">
          © 2026 LCCA Tecnologia — Todos os direitos reservados. ·{' '}
          <Link to="/" style={{ color: '#8FA6B8' }}>
            Área interna do sistema
          </Link>
        </div>
      </footer>
    </div>
  )
}
