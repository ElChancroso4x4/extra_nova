import Papa from 'papaparse'
import { categorizeTransaction } from './categorize'
import type { Transaction } from './types'

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

const DATE_ALIASES = ['fecha', 'date', 'fecha_operacion', 'fecha_de_operacion', 'value_date']
const DESC_ALIASES = [
  'descripcion',
  'description',
  'concepto',
  'detalle',
  'memo',
  'referencia',
]
const AMOUNT_ALIASES = ['monto', 'amount', 'importe', 'cargo', 'abono', 'valor']
const ACCOUNT_ALIASES = ['cuenta', 'account', 'tarjeta', 'producto']
const DEBIT_ALIASES = ['cargo', 'retiro', 'debit', 'cargos']
const CREDIT_ALIASES = ['abono', 'deposito', 'depósito', 'credit', 'abonos']

function pickField(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias]
  }
  return undefined
}

function parseAmount(raw: string): number {
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : NaN
}

function uid(): string {
  return crypto.randomUUID()
}

export type ParseResult = {
  transactions: Transaction[]
  errors: string[]
}

export function parseStatementCsv(csvText: string, defaultAccount = 'Cuenta'): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })

  const errors: string[] = [...(parsed.errors.map((e) => e.message) ?? [])]
  const transactions: Transaction[] = []

  for (const [index, row] of (parsed.data ?? []).entries()) {
    const date = pickField(row, DATE_ALIASES)
    const description = pickField(row, DESC_ALIASES) ?? 'Sin descripción'
    const account = pickField(row, ACCOUNT_ALIASES) ?? defaultAccount

    let amount: number | undefined
    const amountRaw = pickField(row, AMOUNT_ALIASES)
    if (amountRaw) {
      amount = parseAmount(amountRaw)
    } else {
      const debit = pickField(row, DEBIT_ALIASES)
      const credit = pickField(row, CREDIT_ALIASES)
      if (debit && parseAmount(debit)) amount = -Math.abs(parseAmount(debit))
      else if (credit && parseAmount(credit)) amount = Math.abs(parseAmount(credit))
    }

    if (!date || amount === undefined || Number.isNaN(amount)) {
      errors.push(`Fila ${index + 2}: no se pudo leer fecha/monto`)
      continue
    }

    // Convención: egresos negativos. Si el CSV trae cargos positivos sin signo, detectamos columna "cargo"
    const looksLikeExpenseColumn =
      Object.keys(row).some((k) => DEBIT_ALIASES.includes(k) && row[k]) && amount > 0

    const signed = looksLikeExpenseColumn ? -Math.abs(amount) : amount

    transactions.push({
      id: uid(),
      date: date.slice(0, 10),
      description: description.trim(),
      amount: signed,
      account,
      category: categorizeTransaction(description, signed),
      source: 'csv',
    })
  }

  return { transactions, errors }
}
