import { DEFAULT_GOALS, type Category, type GoalTargets, type Transaction } from './types'

export type CategoryTotals = Record<'costo_vida' | 'diversion' | 'ahorro', number>

export type GoalProgress = {
  totals: CategoryTotals
  totalSpend: number
  shares: CategoryTotals
  targets: GoalTargets
  deltas: CategoryTotals
  income: number
}

const ZERO: CategoryTotals = { costo_vida: 0, diversion: 0, ahorro: 0 }

export function sumByCategory(transactions: Transaction[]): CategoryTotals {
  return transactions.reduce<CategoryTotals>((acc, tx) => {
    if (tx.category === 'costo_vida' || tx.category === 'diversion' || tx.category === 'ahorro') {
      acc[tx.category] += Math.abs(tx.amount)
    }
    return acc
  }, { ...ZERO })
}

export function filterByMonth(transactions: Transaction[], yearMonth: string): Transaction[] {
  return transactions.filter((tx) => tx.date.startsWith(yearMonth))
}

export function computeGoalProgress(
  transactions: Transaction[],
  targets: GoalTargets = DEFAULT_GOALS,
): GoalProgress {
  const totals = sumByCategory(transactions)
  const totalSpend = totals.costo_vida + totals.diversion + totals.ahorro
  const income = transactions
    .filter((tx) => tx.category === 'ingreso' || tx.amount > 0)
    .reduce((s, tx) => s + Math.abs(tx.amount), 0)

  const shares: CategoryTotals =
    totalSpend === 0
      ? { ...ZERO }
      : {
          costo_vida: totals.costo_vida / totalSpend,
          diversion: totals.diversion / totalSpend,
          ahorro: totals.ahorro / totalSpend,
        }

  const deltas: CategoryTotals = {
    costo_vida: shares.costo_vida - targets.costo_vida,
    diversion: shares.diversion - targets.diversion,
    ahorro: shares.ahorro - targets.ahorro,
  }

  return { totals, totalSpend, shares, targets, deltas, income }
}

export function formatMxn(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

export function currentYearMonth(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function isBudgetCategory(
  category: Category,
): category is 'costo_vida' | 'diversion' | 'ahorro' {
  return category === 'costo_vida' || category === 'diversion' || category === 'ahorro'
}
