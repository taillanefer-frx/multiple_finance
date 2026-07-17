import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, LoaderCircle, UsersRound } from 'lucide-react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { ErrorState } from '../../components/ui/StateDisplay'
import { useAuth } from '../auth/AuthContext'
import { getGroupDetails, getGroupsForUser } from '../groups/groupService'
import type { GroupDetails, GroupSummary } from '../groups/types'
import { AddFinancialWizard } from './AddFinancialWizard'

interface AddFlowContextValue {
  setActiveGroup: (group: GroupDetails | null) => void
  openAddFlow: () => void
}

const AddFlowContext = createContext<AddFlowContextValue | null>(null)

export function AddFlowProvider({ children }: { children: ReactNode }) {
  const { configured, user } = useAuth()
  const [activeGroup, setActiveGroupState] = useState<GroupDetails | null>(null)
  const [flowGroup, setFlowGroup] = useState<GroupDetails | null>(null)
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [error, setError] = useState(false)

  const setActiveGroup = useCallback((group: GroupDetails | null) => {
    setActiveGroupState(group)
  }, [])

  const loadGroupChoices = useCallback(async () => {
    if (!configured || !user) return
    setLoadingGroups(true)
    setError(false)
    try {
      setGroups(await getGroupsForUser(user.id))
    } catch {
      setError(true)
    } finally {
      setLoadingGroups(false)
    }
  }, [configured, user])

  const openAddFlow = useCallback(() => {
    setOpen(true)
    setFlowGroup(activeGroup)
    setError(false)
    if (!activeGroup) void loadGroupChoices()
  }, [activeGroup, loadGroupChoices])

  const close = useCallback(() => {
    setOpen(false)
    setFlowGroup(null)
  }, [])

  async function selectGroup(groupId: string) {
    if (!user) return
    setLoadingGroups(true)
    setError(false)
    try {
      setFlowGroup(await getGroupDetails(groupId, user.id))
    } catch {
      setError(true)
    } finally {
      setLoadingGroups(false)
    }
  }

  const value = useMemo(() => ({ setActiveGroup, openAddFlow }), [openAddFlow, setActiveGroup])

  return (
    <AddFlowContext.Provider value={value}>
      {children}
      {open && flowGroup && <AddFinancialWizard key={`${flowGroup.id}-${flowGroup.selectedYear}-${flowGroup.selectedMonth}`} group={flowGroup} configured={configured} onClose={close} />}
      <BottomSheet open={open && !flowGroup} onClose={close} title="Adicionar" description="Escolha o grupo onde deseja registrar o item.">
        {!configured ? <div className="rounded-3xl border border-dashed border-line bg-canvas p-6 text-center"><UsersRound className="mx-auto text-petrol" size={24} /><p className="mt-4 text-sm font-semibold text-ink">Abra um grupo da demonstração</p><p className="mt-2 text-xs leading-5 text-muted">O fluxo de gravação fica disponível quando o Supabase está configurado.</p></div> : loadingGroups ? <div className="grid place-items-center py-12"><LoaderCircle className="animate-spin text-petrol" size={24} /><p className="mt-3 text-sm text-muted">Carregando seus grupos…</p></div> : error ? <ErrorState title="Não foi possível carregar os grupos" description="Tente novamente para escolher onde adicionar." onRetry={() => void loadGroupChoices()} /> : groups.length === 0 ? <div className="rounded-3xl border border-dashed border-line p-8 text-center"><p className="text-sm font-semibold text-ink">Nenhum grupo disponível</p><p className="mt-2 text-xs text-muted">Crie ou aceite um convite antes de adicionar um item.</p></div> : <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">{groups.map((group) => <button key={group.id} onClick={() => void selectGroup(group.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-canvas"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol"><UsersRound size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{group.name}</span><span className="mt-0.5 block text-xs text-muted">{group.type === 'house_split' ? 'Divisão de casa' : 'Controle de saldo'}</span></span><ChevronRight size={17} className="text-muted" /></button>)}</div>}
      </BottomSheet>
    </AddFlowContext.Provider>
  )
}

export function useAddFlow() {
  const context = useContext(AddFlowContext)
  if (!context) throw new Error('useAddFlow must be used inside AddFlowProvider')
  return context
}
