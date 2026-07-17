import { Suspense } from 'react'
import { AppRoutes } from '../routes/AppRoutes'
import { LoadingState } from '../components/ui/StateDisplay'
import { AppErrorBoundary } from './AppErrorBoundary'
import { AuthProvider } from '../features/auth/AuthContext'
import { AddFlowProvider } from '../features/expenses/AddFlowContext'

export function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AddFlowProvider>
          <Suspense fallback={<LoadingState fullScreen label="Organizando suas finanças…" />}>
            <AppRoutes />
          </Suspense>
        </AddFlowProvider>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
