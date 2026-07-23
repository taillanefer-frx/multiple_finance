import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Bell, Camera, Check, Info, LogOut, Moon, Palette, Pencil, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { Modal } from '../../components/ui/Modal'
import { ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { Surface } from '../../components/ui/Surface'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { cn } from '../../lib/utils/cn'
import { useAuth } from '../auth/AuthContext'
import { useProfile } from './ProfileContext'
import { validateAvatarFile } from './profileService'
import { themeOptions } from './theme'

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/fetch|network/i.test(message)) return 'A conexão oscilou. Tente novamente em instantes.'
  if (/storage|bucket/i.test(message)) return 'Não foi possível salvar a foto. Confirme se a migration 009 foi aplicada.'
  return message || 'Não foi possível concluir esta alteração.'
}

export default function ProfilePage() {
  const { configured, user, signOut } = useAuth()
  const { colorMode, profile, loading, error, refresh, saveDisplayName, saveTheme, saveColorMode, saveAvatar, clearAvatar } = useProfile()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [nameOpen, setNameOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'name' | 'avatar' | 'theme' | 'signout' | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (profile) setName(profile.displayName)
  }, [profile])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function handleNameSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy('name')
    setFeedback(null)
    try {
      await saveDisplayName(name)
      setNameOpen(false)
      setFeedback({ kind: 'success', message: 'Nome atualizado.' })
    } catch (caughtError) {
      setFeedback({ kind: 'error', message: friendlyError(caughtError) })
    } finally {
      setBusy(null)
    }
  }

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setFeedback(null)
    try {
      validateAvatarFile(file)
    } catch (caughtError) {
      setFeedback({ kind: 'error', message: friendlyError(caughtError) })
      return
    }

    const nextPreview = URL.createObjectURL(file)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return nextPreview
    })
    setBusy('avatar')
    try {
      await saveAvatar(file)
      setFeedback({ kind: 'success', message: 'Foto atualizada.' })
      setPreviewUrl(null)
      URL.revokeObjectURL(nextPreview)
    } catch (caughtError) {
      setFeedback({ kind: 'error', message: friendlyError(caughtError) })
      setPreviewUrl(null)
      URL.revokeObjectURL(nextPreview)
    } finally {
      setBusy(null)
    }
  }

  async function handleRemoveAvatar() {
    setBusy('avatar')
    setFeedback(null)
    try {
      await clearAvatar()
      setFeedback({ kind: 'success', message: 'Foto removida. Sua inicial voltou a aparecer.' })
    } catch (caughtError) {
      setFeedback({ kind: 'error', message: friendlyError(caughtError) })
    } finally {
      setBusy(null)
    }
  }

  async function handleTheme(themeKey: typeof themeOptions[number]['key']) {
    if (themeKey === profile?.themeKey) return
    setBusy('theme')
    setFeedback(null)
    try {
      await saveTheme(themeKey)
      setFeedback({ kind: 'success', message: 'Cor principal salva na sua conta.' })
    } catch (caughtError) {
      setFeedback({ kind: 'error', message: friendlyError(caughtError) })
    } finally {
      setBusy(null)
    }
  }

  async function handleSignOut() {
    setBusy('signout')
    setFeedback(null)
    const signOutError = await signOut()
    if (signOutError) {
      setFeedback({ kind: 'error', message: 'Não foi possível encerrar a sessão. Tente novamente.' })
      setBusy(null)
      return
    }
    navigate('/login', { replace: true })
  }

  if (loading) return <LoadingState label="Carregando seu perfil…" />
  if (configured && (error || !profile)) {
    return <ErrorState title="Seu perfil ainda não está disponível" description={error ?? 'Aguarde um instante e tente novamente.'} onRetry={() => void refresh()} />
  }

  const displayName = profile?.displayName || String(user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuário')
  const email = user?.email || 'Modo de demonstração'

  return (
    <div className="space-y-5 pb-3">
      {!configured && <div className="flex justify-end"><DemoBadge /></div>}

      <Surface className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar displayName={displayName} avatarPath={profile?.avatarPath} previewUrl={previewUrl} className="h-20 w-20 text-xl" />
            {busy === 'avatar' && <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45 text-xs font-semibold text-white">Salvando</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold tracking-tight text-ink">{displayName}</h2>
            <p className="mt-1 truncate text-sm text-muted">{email}</p>
            <p className="mt-2 text-xs text-muted">Foto privada · JPG, PNG ou WebP · até 3 MB</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatar} />
          <Button variant="secondary" disabled={!configured || busy !== null} onClick={() => fileInput.current?.click()}><Camera size={17} /> {profile?.avatarPath ? 'Trocar foto' : 'Adicionar foto'}</Button>
          <Button variant="ghost" disabled={!profile?.avatarPath || busy !== null} onClick={() => void handleRemoveAvatar()}><Trash2 size={17} /> Remover foto</Button>
        </div>
      </Surface>

      {feedback && <div role="status" className={cn('rounded-2xl px-4 py-3 text-sm', feedback.kind === 'success' ? 'bg-sage text-petrol' : 'bg-red-50 text-danger')}>{feedback.message}</div>}

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 sm:px-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Dados pessoais</p><p className="mt-1 text-sm font-semibold text-ink">Nome de exibição</p><p className="mt-0.5 text-xs text-muted">{displayName}</p></div>
          <Button variant="secondary" disabled={!configured || busy !== null} onClick={() => setNameOpen(true)}><Pencil size={16} /> Editar</Button>
        </div>
      </Surface>

      <Surface className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol">{colorMode === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</span>
          <div><h3 className="text-sm font-semibold text-ink">Aparência</h3><p className="mt-0.5 text-xs text-muted">Escolha a leitura mais confortável para este dispositivo.</p></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-1.5">
          <button type="button" onClick={() => saveColorMode('light')} className={cn('flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition', colorMode === 'light' ? 'bg-surface text-petrol shadow-card' : 'text-muted hover:text-ink')}><Sun size={17} /> Claro</button>
          <button type="button" onClick={() => saveColorMode('dark')} className={cn('flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition', colorMode === 'dark' ? 'bg-surface text-petrol shadow-card' : 'text-muted hover:text-ink')}><Moon size={17} /> Escuro</button>
        </div>
      </Surface>

      <Surface className="p-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol"><Palette size={18} /></span><div><h3 className="text-sm font-semibold text-ink">Cor principal</h3><p className="mt-0.5 text-xs text-muted">Uma paleta discreta, salva no seu perfil.</p></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {themeOptions.map((theme) => {
            const selected = profile?.themeKey === theme.key
            return <button key={theme.key} type="button" disabled={!configured || busy !== null} onClick={() => void handleTheme(theme.key)} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition', selected ? 'border-petrol bg-sage' : 'border-line bg-surface hover:bg-canvas')}><span className="h-9 w-9 shrink-0 rounded-full border-4 border-surface shadow-card" style={{ backgroundColor: `rgb(${colorMode === 'dark' ? theme.dark.primary : theme.primary})` }} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{theme.label}</span><span className="mt-0.5 block text-xs text-muted">{theme.note}</span></span>{selected && <Check size={17} className="text-petrol" />}</button>
          })}
        </div>
      </Surface>

      <Surface className="divide-y divide-line overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:px-5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol"><Bell size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Preferências de notificação</span><span className="mt-0.5 block text-xs text-muted">Configuração detalhada</span></span><span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-muted">Em breve</span></div>
        <div className="flex items-center gap-3 p-4 sm:px-5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol"><ShieldCheck size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Privacidade e segurança</span><span className="mt-0.5 block text-xs text-muted">RLS ativo e sessão autenticada</span></span><span className="rounded-full bg-sage px-2.5 py-1 text-[11px] font-semibold text-petrol">Protegido</span></div>
        <button type="button" onClick={() => setAboutOpen(true)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-canvas sm:px-5"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-canvas text-muted"><Info size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Sobre esta versão</span><span className="mt-0.5 block text-xs text-muted">Etapa 6.7 · estabilidade e perfil</span></span></button>
      </Surface>

      <Surface className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Conta</p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">E-mail</dt><dd className="mt-1 break-all font-medium text-ink">{email}</dd></div><div><dt className="text-xs text-muted">Conta criada</dt><dd className="mt-1 font-medium text-ink">{user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : 'Demonstração'}</dd></div></dl>
      </Surface>

      <Button variant="danger" fullWidth onClick={() => void handleSignOut()} disabled={busy !== null}><LogOut size={17} /> {busy === 'signout' ? 'Saindo…' : 'Sair da conta'}</Button>

      <Modal open={nameOpen} onClose={() => setNameOpen(false)} title="Editar nome" description="Este nome será mostrado para você e nos grupos compartilhados.">
        <form className="space-y-4" onSubmit={handleNameSubmit}><label className="block text-xs font-semibold text-muted" htmlFor="profile-name">Nome</label><input id="profile-name" className="field" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoFocus /><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setNameOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy === 'name'}>{busy === 'name' ? 'Salvando…' : 'Salvar nome'}</Button></div></form>
      </Modal>

      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="Multiple Finance" description="Controle financeiro privado para grupos de confiança.">
        <div className="space-y-4 text-sm leading-6 text-muted"><p>Esta versão inclui autenticação, grupos privados, dashboards financeiros, lançamentos atômicos e perfil personalizado.</p><div className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Ambiente</p><p className="mt-1 font-medium text-ink">{configured ? 'Supabase conectado' : 'Demonstração local'}</p></div><Button fullWidth onClick={() => setAboutOpen(false)}>Entendi</Button></div>
      </Modal>
    </div>
  )
}
