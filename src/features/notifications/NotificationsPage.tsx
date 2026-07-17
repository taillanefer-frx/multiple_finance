import { Bell } from 'lucide-react'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState } from '../../components/ui/StateDisplay'

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold tracking-tight text-ink">Tudo em dia</h2><p className="mt-1 text-sm text-muted">Avisos importantes dos seus grupos aparecerão aqui.</p></div>
        <DemoBadge />
      </div>
      <EmptyState
        icon={Bell}
        title="Nenhuma notificação por enquanto"
        description="Quando houver um novo convite, despesa ou lembrete, você verá a atualização neste espaço."
        actionLabel="Atualizar"
        onAction={() => undefined}
      />
    </div>
  )
}
