import { useState } from 'react'
import { Bell, ChevronRight, Info, LogOut, Moon, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { Modal } from '../../components/ui/Modal'
import { Surface } from '../../components/ui/Surface'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { useAuth } from '../auth/AuthContext'

const preferences = [
  { icon: Bell, label: 'Preferências de notificação', note: 'Alertas do grupo' },
  { icon: ShieldCheck, label: 'Privacidade e segurança', note: 'Conta e sessões' },
  { icon: Moon, label: 'Aparência', note: 'Tema claro' },
]

export default function ProfilePage() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const displayName = String(user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Thaiane Zeni')
  const email = user?.email || 'thaiane@exemplo.com'
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MF'

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
    navigate('/login', { replace: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><DemoBadge /></div>
      <Surface className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-petrol text-lg font-semibold text-white">{initials}</span>
          <div className="min-w-0"><h2 className="truncate text-xl font-semibold tracking-tight text-ink">{displayName}</h2><p className="mt-1 truncate text-sm text-muted">{email}</p><span className="mt-2 inline-flex rounded-full bg-sage px-2.5 py-1 text-[11px] font-semibold text-positive">{user ? 'Conta autenticada' : 'Conta demonstrativa'}</span></div>
        </div>
      </Surface>

      <Surface className="divide-y divide-line overflow-hidden">
        {preferences.map(({ icon: Icon, label, note }) => (
          <button key={label} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-canvas sm:px-5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol"><Icon size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{label}</span><span className="mt-0.5 block text-xs text-muted">{note}</span></span>
            <ChevronRight size={17} className="text-muted" />
          </button>
        ))}
        <button onClick={() => setAboutOpen(true)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-canvas sm:px-5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-canvas text-muted"><Info size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Sobre esta versão</span><span className="mt-0.5 block text-xs text-muted">Etapa 1 · Estrutura visual</span></span>
          <ChevronRight size={17} className="text-muted" />
        </button>
      </Surface>

      <Button variant="danger" fullWidth onClick={handleSignOut} disabled={signingOut}><LogOut size={17} /> {signingOut ? 'Saindo…' : user ? 'Sair da conta' : 'Sair da demonstração'}</Button>

      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="Multiple Finance" description="Estrutura protegida por autenticação e políticas de acesso.">
        <div className="space-y-4 text-sm leading-6 text-muted">
          <p>O login por e-mail e senha está preparado para usar o Supabase. As telas financeiras continuam demonstrativas até a conexão das consultas.</p>
          <div className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Supabase</p><p className="mt-1 font-medium text-ink">{isSupabaseConfigured ? 'Ambiente configurado e autenticação ativa' : 'Não configurado — interface em modo local'}</p></div>
          <Button fullWidth onClick={() => setAboutOpen(false)}>Entendi</Button>
        </div>
      </Modal>
    </div>
  )
}
