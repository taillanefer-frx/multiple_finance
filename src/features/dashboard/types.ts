export type PersonalTransactionType = 'income' | 'expense'
export type PersonalLedgerSource = 'personal' | 'group'

export interface PersonalTransaction {
  id: string
  userId: string
  type: PersonalTransactionType
  description: string
  amount: number
  category: string
  occurredOn: string
  competenceMonth: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonalTransactionInput {
  type: PersonalTransactionType
  description: string
  amount: number
  category: string
  occurredOn: string
  competenceMonth: string
  notes: string | null
}

export interface PersonalLedgerItem {
  id: string
  source: PersonalLedgerSource
  sourceId: string
  type: PersonalTransactionType
  description: string
  amount: number
  category: string
  occurredOn: string
  competenceMonth: string
  notes: string | null
  editable: boolean
  groupId: string | null
  groupName: string | null
  expenseType: string | null
}

export interface PersonalCategoryTotal {
  key: string
  label: string
  color: string
  amount: number
  count: number
}

export interface PersonalFinanceSummary {
  income: number
  personalExpenses: number
  groupExpenses: number
  totalExpenses: number
  balance: number
}

export interface PersonalFinanceSnapshot {
  personalReady: boolean
  transactions: PersonalTransaction[]
  items: PersonalLedgerItem[]
  categories: PersonalCategoryTotal[]
  summary: PersonalFinanceSummary
}
