export type Category = 'costo_vida' | 'diversion' | 'ahorro' | 'ingreso' | 'ignorar'

export type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  account: string
  category: Category
  source: 'csv' | 'manual'
}

export type AccountKind = 'banco' | 'inversion' | 'crypto' | 'efectivo' | 'pasivo'

export type BalanceAccount = {
  id: string
  name: string
  institution: string
  kind: AccountKind
  balance: number
  currency: 'MXN' | 'USD'
  updatedAt: string
}

export type GoalTargets = {
  costo_vida: number
  diversion: number
  ahorro: number
}

/** Regla 50 / 30 / 20 sobre egresos categorizables del mes */
export const DEFAULT_GOALS: GoalTargets = {
  costo_vida: 0.5,
  diversion: 0.3,
  ahorro: 0.2,
}

export const CATEGORY_LABELS: Record<Category, string> = {
  costo_vida: 'Costo de vida',
  diversion: 'Diversión y recreación',
  ahorro: 'Ahorro',
  ingreso: 'Ingreso',
  ignorar: 'Ignorar',
}

export const KIND_LABELS: Record<AccountKind, string> = {
  banco: 'Banco',
  inversion: 'Inversión',
  crypto: 'Crypto',
  efectivo: 'Efectivo',
  pasivo: 'Pasivo',
}
