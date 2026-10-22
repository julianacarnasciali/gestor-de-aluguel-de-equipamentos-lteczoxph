/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import Login from './pages/Login'
import Empresas from './pages/Empresas'
import Leituras from './pages/Leituras'
import Conta from './pages/Conta'
import Fechamentos from './pages/Fechamentos'
import DashboardRelatorio from './pages/DashboardRelatorio'
import Agente from './pages/Agente'
import Financeiro from './pages/Financeiro'
import ServicoAvulso from './pages/ServicoAvulso'
import Lcca from './pages/Lcca'
import NotFound from './pages/NotFound'
import Patrimonio from './pages/Patrimonio'
import ChamadoPublico from './pages/ChamadoPublico'
import Chamados from './pages/Chamados'
import Etiquetas from './pages/Etiquetas'
import Contratos from './pages/Contratos'
import LeituraPublica from './pages/LeituraPublica'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from '@/hooks/use-auth'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

// Landing na raiz: quando acessado por lccatech.com / www.lccatech.com, o app
// inteiro mostra a landing pública — o sistema continua no endereço
// sistema.lccatech.com (domínio ativo no painel Skip) e no goskip.app.
const host = typeof window !== 'undefined' ? window.location.hostname : ''
const ehDominioLanding = host === 'lccatech.com' || host === 'www.lccatech.com'

const sistemaRoutes = (
  <>
    <Route path="/login" element={<Login />} />
    <Route path="/lcca" element={<Lcca />} />
    <Route path="/chamado" element={<ChamadoPublico />} />
    <Route path="/leitura" element={<LeituraPublica />} />
    <Route element={<Layout />}>
      <Route
        path="/"
        element={
          <RequireAuth>
            <Index />
          </RequireAuth>
        }
      />
      <Route
        path="/empresas"
        element={
          <RequireAuth>
            <Empresas />
          </RequireAuth>
        }
      />
      <Route
        path="/leituras"
        element={
          <RequireAuth>
            <Leituras />
          </RequireAuth>
        }
      />
      <Route
        path="/conta"
        element={
          <RequireAuth>
            <Conta />
          </RequireAuth>
        }
      />
      <Route
        path="/fechamentos"
        element={
          <RequireAuth>
            <Fechamentos />
          </RequireAuth>
        }
      />
      <Route
        path="/contratos"
        element={
          <RequireAuth>
            <Contratos />
          </RequireAuth>
        }
      />
      <Route
        path="/relatorio"
        element={
          <RequireAuth>
            <DashboardRelatorio />
          </RequireAuth>
        }
      />
      <Route
        path="/agente"
        element={
          <RequireAuth>
            <Agente />
          </RequireAuth>
        }
      />
      <Route
        path="/financeiro"
        element={
          <RequireAuth>
            <Financeiro />
          </RequireAuth>
        }
      />
      <Route
        path="/servico-avulso"
        element={
          <RequireAuth>
            <ServicoAvulso />
          </RequireAuth>
        }
      />
      <Route
        path="/patrimonio"
        element={
          <RequireAuth>
            <Patrimonio />
          </RequireAuth>
        }
      />
      <Route
        path="/chamados"
        element={
          <RequireAuth>
            <Chamados />
          </RequireAuth>
        }
      />
      <Route
        path="/etiquetas"
        element={
          <RequireAuth>
            <Etiquetas />
          </RequireAuth>
        }
      />
    </Route>
    <Route path="*" element={<NotFound />} />
  </>
)

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {ehDominioLanding ? (
            // lccatech.com: qualquer URL cai na landing (o sistema vive no subdomínio)
            <Route path="*" element={<Lcca />} />
          ) : (
            sistemaRoutes
          )}
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
