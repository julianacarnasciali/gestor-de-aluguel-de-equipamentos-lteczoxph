import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

// MENU SUPERIOR REDESENHADO (24/10, pedido dela p/ o Luiz — mockup aprovado):
// header navy PERMANENTE em TODAS as telas (inclusive na home dos
// quadradinhos), 15 itens agrupados em 4 menus com dropdown + 3 atalhos
// diretos de 1 clique (Chamados, Agenda, Assistente IA — pedido dela 17h52).
// A home continua sendo a navegação por quadradinhos — nada é removido.
const grupos = [
  {
    rotulo: 'Clientes',
    itens: [
      { to: '/empresas', label: 'Empresas' },
      { to: '/contratos', label: 'Contratos' },
      { to: '/propostas', label: 'Propostas' },
    ],
  },
  {
    rotulo: 'Operação',
    itens: [
      { to: '/leituras', label: 'Leituras' },
      { to: '/patrimonio', label: 'Patrimônio' },
      { to: '/etiquetas', label: 'Etiquetas' },
      { to: '/ordens', label: 'Ordens de serviço' },
      { to: '/tempos', label: 'Tempos de atendimento' },
    ],
  },
  {
    rotulo: 'Financeiro',
    itens: [
      { to: '/fechamentos', label: 'Fechamento' },
      { to: '/financeiro', label: 'Financeiro' },
      { to: '/servico-avulso', label: 'Serviço avulso' },
    ],
  },
  {
    rotulo: 'Ferramentas',
    itens: [
      { to: '/relatorio', label: 'Relatório' },
      { to: '/conta', label: 'Conta' },
    ],
  },
]

// Atalhos diretos: as funções do dia a dia do Luiz — 1 clique, sem submenu.
const atalhos = [
  { to: '/chamados', label: 'Chamados', ico: '🔧' },
  { to: '/agenda', label: 'Agenda', ico: '📅' },
  { to: '/agente', label: 'Assistente IA', ico: '🤖' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const ativo = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="bg-[#0F2A43] text-white shadow-md print:hidden">
        <div className="container mx-auto px-4 h-14 flex items-center gap-4">
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <img
              src="https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/9zb90olapcv6t1f/simbolo_navy_ioukhyk01x.png"
              alt="LCCA Tech"
              className="h-8 w-8 rounded bg-white p-0.5"
            />
            <span className="hidden sm:inline font-bold text-white">Gestor de Aluguel</span>
          </NavLink>

          <nav className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
            {grupos.map((g) => (
              <DropdownMenu key={g.rotulo}>
                <DropdownMenuTrigger
                  className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap outline-none ${
                    g.itens.some((i) => ativo(i.to))
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {g.rotulo} ▾
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {g.itens.map((i) => (
                    <DropdownMenuItem
                      key={i.to}
                      className={`cursor-pointer ${
                        ativo(i.to) ? 'bg-teal-50 text-teal-800 font-medium' : ''
                      }`}
                      onSelect={() => navigate(i.to)}
                    >
                      {i.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}

            <span className="mx-1 h-5 w-px bg-white/20 shrink-0" />

            {atalhos.map((a) => (
              <NavLink
                key={a.to}
                to={a.to}
                className={({ isActive }) =>
                  `px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap ${
                    isActive ? 'bg-teal-600 text-white' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
              >
                <span className="mr-1">{a.ico}</span>
                <span className="hidden md:inline">{a.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <NavLink to="/conta">{user?.name ?? 'Conta'}</NavLink>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/25 text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => {
                signOut()
                navigate('/login')
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </main>
  )
}
