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

const DATE_ALIASES = [
  'fecha',
  'date',
  'fecha_operacion',
  'fecha_de_operacion',
  'fecha_valor',
  'value_date',
  'fecha_movimiento',
]
const DESC_ALIASES = [
  'descripcion',
  'description',
  'concepto',
  'detalle',
  'memo',
  'referencia',
  'descripcion_operacion',
  'nombre',
]
const AMOUNT_ALIASES = ['monto', 'amount', 'importe', 'valor', 'cantidad']
const ACCOUNT_ALIASES = ['cuenta', 'account', 'tarjeta', 'producto', 'origen']
const DEBIT_ALIASES = ['cargo', 'retiro', 'debit', 'cargos', 'cargos_mxn']
const CREDIT_ALIASES = ['abono', 'deposito', 'depositos', 'credit', 'abonos', 'abonos_mxn']

function pickField(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias]
    if (value !== undefined && String(value).trim() !== '') return String(value).trim()
  }
  return undefined
}

/** Soporta 1850.40, 1,850.40, 1.850,40 y ($1,850.40) */
export function parseAmount(raw: string): number {
  let text = raw.trim()
  if (!text) return NaN

  const negative = /^\(.*\)$/.test(text) || text.startsWith('-')
  text = text
    .replace(/[()$]/g, '')
    .replace(/MXN/gi, '')
    .replace(/\s/g, '')
    .replace(/^-/, '')

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')

  if (lastComma > lastDot) {
    // Formato MX/EU: 1.850,40
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // Formato US: 1,850.40
    text = text.replace(/,/g, '')
  } else if (lastComma !== -1 && lastDot === -1) {
    // Solo coma: 1850,40 o 1,850
    const parts = text.split(',')
    text = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : text.replace(/,/g, '')
  }

  const n = Number.parseFloat(text)
  if (!Number.isFinite(n)) return NaN
  return negative ? -Math.abs(n) : n
}

/** Acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY */
export function normalizeDate(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    let year = dmy[3]
    if (year.length === 2) year = Number(year) > 70 ? `19${year}` : `20${year}`
    return `${year}-${month}-${day}`
  }

  const parsed = Date.parse(text)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10)
  }
  return null
}

function uid(): string {
  return crypto.randomUUID()
}

export type ParseResult = {
  transactions: Transaction[]
  errors: string[]
  detectedFormat: 'simple' | 'cargo_abono' | 'desconocido'
}

function resolveAmount(row: Record<string, string>): { amount?: number; format: ParseResult['detectedFormat'] } {
  const debitRaw = pickField(row, DEBIT_ALIASES)
  const creditRaw = pickField(row, CREDIT_ALIASES)

  if (debitRaw || creditRaw) {
    const debit = debitRaw ? parseAmount(debitRaw) : 0
    const credit = creditRaw ? parseAmount(creditRaw) : 0
    if (debitRaw && !Number.isNaN(debit) && debit !== 0) {
      return { amount: -Math.abs(debit), format: 'cargo_abono' }
    }
    if (creditRaw && !Number.isNaN(credit) && credit !== 0) {
      return { amount: Math.abs(credit), format: 'cargo_abono' }
    }
  }

  const amountRaw = pickField(row, AMOUNT_ALIASES)
  if (amountRaw) {
    const amount = parseAmount(amountRaw)
    if (!Number.isNaN(amount)) return { amount, format: 'simple' }
  }

  return { format: 'desconocido' }
}

export function parseStatementCsv(csvText: string, defaultAccount = 'Cuenta'): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  })

  const errors: string[] = [...(parsed.errors.map((e) => e.message) ?? [])]
  const transactions: Transaction[] = []
  let detectedFormat: ParseResult['detectedFormat'] = 'desconocido'

  for (const [index, row] of (parsed.data ?? []).entries()) {
    // Ignora filas totalmente vacías / totales
    const values = Object.values(row).map((v) => String(v ?? '').trim())
    if (values.every((v) => !v)) continue
    if (values.some((v) => /^total/i.test(v))) continue

    const dateRaw = pickField(row, DATE_ALIASES)
    const date = dateRaw ? normalizeDate(dateRaw) : null
    const description = pickField(row, DESC_ALIASES) ?? 'Sin descripción'
    const account = pickField(row, ACCOUNT_ALIASES) ?? defaultAccount
    const { amount, format } = resolveAmount(row)

    if (format !== 'desconocido') detectedFormat = format

    if (!date || amount === undefined || Number.isNaN(amount)) {
      errors.push(`Fila ${index + 2}: no se pudo leer fecha/monto`)
      continue
    }

    transactions.push({
      id: uid(),
      date,
      description: description.trim(),
      amount,
      account,
      category: categorizeTransaction(description, amount),
      source: 'csv',
    })
  }

  if (transactions.length > 0 && detectedFormat === 'desconocido') {
    detectedFormat = 'simple'
  }

  return { transactions, errors, detectedFormat }
}

/** Mes más frecuente en un lote importado (YYYY-MM) */
export function dominantMonth(transactions: Transaction[]): string | null {
  if (transactions.length === 0) return null
  const counts = new Map<string, number>()
  for (const tx of transactions) {
    const key = tx.date.slice(0, 7)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
