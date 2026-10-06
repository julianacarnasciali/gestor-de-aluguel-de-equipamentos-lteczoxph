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
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from '@/hooks/use-auth'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
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
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
