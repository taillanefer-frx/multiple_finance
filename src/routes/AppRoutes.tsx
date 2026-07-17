import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'

const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'))
const GroupsPage = lazy(() => import('../features/groups/GroupsPage'))
const GroupDetailPage = lazy(() => import('../features/groups/GroupDetailPage'))
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'))
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'))
const InvitePage = lazy(() => import('../features/groups/InvitePage'))
const NotFoundPage = lazy(() => import('./NotFoundPage'))

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/convite/:inviteToken" element={<InvitePage />} />
      <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="grupos" element={<GroupsPage />} />
        <Route path="grupos/:groupId" element={<GroupDetailPage />} />
        <Route path="notificacoes" element={<NotificationsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
