import type { DemoExpense } from '../../types/finance'

export const demoExpenses: DemoExpense[] = [
  { id: '1', title: 'Supermercado', category: 'Alimentação', amount: 486.2, paidBy: 'Thaiane', date: '12 jul', status: 'paid' },
  { id: '2', title: 'Conta de energia', category: 'Moradia', amount: 218.44, paidBy: 'Rafael', date: '10 jul', status: 'paid' },
  { id: '3', title: 'Internet', category: 'Serviços', amount: 119.9, paidBy: 'Thaiane', date: '08 jul', status: 'pending' },
]
