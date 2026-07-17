import { useMemo } from 'react'
import { Bell, Home, Plus, UserRound, UsersRound } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils/cn'
import { BrandMark } from '../ui/BrandMark'
import { useAuth } from '../../features/auth/AuthContext'
import { useAddFlow } from '../../features/expenses/AddFlowContext'

const navigation = [
  { label: 'Início', icon: Home, to: '/app', end: true },
  { label: 'Grupos', icon: UsersRound, to: '/app/grupos' },
  { label: 'Adicionar', icon: Plus, action: true },
  { label: 'Notificações', icon: Bell, to: '/app/notificacoes' },
  { label: 'Perfil', icon: UserRound, to: '/app/perfil' },
] as const

function getPageTitle(pathname: string, firstName: string) {
  if (pathname === '/app') return { eyebrow: 'Visão geral', title: `Olá, ${firstName}` }
  if (pathname.includes('/grupos/')) return { eyebrow: 'Grupo', title: 'Detalhes do grupo' }
  if (pathname === '/app/grupos') return { eyebrow: 'Organização', title: 'Seus grupos' }
  if (pathname === '/app/notificacoes') return { eyebrow: 'Atualizações', title: 'Notificações' }
  if (pathname === '/app/perfil') return { eyebrow: 'Sua conta', title: 'Perfil' }
  return { eyebrow: 'Multiple Finance', title: 'Finanças' }
}

export function AppShell() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { openAddFlow } = useAddFlow()
  const displayName = String(user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Thaiane')
  const firstName = displayName.trim().split(/\s+/)[0] || 'Olá'
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MF'
  const page = useMemo(() => getPageTitle(pathname, firstName), [firstName, pathname])

  return (
    <div className="min-h-screen bg-transparent pb-28">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark compact />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{page.eyebrow}</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{page.title}</h1>
            </div>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-petrol text-sm font-semibold text-white" aria-label={`Perfil de ${displayName}`}>
            {initials}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
        <Outlet />
      </main>

      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-xl grid-cols-5 items-end rounded-[1.4rem] border border-line/90 bg-white/95 px-2 py-2 shadow-lift backdrop-blur-xl">
          {navigation.map(({ label, icon: Icon, ...item }) => {
            if ('action' in item) {
              return (
                <button key={label} onClick={openAddFlow} className="group flex flex-col items-center gap-1 text-[10px] font-semibold text-petrol" aria-label="Adicionar">
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
                className={({ isActive }) => cn('flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium transition', isActive ? 'bg-sage text-petrol' : 'text-muted hover:text-ink')}
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
