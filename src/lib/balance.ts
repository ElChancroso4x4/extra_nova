import type { BalanceAccount } from './types'

export type BalanceSheet = {
  assets: number
  liabilities: number
  netWorth: number
  byKind: Record<string, number>
}

export function computeBalanceSheet(accounts: BalanceAccount[]): BalanceSheet {
  const byKind: Record<string, number> = {}
  let assets = 0
  let liabilities = 0

  for (const account of accounts) {
    const value = account.currency === 'USD' ? account.balance * 17 : account.balance
    byKind[account.kind] = (byKind[account.kind] ?? 0) + value

    if (account.kind === 'pasivo' || value < 0) {
      liabilities += Math.abs(value)
    } else {
      assets += value
    }
  }

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    byKind,
  }
}
