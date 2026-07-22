import { useLocation } from 'react-router-dom'
import { AppRoutes } from '../routes/AppRoutes'
import { AppErrorBoundary } from './AppErrorBoundary'
import { AuthProvider } from '../features/auth/AuthContext'
import { AddFlowProvider } from '../features/expenses/AddFlowContext'
import { ProfileProvider } from '../features/profile/ProfileContext'

export function App() {
  const location = useLocation()

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ProfileProvider>
          <AddFlowProvider>
            <AppErrorBoundary key={location.pathname}>
              <AppRoutes />
            </AppErrorBoundary>
          </AddFlowProvider>
        </ProfileProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
