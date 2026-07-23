import { useMemo } from 'react'
import { Bell, Home, Plus, Target, UserRound, UsersRound } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils/cn'
import { BrandMark } from '../ui/BrandMark'
import { useAuth } from '../../features/auth/AuthContext'
import { useAddFlow } from '../../features/expenses/AddFlowContext'
import { useProfile } from '../../features/profile/ProfileContext'
import { UserAvatar } from '../ui/UserAvatar'

const navigation = [
  { label: 'Início', icon: Home, to: '/app', end: true },
  { label: 'Grupos', icon: UsersRound, to: '/app/grupos' },
  { label: 'Metas', icon: Target, to: '/app/metas' },
  { label: 'Adicionar', icon: Plus, action: true },
  { label: 'Notificações', icon: Bell, to: '/app/notificacoes' },
  { label: 'Perfil', icon: UserRound, to: '/app/perfil' },
] as const

function getPageTitle(pathname: string, firstName: string) {
  if (pathname === '/app') return { eyebrow: 'Visão geral', title: `Olá, ${firstName}` }
  if (pathname.includes('/grupos/')) return { eyebrow: 'Grupo', title: 'Detalhes do grupo' }
  if (pathname === '/app/grupos') return { eyebrow: 'Organização', title: 'Seus grupos' }
  if (pathname === '/app/notificacoes') return { eyebrow: 'Atualizações', title: 'Notificações' }
  if (pathname === '/app/metas') return { eyebrow: 'Planejamento', title: 'Metas' }
  if (pathname === '/app/perfil') return { eyebrow: 'Sua conta', title: 'Perfil' }
  return { eyebrow: 'Multiple Finance', title: 'Finanças' }
}

export function AppShell() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { profile } = useProfile()
  const { openAddFlow } = useAddFlow()
  const displayName = String(profile?.displayName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuário')
  const firstName = displayName.trim().split(/\s+/)[0] || 'Olá'
  const page = useMemo(() => getPageTitle(pathname, firstName), [firstName, pathname])

  return (
    <div className="min-h-screen bg-transparent pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark compact />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{page.eyebrow}</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{page.title}</h1>
            </div>
          </div>
          <NavLink to="/app/perfil" aria-label={`Abrir perfil de ${displayName}`}><UserAvatar displayName={displayName} avatarPath={profile?.avatarPath} className="h-10 w-10 text-sm" /></NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
        <Outlet />
      </main>

      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-2xl grid-cols-6 items-end rounded-[1.4rem] border border-line/90 bg-white/95 px-1.5 py-2 shadow-lift backdrop-blur-xl sm:px-2">
          {navigation.map(({ label, icon: Icon, ...item }) => {
            if ('action' in item) {
              return (
                <button key={label} type="button" onClick={openAddFlow} className="group flex min-h-12 flex-col items-center gap-1 text-[10px] font-semibold text-petrol" aria-label="Adicionar">
                  <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-canvas bg-petrol text-white shadow-lift transition group-active:scale-95">
                    <Icon size={25} />
                  </span>
                  <span>{label}</span>
                </button>
              )
            }

            return (
              <NavLink
                key={label}
                to={item.to}
                end={'end' in item ? item.end : undefined}
                className={({ isActive }) => cn('flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-medium transition sm:text-[10px]', isActive ? 'bg-sage text-petrol' : 'text-muted hover:text-ink')}
              >
                <Icon size={20} strokeWidth={1.9} />
                <span className="max-w-full truncate px-1">{label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
