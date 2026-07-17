import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, LockKeyhole, Mail } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandMark } from '../../components/ui/BrandMark'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/utils/cn'
import { useAuth } from './AuthContext'

type AuthMode = 'login' | 'signup'

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (normalized.includes('user already registered')) return 'Já existe uma conta com este e-mail.'
  if (normalized.includes('password')) return 'A senha não atende aos requisitos de segurança.'
  return 'Não foi possível concluir. Tente novamente em instantes.'
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { configured, loading, user, signIn, signUp } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const requestedNext = searchParams.get('next')
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/app'

  useEffect(() => {
    if (configured && !loading && user) navigate(next, { replace: true })
  }, [configured, loading, navigate, next, user])

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError(null)
    setSuccess(null)
    setPasswordConfirmation('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured || busy) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signup' && password !== passwordConfirmation) {
      setBusy(false)
      setError('As senhas não coincidem.')
      return
    }

    if (mode === 'login') {
      const authError = await signIn(email.trim(), password)
      setBusy(false)
      if (authError) {
        setError(authErrorMessage(authError.message))
        return
      }
      navigate(next, { replace: true })
      return
    }

    const result = await signUp(displayName, email.trim(), password, `${window.location.origin}${next}`)
    setBusy(false)
    if (result.error) {
      setError(authErrorMessage(result.error.message))
      return
    }
    if (result.needsEmailConfirmation) {
      setSuccess('Cadastro criado. Enviamos um link de confirmação para o seu e-mail.')
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <main className="min-h-screen bg-canvas px-5 py-6 sm:grid sm:place-items-center sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-line bg-white shadow-card md:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden min-h-[660px] flex-col justify-between overflow-hidden bg-petrol p-10 text-white md:flex">
          <BrandMark inverse />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Sua casa, em equilíbrio</p>
            <h1 className="mt-4 max-w-sm text-4xl font-semibold leading-tight tracking-[-0.035em]">Finanças compartilhadas, sem ruído.</h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">Organize grupos privados e acompanhe os gastos da casa com uma visão simples de entender.</p>
          </div>
          <div className="space-y-3 text-sm text-white/75">
            {['Grupos privados por convite', 'Dados protegidos por usuário', 'Experiência pensada para o celular'].map((item) => (
              <p key={item} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /> {item}</p>
            ))}
          </div>
        </section>

        <section className="px-5 py-7 sm:px-10 sm:py-10 md:px-14 md:py-14">
          <div className="md:hidden"><BrandMark /></div>
          <div className="mt-12 md:mt-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-petrol">Bem-vinda</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">{mode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{mode === 'login' ? 'Continue para organizar as finanças do seu grupo.' : 'Cadastre seu nome, e-mail e uma senha segura.'}</p>
          </div>

          <div className="mt-7 grid grid-cols-2 rounded-2xl bg-canvas p-1">
            {(['login', 'signup'] as const).map((item) => (
              <button key={item} type="button" onClick={() => changeMode(item)} className={cn('rounded-xl px-3 py-2.5 text-sm font-semibold transition', mode === item ? 'bg-white text-ink shadow-sm' : 'text-muted')}>
                {item === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            ))}
          </div>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-ink">Nome</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120} className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink placeholder:text-muted/60" placeholder="Como você quer ser chamada?" autoComplete="name" />
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-ink">E-mail</span>
              <span className="relative block">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" className="h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-4 text-sm text-ink placeholder:text-muted/60" placeholder="voce@exemplo.com" autoComplete="email" />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-ink">Senha</span>
              <span className="relative block">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} type="password" className="h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-4 text-sm text-ink placeholder:text-muted/60" placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </span>
            </label>
            {mode === 'signup' && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-ink">Confirmar senha</span>
                <span className="relative block">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                  <input value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={6} type="password" className="h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-4 text-sm text-ink placeholder:text-muted/60" placeholder="Digite a senha novamente" autoComplete="new-password" />
                </span>
              </label>
            )}

            {mode === 'login' && <button type="button" onClick={() => { setError(null); setSuccess('A recuperação por e-mail está preparada e será ativada com a configuração de redirecionamento do Supabase.') }} className="block text-xs font-semibold text-petrol hover:underline">Esqueci minha senha</button>}

            {error && <div role="alert" className="flex gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-danger"><AlertCircle className="mt-0.5 shrink-0" size={16} /> {error}</div>}
            {success && <div role="status" className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-positive"><CheckCircle2 className="mt-0.5 shrink-0" size={16} /> {success}</div>}

            <Button fullWidth type="submit" disabled={!configured || busy}>
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'} {!busy && <ArrowRight size={17} />}
            </Button>
          </form>

          {!configured && (
            <>
              <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber">Modo local: configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para ativar o cadastro e o login.</div>
              <Link to="/app" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line text-sm font-semibold text-petrol transition hover:bg-sage">Visualizar demonstração <ArrowRight size={16} /></Link>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
