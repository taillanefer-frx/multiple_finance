import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import LoginPage from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import DashboardPage from '../features/dashboard/DashboardPage'
import GroupDetailPage from '../features/groups/GroupDetailPage'
import GroupsPage from '../features/groups/GroupsPage'
import InvitePage from '../features/groups/InvitePage'
import GoalsPage from '../features/goals/GoalsPage'
import NotificationsPage from '../features/notifications/NotificationsPage'
import ProfilePage from '../features/profile/ProfilePage'
import NotFoundPage from './NotFoundPage'

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
        <Route path="metas" element={<GoalsPage />} />
        <Route path="notificacoes" element={<NotificationsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
