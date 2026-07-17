import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ChevronRight, Landmark, UsersRound, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { Surface } from '../../components/ui/Surface'
import { currency } from '../../lib/utils/format'
import { useAuth } from '../auth/AuthContext'
import { demoGroups } from '../groups/demoGroups'
import { groupTypeLabel, groupValueLabel } from '../groups/groupLabels'
import { subscribeToGroupList } from '../groups/groupRealtime'
import { getGroupsForUser } from '../groups/groupService'
import type { GroupSummary } from '../groups/types'

const demoSummaries: GroupSummary[] = demoGroups.map((group, index) => ({
  id: group.id,
  name: group.name,
  type: index === 0 ? 'house_split' : 'balance_control',
  role: 'admin',
  memberCount: group.members,
  monthTotal: group.monthTotal,
  myValue: index === 0 ? 1428.9 : 620,
}))

export default function DashboardPage() {
  const { configured, user } = useAuth()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(false)
    if (!configured) {
      setGroups(demoSummaries)
      setLoading(false)
      return
    }
    if (!user) return
    try {
      setGroups(await getGroupsForUser(user.id))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [configured, user])

  useEffect(() => { void loadDashboard() }, [loadDashboard])
  useEffect(() => {
    if (!configured || !user) return
    return subscribeToGroupList(user.id, () => { void loadDashboard(true) })
  }, [configured, loadDashboard, user])

  const totals = useMemo(() => ({
    month: groups.reduce((sum, group) => sum + group.monthTotal, 0),
    share: groups.filter((group) => group.type === 'house_split').reduce((sum, group) => sum + group.myValue, 0),
    balance: groups.filter((group) => group.type === 'balance_control').reduce((sum, group) => sum + group.myValue, 0),
  }), [groups])

  if (loading) return <LoadingState label="Montando sua visão pessoal…" />
  if (error) return <ErrorState title="Não foi possível montar sua visão" description="Seus dados continuam protegidos. Tente carregar novamente." onRetry={() => void loadDashboard()} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-lg text-sm leading-6 text-muted">Uma visão dos grupos privados vinculados à sua conta.</p>{!configured && <DemoBadge />}</div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl bg-petrol p-6 text-white shadow-lift sm:p-7">
          <p className="text-xs font-medium text-white/60">Total movimentado no mês</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{currency.format(totals.month)}</p>
          <div className="mt-9 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <div><span className="flex items-center gap-1.5 text-xs text-white/55"><ArrowDownRight size={14} /> Minha parte</span><p className="mt-1.5 text-base font-semibold">{currency.format(totals.share)}</p></div>
            <div><span className="flex items-center gap-1.5 text-xs text-white/55"><WalletCards size={14} /> Meu saldo</span><p className="mt-1.5 text-base font-semibold">{currency.format(totals.balance)}</p></div>
          </div>
        </div>
        <Surface className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Sua organização</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{groups.length}</p>
          <p className="mt-1 text-sm text-muted">{groups.length === 1 ? 'grupo ativo' : 'grupos ativos'}</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-sage"><div className="h-full rounded-full bg-petrol" style={{ width: `${Math.min(100, groups.length * 25)}%` }} /></div>
          <p className="mt-3 text-xs leading-5 text-muted">Os números são calculados somente com dados liberados pelas policies para o usuário atual.</p>
        </Surface>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Acesso privado</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Meus grupos</h2></div><Link to="/app/grupos" className="flex items-center gap-1 text-xs font-semibold text-petrol">Ver todos <ChevronRight size={15} /></Link></div>
        {groups.length === 0 ? <EmptyState icon={UsersRound} title="Nenhum grupo por enquanto" description="Crie um grupo ou aceite um convite para começar." /> : <Surface className="divide-y divide-line overflow-hidden">{groups.slice(0, 4).map((group) => {
          const Icon = group.type === 'house_split' ? UsersRound : Landmark
          return <Link key={group.id} to={`/app/grupos/${group.id}`} className="flex items-center gap-3 p-4 transition hover:bg-canvas sm:px-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sage text-petrol"><Icon size={19} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{group.name}</span><span className="mt-1 block text-xs text-muted">{groupTypeLabel[group.type]} · {groupValueLabel(group.type)} {currency.format(group.myValue)}</span></span><ChevronRight size={17} className="text-muted" /></Link>
        })}</Surface>}
      </section>
    </div>
  )
}
