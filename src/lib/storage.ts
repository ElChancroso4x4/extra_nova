import type { BalanceAccount, Transaction } from './types'

const TX_KEY = 'caudal.transactions.v1'
const ACC_KEY = 'caudal.accounts.v1'

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(TX_KEY)
    return raw ? (JSON.parse(raw) as Transaction[]) : []
  } catch {
    return []
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  localStorage.setItem(TX_KEY, JSON.stringify(transactions))
}

export function loadAccounts(): BalanceAccount[] {
  try {
    const raw = localStorage.getItem(ACC_KEY)
    return raw ? (JSON.parse(raw) as BalanceAccount[]) : []
  } catch {
    return []
  }
}

export function saveAccounts(accounts: BalanceAccount[]): void {
  localStorage.setItem(ACC_KEY, JSON.stringify(accounts))
}
