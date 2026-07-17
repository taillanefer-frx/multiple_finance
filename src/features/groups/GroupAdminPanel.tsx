import { useState } from 'react'
import { Archive, CheckCircle2, Copy, Link2, Pencil, ShieldCheck, UserMinus, UsersRound } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Surface } from '../../components/ui/Surface'
import { currency } from '../../lib/utils/format'
import { archiveGroup, generateGroupInvite, removeGroupMember, updateGroupName } from './groupService'
import { groupValueLabel } from './groupLabels'
import type { GroupDetails, GroupMemberSummary } from './types'

type AdminAction = 'edit' | 'invite' | 'archive' | 'remove' | null

interface GroupAdminPanelProps {
  group: GroupDetails
  userId: string
  showMembers?: boolean
  onRefresh: () => Promise<void>
  onArchived: () => void
}

export function GroupAdminPanel({ group, userId, showMembers = true, onRefresh, onArchived }: GroupAdminPanelProps) {
  const [action, setAction] = useState<AdminAction>(null)
  const [selectedMember, setSelectedMember] = useState<GroupMemberSummary | null>(null)
  const [name, setName] = useState(group.name)
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = group.currentUserRole === 'admin'

  function open(nextAction: AdminAction, member: GroupMemberSummary | null = null) {
    setAction(nextAction)
    setSelectedMember(member)
    setName(group.name)
    setInviteUrl('')
    setCopied(false)
    setError(null)
  }

  function close() {
    if (!busy) setAction(null)
  }

  async function run(task: () => Promise<void>, after?: () => void | Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
      await after?.()
      setBusy(false)
    } catch {
      setBusy(false)
      setError('Não foi possível concluir esta ação. Confirme sua permissão e tente novamente.')
    }
  }

  async function createInvite() {
    await run(async () => {
      const token = await generateGroupInvite(group.id, userId)
      setInviteUrl(`${window.location.origin}/convite/${token}`)
    })
  }

  async function copyInvite() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="space-y-4">
      {showMembers && <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Participantes</p><h3 className="mt-1 font-semibold text-ink">{group.members.length} membros ativos</h3></div><UsersRound size={19} className="text-muted" /></div>
        <div className="divide-y divide-line">
          {group.members.map((member) => (
            <div key={member.membershipId} className="flex items-center gap-3 p-4 sm:px-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sage text-xs font-semibold text-petrol">{member.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{member.isCurrentUser ? 'Você' : member.displayName}</p><p className="mt-0.5 text-xs text-muted">{member.role === 'admin' ? 'Administrador' : 'Membro'} · {groupValueLabel(group.type, member.isCurrentUser, member.displayName)} {currency.format(member.value)}</p></div>
              {isAdmin && !member.isCurrentUser && !member.isOwner && <button onClick={() => open('remove', member)} className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-red-50 hover:text-danger" aria-label={`Remover ${member.displayName}`}><UserMinus size={17} /></button>}
            </div>
          ))}
        </div>
      </Surface>}

      {isAdmin && (
        <Surface className="p-5">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-positive" /><p className="text-sm font-semibold text-ink">Administração do grupo</p></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Button variant="secondary" onClick={() => open('edit')}><Pencil size={16} /> Editar nome</Button>
            <Button variant="secondary" onClick={() => open('invite')}><Link2 size={16} /> Gerar convite</Button>
            <Button variant="danger" onClick={() => open('archive')}><Archive size={16} /> Arquivar</Button>
          </div>
        </Surface>
      )}

      <Modal open={action === 'edit'} onClose={close} title="Editar nome" description="A alteração aparecerá para todos os membros.">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="h-12 w-full rounded-2xl border border-line px-4 text-sm" />
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <Button className="mt-5" fullWidth disabled={!name.trim() || busy} onClick={() => run(() => updateGroupName(group.id, name), async () => { await onRefresh(); setAction(null) })}>{busy ? 'Salvando…' : 'Salvar nome'}</Button>
      </Modal>

      <Modal open={action === 'invite'} onClose={close} title="Convidar para o grupo" description="Somente quem possuir o link e entrar na própria conta poderá aceitar.">
        {!inviteUrl ? <Button fullWidth onClick={createInvite} disabled={busy}>{busy ? 'Gerando…' : 'Gerar link privado'} <Link2 size={16} /></Button> : <div><label className="text-xs font-semibold text-ink">Link de convite</label><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-xs text-ink" /><Button className="mt-3" fullWidth variant="secondary" onClick={copyInvite}>{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />} {copied ? 'Link copiado' : 'Copiar link'}</Button></div>}
        {error && <p className="mt-3 text-xs leading-5 text-danger">{error}</p>}
      </Modal>

      <Modal open={action === 'archive'} onClose={close} title="Arquivar grupo?" description="O grupo deixará de aparecer na lista ativa. Os dados não serão apagados.">
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <div className="flex gap-3"><Button variant="secondary" fullWidth onClick={close}>Cancelar</Button><Button variant="danger" fullWidth disabled={busy} onClick={() => run(() => archiveGroup(group.id), onArchived)}>{busy ? 'Arquivando…' : 'Arquivar'}</Button></div>
      </Modal>

      <Modal open={action === 'remove'} onClose={close} title={`Remover ${selectedMember?.displayName || 'membro'}?`} description="Essa pessoa perderá o acesso imediato aos dados privados do grupo.">
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <div className="flex gap-3"><Button variant="secondary" fullWidth onClick={close}>Cancelar</Button><Button variant="danger" fullWidth disabled={busy || !selectedMember} onClick={() => selectedMember && run(() => removeGroupMember(group.id, selectedMember.membershipId), async () => { await onRefresh(); setAction(null) })}>{busy ? 'Removendo…' : 'Remover membro'}</Button></div>
      </Modal>
    </div>
  )
}
