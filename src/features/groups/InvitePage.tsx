import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, ShieldCheck, UsersRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BrandMark } from '../../components/ui/BrandMark'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/StateDisplay'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthContext'
import { acceptInvite, getInvitePreview } from './groupService'
import { groupTypeLabel } from './groupLabels'
import type { InvitePreview } from './types'

export default function InvitePage() {
  const { inviteToken } = useParams()
  const { configured, loading: authLoading, user } = useAuth()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadPreview = useCallback(async () => {
    if (!configured || !user || !inviteToken) return
    setPreviewLoading(true)
    setError(null)
    try {
      setPreview(await getInvitePreview(inviteToken))
    } catch {
      setError('Este convite é inválido, expirou ou já atingiu o limite de usos.')
    } finally {
      setPreviewLoading(false)
    }
  }, [configured, inviteToken, user])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  async function enterGroup() {
    if (!inviteToken || busy) return
    setBusy(true)
    setError(null)
    try {
      const groupId = await acceptInvite(inviteToken)
      navigate(`/app/grupos/${groupId}`, { replace: true })
    } catch {
      setBusy(false)
      setError('Não foi possível aceitar este convite. Ele pode ter expirado ou sido desativado.')
    }
  }

  if (configured && authLoading) return <LoadingState fullScreen label="Verificando sua sessão…" />

  const loginUrl = `/login?next=${encodeURIComponent(`/convite/${inviteToken || ''}`)}`

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><BrandMark /></div>
        <Surface className="p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sage text-petrol"><UsersRound size={24} /></span>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-petrol">Convite para grupo</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{preview ? `Entrar em ${preview.groupName}` : 'Você recebeu um convite privado'}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{preview ? `${groupTypeLabel[preview.groupType]}. Confirme abaixo para entrar como membro ativo.` : 'Entre ou crie sua conta primeiro. Nenhum dado do grupo será exibido antes da autenticação.'}</p>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-canvas px-4 py-3 text-xs text-muted"><ShieldCheck size={16} className="text-positive" /> Token protegido · final {inviteToken?.slice(-4) || '0000'}</div>

          {previewLoading && <div className="mt-4"><LoadingState label="Validando convite…" /></div>}
          {error && <div role="alert" className="mt-4 flex gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-left text-xs leading-5 text-danger"><AlertCircle className="mt-0.5 shrink-0" size={16} /> {error}</div>}

          {!configured && <Link to="/login"><Button className="mt-6" fullWidth>Continuar no modo local <ArrowRight size={17} /></Button></Link>}
          {configured && !user && <Link to={loginUrl}><Button className="mt-6" fullWidth>Entrar ou criar conta <ArrowRight size={17} /></Button></Link>}
          {configured && user && preview && <Button className="mt-6" fullWidth onClick={enterGroup} disabled={busy}>{busy ? 'Entrando…' : 'Entrar no grupo'} {!busy && <ArrowRight size={17} />}</Button>}

          <p className="mt-4 text-[11px] leading-5 text-muted">O token não concede leitura direta de despesas, saldos ou participantes.</p>
        </Surface>
      </div>
    </main>
  )
}
