import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingState } from '../../components/ui/StateDisplay'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { configured, loading, user } = useAuth()
  const location = useLocation()

  if (!configured) return children
  if (loading) return <LoadingState fullScreen label="Verificando sua sessão…" />
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return children
}
