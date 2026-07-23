export type GoalPriority = 'high' | 'medium' | 'low'
export type GoalStatus = 'active' | 'completed'

export interface GoalContribution {
  id: string
  amount: number
  source: 'monthly' | 'extra'
  competenceMonth: string | null
  contributedOn: string
  createdAt: string
}

export interface GoalMonthlyAmountChange {
  id: string
  previousAmount: number
  newAmount: number
  changedAt: string
}

export interface FinancialGoal {
  id: string
  name: string
  targetAmount: number
  priority: GoalPriority
  startDate: string
  desiredDate: string
  monthlyAmount: number
  status: GoalStatus
  completedAt: string | null
  contributions: GoalContribution[]
  monthlyAmountHistory: GoalMonthlyAmountChange[]
}

export interface GoalInput {
  name: string
  targetAmount: number
  priority: GoalPriority
  startDate: string
  desiredDate: string
  monthlyAmount: number
}

export interface GoalProgress {
  savedAmount: number
  remainingAmount: number
  percentage: number
  predictionMonths: number | null
  predictedDate: Date | null
  currentMonthSaved: boolean
  exceeded: boolean
}
