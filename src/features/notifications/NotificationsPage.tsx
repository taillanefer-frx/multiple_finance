import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, CheckCircle2, ChevronRight, ReceiptText, SmilePlus, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateDisplay'
import { Surface } from '../../components/ui/Surface'
import { dataErrorMessage } from '../../lib/supabase/errors'
import { cn } from '../../lib/utils/cn'
import { currency } from '../../lib/utils/format'
import { useAuth } from '../auth/AuthContext'
import {
  getNotifications,
  markNotificationRead,
  notificationEmojis,
  subscribeToNotifications,
  toggleNotificationReaction,
  type AppNotification,
  type NotificationEmoji,
} from './notificationService'

function notificationTypeLabel(type: string) {
  if (type === 'expense_added') return 'Despesa do grupo'
  if (type === 'installment_added') return 'Parcelamento'
  if (type.includes('invite')) return 'Convite'
  return 'Atualização do grupo'
}

export default function NotificationsPage() {
  const { configured, loading: authLoading, user } = useAuth()
  const userId = user?.id ?? null
  const requestId = useRef(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [interactionsReady, setInteractionsReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const selected = useMemo(
    () => notifications.find((notification) => notification.id === selectedId) ?? null,
    [notifications, selectedId],
  )

  const loadNotifications = useCallback(async (silent = false) => {
    const currentRequest = ++requestId.current
    if (!silent) setLoading(true)
    setError(null)
    if (authLoading) return
    if (!configured || !userId) {
      setNotifications([])
      setLoading(false)
      return
    }

    try {
      const snapshot = await getNotifications(userId)
      if (currentRequest !== requestId.current) return
      setNotifications(snapshot.notifications)
      setInteractionsReady(snapshot.interactionsReady)
    } catch (caughtError) {
      if (currentRequest !== requestId.current) return
      setError(dataErrorMessage(caughtError, 'Não foi possível consultar suas notificações agora.'))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [authLoading, configured, userId])

  useEffect(() => {
    void loadNotifications()
    return () => { requestId.current += 1 }
  }, [loadNotifications])

  useEffect(() => {
    if (!configured || authLoading || !userId) return
    return subscribeToNotifications(userId, interactionsReady, () => { void loadNotifications(true) })
  }, [authLoading, configured, interactionsReady, loadNotifications, userId])

  async function markRead(notification: AppNotification) {
    if (!userId || notification.readAt) return
    setBusyKey(`read:${notification.id}`)
    setActionError(null)
    try {
      await markNotificationRead(notification.id, userId)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
    } catch (caughtError) {
      setActionError(dataErrorMessage(caughtError, 'Não foi possível marcar este aviso como lido.'))
    } finally {
      setBusyKey(null)
    }
  }

  async function react(notification: AppNotification, emoji: NotificationEmoji) {
    if (!userId || !interactionsReady) return
    const active = notification.reactions.some((item) => item.emoji === emoji && item.reactedByMe)
    setBusyKey(`reaction:${notification.id}:${emoji}`)
    setActionError(null)
    try {
      await toggleNotificationReaction(notification, userId, emoji, active)
      await loadNotifications(true)
    } catch (caughtError) {
      setActionError(dataErrorMessage(caughtError, 'Não foi possível salvar sua reação.'))
    } finally {
      setBusyKey(null)
    }
  }

  function openDetails(notification: AppNotification) {
    setSelectedId(notification.id)
    setActionError(null)
  }

  if (loading) return <LoadingState label="Buscando suas notificações…" />
  if (error) return <ErrorState title="Não foi possível abrir as notificações" description={error} onRetry={() => void loadNotifications()} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold tracking-tight text-ink">Tudo em dia</h2><p className="mt-1 text-sm text-muted">Sua central privada de avisos e interações dos grupos.</p></div>
        {!configured && <DemoBadge />}
      </div>

      {!interactionsReady && configured && (
        <p className="rounded-2xl bg-amber/10 px-4 py-3 text-xs leading-5 text-amber">
          Valores, detalhes compartilhados e reações ficam disponíveis após aplicar a migration 011. As notificações atuais continuam visíveis.
        </p>
      )}
      {actionError && !selected && <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-danger">{actionError}</p>}

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="Nenhuma notificação por enquanto" description="Quando houver uma despesa, parcelamento ou lembrete dos seus grupos, o aviso aparecerá aqui." />
      ) : (
        <Surface className="divide-y divide-line overflow-hidden">
          {notifications.map((notification) => (
            <article key={notification.id} className={cn('p-4 sm:px-5', !notification.readAt && 'bg-sage/35')}>
              <div className="flex gap-3">
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', notification.readAt ? 'bg-canvas text-muted' : 'bg-sage text-petrol')}>
                  {notification.readAt ? <CheckCircle2 size={18} /> : <Bell size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-sm font-semibold text-ink">{notification.title}</h3><p className="mt-0.5 text-[11px] font-medium text-petrol">{notification.groupName}</p></div>
                    <time className="shrink-0 text-[11px] text-muted">{new Date(notification.createdAt).toLocaleDateString('pt-BR')}</time>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{notification.message}</p>
                  {notification.amount !== null && <p className="mt-2 text-base font-semibold text-ink">{currency.format(notification.amount)}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0 sm:pl-[3.25rem]">
                <div className="flex flex-wrap gap-1.5">
                  {notification.reactions.map((reaction) => (
                    <button key={reaction.emoji} type="button" disabled={!interactionsReady || busyKey !== null} onClick={() => void react(notification, reaction.emoji)} className={cn('rounded-full border px-2.5 py-1 text-xs transition', reaction.reactedByMe ? 'border-petrol/25 bg-sage text-petrol' : 'border-line bg-white text-muted')}>
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {!notification.readAt && <button type="button" disabled={busyKey !== null} onClick={() => void markRead(notification)} className="text-xs font-semibold text-muted">Marcar como lida</button>}
                  <button type="button" onClick={() => openDetails(notification)} className="flex items-center gap-1 text-xs font-semibold text-petrol">Ver detalhes <ChevronRight size={14} /></button>
                </div>
              </div>
            </article>
          ))}
        </Surface>
      )}

      <BottomSheet open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.title ?? 'Detalhes'} description={selected ? notificationTypeLabel(selected.type) : undefined}>
        {selected && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-canvas p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-petrol"><UsersRound size={15} /> {selected.groupName}</div>
              <p className="mt-3 text-base font-semibold text-ink">{selected.message}</p>
              {selected.amount !== null && <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{currency.format(selected.amount)}</p>}
              <p className="mt-2 text-xs text-muted">{new Date(selected.createdAt).toLocaleString('pt-BR')}</p>
            </div>

            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted"><SmilePlus size={15} /> Reações dos membros</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {notificationEmojis.map((emoji) => {
                  const summary = selected.reactions.find((reaction) => reaction.emoji === emoji)
                  const active = Boolean(summary?.reactedByMe)
                  return <button key={emoji} type="button" disabled={!interactionsReady || busyKey !== null} onClick={() => void react(selected, emoji)} className={cn('rounded-full border px-3 py-2 text-sm transition', active ? 'border-petrol/30 bg-sage text-petrol' : 'border-line bg-white text-muted')}>{emoji}{summary ? ` ${summary.count}` : ''}</button>
                })}
              </div>
              {!interactionsReady && <p className="mt-2 text-xs text-amber">Aplique a migration 011 para liberar as reações.</p>}
            </div>

            {actionError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-danger">{actionError}</p>}

            <div className="grid gap-2 sm:grid-cols-2">
              {!selected.readAt ? <Button variant="secondary" disabled={busyKey !== null} onClick={() => void markRead(selected)}><Check size={16} /> Marcar como lida</Button> : <div className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-sage px-4 text-sm font-semibold text-petrol"><CheckCircle2 size={16} /> Notificação lida</div>}
              <Link to={`/app/grupos/${selected.groupId}`} onClick={() => setSelectedId(null)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-petrol px-4 text-sm font-semibold text-white"><ReceiptText size={16} /> Abrir grupo</Link>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
