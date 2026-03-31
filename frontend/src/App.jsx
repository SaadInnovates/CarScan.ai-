import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import { AppProvider } from './context/AppContext'

import AnalyticsPage from './pages/AnalyticsPage'
import AdminPage from './pages/AdminPage'
import AuthPage from './pages/AuthPage'
import EmailVerificationPage from './pages/EmailVerificationPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import ReportsPage from './pages/ReportsPage'
import ScansPage from './pages/ScansPage'
import AssistantPage from './pages/AssistantPage'
// import DebugMeTestPage from './pages/DebugMeTestPage'

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/verify-email" element={<EmailVerificationPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/scans" element={<ScansPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>

          {/* <Route path="/debug-me-test" element={<DebugMeTestPage />} /> */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
