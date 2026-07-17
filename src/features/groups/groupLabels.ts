import type { GroupType } from './types'

export const groupTypeLabel: Record<GroupType, string> = {
  house_split: 'Divisão de casa',
  balance_control: 'Controle de saldo',
}

export function groupValueLabel(type: GroupType, mine = true, name?: string) {
  if (mine) return type === 'house_split' ? 'Minha parte' : 'Meu saldo'
  return type === 'house_split' ? `Parte de ${name || 'membro'}` : `Saldo de ${name || 'membro'}`
}
