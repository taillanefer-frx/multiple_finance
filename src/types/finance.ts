export type ExpenseStatus = 'paid' | 'pending'

export interface DemoExpense {
  id: string
  title: string
  category: string
  amount: number
  paidBy: string
  date: string
  status: ExpenseStatus
}

export interface DemoGroup {
  id: string
  name: string
  description: string
  members: number
  monthTotal: number
  accent: string
}
