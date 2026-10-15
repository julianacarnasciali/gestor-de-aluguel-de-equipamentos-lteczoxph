import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/relatorio', label: 'Relatório' },
  { to: '/empresas', label: 'Empresas' },
  { to: '/leituras', label: 'Leituras' },
  { to: '/patrimonio', label: 'Patrimônio' },
  { to: '/etiquetas', label: 'Etiquetas' },
  { to: '/chamados', label: 'Chamados' },
  { to: '/fechamentos', label: 'Fechamento' },
  { to: '/financeiro', label: 'Financeiro' },
  { to: '/servico-avulso', label: 'Serviço avulso' },
  { to: '/agente', label: 'Assistente IA' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Página inicial em quadradinhos (14/10): na home o menu lateral grande
  // some — a home É a navegação. Nas outras páginas o menu volta.
  const naHome = location.pathname === '/'

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="bg-white border-b shadow-sm print:hidden">
        <div className="container mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-teal-700">
            <img
              src="https://gestor-de-aluguel-de-equipamentos-e924e.shrd00.internal.goskip.dev/api/files/arquivos/9zb90olapcv6t1f/simbolo_navy_ioukhyk01x.png"
              alt="LCCA Tech"
              className="h-8 w-8 rounded"
            />
            <span className="hidden sm:inline">Gestor de Aluguel</span>
          </div>
          {!naHome && (
            <nav className="flex items-center gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium ${
                      isActive ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <NavLink to="/conta">{user?.name ?? 'Conta'}</NavLink>
            </Button>
            <Button
              variant="outline"
              size="sm"
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
