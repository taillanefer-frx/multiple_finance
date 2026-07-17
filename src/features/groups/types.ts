export type GroupType = 'house_split' | 'balance_control'
export type GroupRole = 'admin' | 'member'

export interface GroupSummary {
  id: string
  name: string
  type: GroupType
  role: GroupRole
  memberCount: number
  monthTotal: number
  myValue: number
}

export interface GroupMemberSummary {
  membershipId: string
  userId: string
  displayName: string
  avatarUrl: string | null
  role: GroupRole
  isCurrentUser: boolean
  isOwner: boolean
  value: number
  paidValue: number
  pendingValue: number
}

export type ExpenseType = 'fixed' | 'variable' | 'one_time' | 'installment'
export type ExpenseStatus = 'open' | 'paid' | 'overdue' | 'review' | 'cancelled'

export interface ExpenseParticipantSummary {
  userId: string
  displayName: string
  shareAmount: number
  sharePercent: number | null
  included: boolean
}

export interface ExpenseReceiptSummary {
  id: string
  storagePath: string
  originalFilename: string
  status: string
}

export interface GroupExpenseSummary {
  id: string
  title: string
  amount: number
  category: string
  type: ExpenseType
  purchaseDate: string
  dueDate: string | null
  status: ExpenseStatus
  paidByUserId: string | null
  installmentId: string | null
  paidBy: string
  notes: string | null
  participants: ExpenseParticipantSummary[]
  receipt: ExpenseReceiptSummary | null
}

export interface ExpenseCategorySummary {
  key: string
  label: string
  amount: number
  count: number
}

export interface BalanceMovementSummary {
  id: string
  userId: string
  displayName: string
  type: 'income' | 'expense'
  amount: number
  description: string
  movementDate: string
  notes: string | null
  createdAt: string
  relatedExpenseId: string | null
}

export interface BalanceInstallmentSummary {
  id: string
  title: string
  totalAmount: number
  installmentAmount: number
  totalInstallments: number
  currentInstallment: number
  remainingInstallments: number
  dueDay: number
  nextDueDate: string
  firstDueDate: string | null
  cardLabel: string | null
  notes: string | null
  paidByUserId: string | null
  responsibleName: string
  active: boolean
}

export interface BalanceParticipantSummary {
  userId: string
  displayName: string
  isCurrentUser: boolean
  configured: boolean
  startingBalance: number
  currentBalance: number
}

export interface BalanceControlSummary {
  accountId: string | null
  configured: boolean
  startingBalance: number
  incomeTotal: number
  expenseTotal: number
  currentBalance: number
  notes: string | null
  movements: BalanceMovementSummary[]
  installments: BalanceInstallmentSummary[]
  participants: BalanceParticipantSummary[]
  categories: ExpenseCategorySummary[]
  upcomingExpenses: GroupExpenseSummary[]
}

export interface GroupDetails {
  id: string
  name: string
  type: GroupType
  ownerId: string
  currentUserRole: GroupRole
  monthTotal: number
  myValue: number
  myPaidValue: number
  myPendingValue: number
  confirmedExpenseCount: number
  paidGroupValue: number
  pendingGroupValue: number
  reviewValue: number
  monthStatus: 'empty' | 'in_progress' | 'attention' | 'paid'
  selectedMonth: number
  selectedYear: number
  nextDue: GroupExpenseSummary | null
  upcomingExpenses: GroupExpenseSummary[]
  categories: ExpenseCategorySummary[]
  members: GroupMemberSummary[]
  expenses: GroupExpenseSummary[]
  balanceControl: BalanceControlSummary | null
}

export interface InvitePreview {
  groupName: string
  groupType: GroupType
}
