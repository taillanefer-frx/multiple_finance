import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Landmark, Plus, UsersRound } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { Surface } from '../../components/ui/Surface'
import { currency } from '../../lib/utils/format'
import { dataErrorMessage } from '../../lib/supabase/errors'
import { useAuth } from '../auth/AuthContext'
import { CreateGroupModal } from './CreateGroupModal'
import { demoGroups } from './demoGroups'
import { groupTypeLabel, groupValueLabel } from './groupLabels'
import { subscribeToGroupList } from './groupRealtime'
import { getGroupsForUser } from './groupService'
import type { GroupSummary } from './types'

const demoSummaries: GroupSummary[] = demoGroups.map((group, index) => ({
  id: group.id,
  name: group.name,
  type: index === 0 ? 'house_split' : 'balance_control',
  role: 'admin',
  memberCount: group.members,
  monthTotal: group.monthTotal,
  myValue: index === 0 ? 1428.9 : 620,
}))

export default function GroupsPage() {
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const requestId = useRef(0)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadGroups = useCallback(async (silent = false) => {
    const currentRequest = ++requestId.current
    if (!silent) setLoading(true)
    setError(null)
    if (!silent) setRefreshWarning(null)
    if (authLoading) return

    if (!configured) {
      setGroups(demoSummaries)
      setLoading(false)
      return
    }
    if (!userId) {
      setGroups([])
      setLoading(false)
      return
    }

    try {
      const nextGroups = await getGroupsForUser(userId)
      if (currentRequest === requestId.current) {
        setGroups(nextGroups)
        setRefreshWarning(null)
      }
    } catch (caughtError) {
      if (currentRequest === requestId.current) {
        const message = dataErrorMessage(caughtError, 'Não foi possível sincronizar seus grupos privados.')
        if (silent) setRefreshWarning('A atualização automática falhou, mas sua lista anterior foi mantida.')
        else setError(message)
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [authLoading, configured, userId])

  useEffect(() => {
    void loadGroups()
    return () => { requestId.current += 1 }
  }, [loadGroups])

  useEffect(() => {
    if (searchParams.get('novo') !== '1') return
    setCreateOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!configured || authLoading || !userId) return
    return subscribeToGroupList(userId, () => { void loadGroups(true) })
  }, [authLoading, configured, loadGroups, userId])

  if (loading) return <LoadingState label="Buscando seus grupos privados…" />
  if (error) return <ErrorState title="Não foi possível carregar seus grupos" description={error} onRetry={() => void loadGroups()} />

  return (
    <div className="space-y-6">
      {refreshWarning && <p className="rounded-2xl bg-amber/10 px-4 py-3 text-xs leading-5 text-amber">{refreshWarning}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold tracking-tight text-ink">Organize com quem importa</h2><p className="mt-1 text-sm text-muted">Você vê apenas os grupos em que participa.</p></div>
        <div className="flex items-center gap-2">{!configured && <DemoBadge />}<Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Novo grupo</Button></div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={UsersRound} title="Você ainda não participa de grupos" description="Crie seu primeiro grupo privado ou abra um link de convite enviado por alguém." actionLabel="Criar grupo" onAction={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => {
            const Icon = group.type === 'house_split' ? UsersRound : Landmark
            return (
              <button key={group.id} onClick={() => navigate(`/app/grupos/${group.id}`)} className="group block text-left">
                <Surface className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-petrol/20">
                  <div className="flex items-start justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-petrol text-white"><Icon size={21} /></span>
                    <ChevronRight className="text-muted transition group-hover:translate-x-1 group-hover:text-petrol" size={19} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-ink">{group.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-petrol">{groupTypeLabel[group.type]}</p>
                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
                    <div><p className="text-[11px] text-muted">Total do mês</p><p className="mt-1 text-sm font-semibold text-ink">{currency.format(group.monthTotal)}</p></div>
                    <div><p className="text-[11px] text-muted">{groupValueLabel(group.type)}</p><p className={`mt-1 text-sm font-semibold ${group.type === 'balance_control' && group.myValue < 0 ? 'text-danger' : 'text-positive'}`}>{currency.format(group.myValue)}</p></div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-muted"><span>{group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'}</span><span>{group.role === 'admin' ? 'Administrador' : 'Membro'}</span></div>
                </Surface>
              </button>
            )
          })}
        </div>
      )}

      <CreateGroupModal open={createOpen} onClose={() => setCreateOpen(false)} enabled={configured && Boolean(user)} onCreated={(groupId) => navigate(`/app/grupos/${groupId}`)} />
    </div>
  )
}
