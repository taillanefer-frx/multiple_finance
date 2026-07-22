import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, LoaderCircle, Plus, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
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
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const requestId = useRef(0)
  const navigate = useNavigate()
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
    const currentRequest = ++requestId.current
    setLoadingGroups(true)
    setError(false)
    if (authLoading) return
    if (!configured || !userId) {
      setGroups([])
      setLoadingGroups(false)
      return
    }
    try {
      const nextGroups = await getGroupsForUser(userId)
      if (currentRequest === requestId.current) setGroups(nextGroups)
    } catch {
      if (currentRequest === requestId.current) setError(true)
    } finally {
      if (currentRequest === requestId.current) setLoadingGroups(false)
    }
  }, [authLoading, configured, userId])

  const openAddFlow = useCallback(() => {
    setOpen(true)
    setFlowGroup(activeGroup)
    setError(false)
  }, [activeGroup])

  const close = useCallback(() => {
    requestId.current += 1
    setOpen(false)
    setFlowGroup(null)
  }, [])

  useEffect(() => {
    if (open && !activeGroup && !authLoading) void loadGroupChoices()
  }, [activeGroup, authLoading, loadGroupChoices, open])

  async function selectGroup(groupId: string) {
    if (!userId) return
    const currentRequest = ++requestId.current
    setLoadingGroups(true)
    setError(false)
    try {
      const nextGroup = await getGroupDetails(groupId, userId)
      if (currentRequest === requestId.current) setFlowGroup(nextGroup)
    } catch {
      if (currentRequest === requestId.current) setError(true)
    } finally {
      if (currentRequest === requestId.current) setLoadingGroups(false)
    }
  }

  function openCreateGroup() {
    close()
    navigate('/app/grupos?novo=1')
  }

  const value = useMemo(() => ({ setActiveGroup, openAddFlow }), [openAddFlow, setActiveGroup])

  return (
    <AddFlowContext.Provider value={value}>
      {children}
      {open && flowGroup && <AddFinancialWizard key={`${flowGroup.id}-${flowGroup.selectedYear}-${flowGroup.selectedMonth}`} group={flowGroup} configured={configured} onClose={close} />}
      <BottomSheet open={open && !flowGroup} onClose={close} title="Adicionar" description="Escolha o grupo onde deseja registrar o item.">
        {!configured ? <div className="rounded-3xl border border-dashed border-line bg-canvas p-6 text-center"><UsersRound className="mx-auto text-petrol" size={24} /><p className="mt-4 text-sm font-semibold text-ink">Abra um grupo da demonstração</p><p className="mt-2 text-xs leading-5 text-muted">O fluxo de gravação fica disponível quando o Supabase está configurado.</p></div> : loadingGroups ? <div className="grid place-items-center py-12"><LoaderCircle className="animate-spin text-petrol" size={24} /><p className="mt-3 text-sm text-muted">Carregando seus grupos…</p></div> : error ? <ErrorState title="Não foi possível carregar os grupos" description="Tente novamente para escolher onde adicionar." onRetry={() => void loadGroupChoices()} /> : groups.length === 0 ? <div className="rounded-3xl border border-dashed border-line p-8 text-center"><p className="text-sm font-semibold text-ink">Nenhum grupo disponível</p><p className="mt-2 text-xs text-muted">Crie ou aceite um convite antes de adicionar um item.</p></div> : <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">{groups.map((group) => <button key={group.id} onClick={() => void selectGroup(group.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-canvas"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sage text-petrol"><UsersRound size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{group.name}</span><span className="mt-0.5 block text-xs text-muted">{group.type === 'house_split' ? 'Divisão de casa' : 'Controle de saldo'}</span></span><ChevronRight size={17} className="text-muted" /></button>)}</div>}
        <Button variant="secondary" fullWidth className="mt-4" onClick={openCreateGroup}><Plus size={17} /> Adicionar novo grupo</Button>
      </BottomSheet>
    </AddFlowContext.Provider>
  )
}

export function useAddFlow() {
  const context = useContext(AddFlowContext)
  if (!context) throw new Error('useAddFlow must be used inside AddFlowProvider')
  return context
}
