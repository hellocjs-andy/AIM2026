import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivacyProvider } from './contexts/privacy'
import { AuthProvider, useAuth } from './contexts/auth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import HoldingsPage from './pages/HoldingsPage'
import TradesPage from './pages/TradesPage'
import ClosedPositionsPage from './pages/ClosedPositionsPage'
import SettingsPage from './pages/SettingsPage'
import PnLDetailPage from './pages/PnLDetailPage'
import AllocationPage from './pages/AllocationPage'
import PerformancePage from './pages/PerformancePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})

function AppContent() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <LoginPage />
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="holdings" element={<HoldingsPage />} />
        <Route path="trades" element={<TradesPage />} />
        <Route path="closed" element={<ClosedPositionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="pnl/:type" element={<PnLDetailPage />} />
        <Route path="allocation" element={<AllocationPage />} />
        <Route path="performance" element={<PerformancePage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrivacyProvider>
          <BrowserRouter basename="/AIM2026">
            <AppContent />
          </BrowserRouter>
        </PrivacyProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
