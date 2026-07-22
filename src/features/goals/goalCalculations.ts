import type { FinancialGoal, GoalProgress } from './types'

function cents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100)
}

export function monthStart(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function calculateGoalProgress(goal: FinancialGoal, now = new Date()): GoalProgress {
  const targetCents = Math.max(cents(goal.targetAmount), 1)
  const savedCents = goal.contributions.reduce((total, item) => total + cents(item.amount), 0)
  const remainingCents = Math.max(targetCents - savedCents, 0)
  const monthlyCents = cents(goal.monthlyAmount)
  const predictionMonths = monthlyCents > 0 ? Math.ceil(remainingCents / monthlyCents) : null
  const predictedDate = predictionMonths === null ? null : new Date(now.getFullYear(), now.getMonth() + predictionMonths, 1)
  const currentCompetence = monthStart(now)
  return {
    savedAmount: savedCents / 100,
    remainingAmount: remainingCents / 100,
    percentage: Math.min((savedCents / targetCents) * 100, 100),
    predictionMonths,
    predictedDate,
    currentMonthSaved: goal.contributions.some((item) => item.source === 'monthly' && item.competenceMonth === currentCompetence),
    exceeded: savedCents > targetCents,
  }
}

export function sortGoals(goals: FinancialGoal[]) {
  const priority = { high: 0, medium: 1, low: 2 }
  return [...goals].sort((left, right) => priority[left.priority] - priority[right.priority]
    || left.desiredDate.localeCompare(right.desiredDate)
    || left.name.localeCompare(right.name))
}
