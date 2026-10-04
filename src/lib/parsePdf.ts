import { categorizeTransaction } from './categorize'
import { normalizeDate, parseAmount } from './parseCsv'
import type { Transaction } from './types'

let workerConfigured = false

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  if (!workerConfigured) {
    if (import.meta.env.MODE === 'test') {
      // Vitest/jsdom: fake-worker needs a file:// URL to the legacy worker.
      const [{ createRequire }, { pathToFileURL }] = await Promise.all([
        import('node:module'),
        import('node:url'),
      ])
      const require = createRequire(import.meta.url)
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
      ).href
    } else if (typeof window !== 'undefined') {
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    }
    workerConfigured = true
  }
  return pdfjs
}

function uid(): string {
  return crypto.randomUUID()
}

const AMOUNT_TOKEN =
  /([(+-]?\s*\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\(?\s*\$?\s*\d+(?:[.,]\d{2})?)\s*(?:MXN)?\)?/gi

const DATE_AT_START =
  /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s+|[,|]\s*)(.+)$/

const SKIP_LINE =
  /^(fecha|concepto|descripcion|descripción|cargo|abono|monto|importe|saldo|total|page|pagina|página|estado\s+de\s+cuenta|movimientos|detalle)/i

const INCOME_HINT =
  /\b(nomina|nómina|deposito|depósito|abono|spei\s+recib|transferencia\s+recib|interes|interés|reembolso|devolucion|devolución|payroll|salary)\b/i

export type PdfDetectedFormat = 'pdf_line_simple' | 'pdf_cargo_abono' | 'pdf_desconocido'

export type PdfParseResult = {
  transactions: Transaction[]
  errors: string[]
  detectedFormat: PdfDetectedFormat
  bankHint?: string
  extractedText?: string
}

export function detectBankHint(text: string): string | undefined {
  const lower = text.toLowerCase()
  if (lower.includes('santander')) return 'Santander'
  if (lower.includes('mercado pago') || lower.includes('mercadopago')) return 'Mercado Pago'
  if (lower.includes('bbva')) return 'BBVA'
  if (lower.includes('banorte')) return 'Banorte'
  if (lower.includes('hsbc')) return 'HSBC'
  if (lower.includes('banamex') || lower.includes('citibanamex')) return 'Citibanamex'
  return undefined
}

function detectFormat(text: string): PdfDetectedFormat {
  const lower = text.toLowerCase()
  const hasCargo = /\bcargos?\b/.test(lower)
  const hasAbono = /\babonos?\b/.test(lower)
  if (hasCargo && hasAbono) return 'pdf_cargo_abono'
  if (/\b(monto|importe|amount)\b/.test(lower)) return 'pdf_line_simple'
  return 'pdf_desconocido'
}

function isSkippable(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (SKIP_LINE.test(t)) return true
  if (/^total\b/i.test(t)) return true
  if (/saldo\s+(inicial|final|anterior|actual)/i.test(t)) return true
  if (/^\d+\s*\/\s*\d+$/.test(t)) return true
  return false
}

function findAmountMatches(text: string): Array<{ raw: string; index: number; value: number }> {
  const matches: Array<{ raw: string; index: number; value: number }> = []
  for (const match of text.matchAll(AMOUNT_TOKEN)) {
    const raw = match[0]
    const value = parseAmount(raw)
    if (Number.isNaN(value)) continue
    // Ignore lone years / tiny integers that are likely not money in this context
    if (!/[.,]/.test(raw) && Math.abs(value) >= 1900 && Math.abs(value) <= 2100) continue
    matches.push({ raw, index: match.index ?? 0, value })
  }
  return matches
}

function resolveLineAmount(
  description: string,
  amounts: Array<{ value: number }>,
  format: PdfDetectedFormat,
): { amount?: number; format: PdfDetectedFormat } {
  if (amounts.length === 0) return { format }

  if (format === 'pdf_cargo_abono') {
    if (amounts.length >= 2) {
      const cargo = amounts[amounts.length - 2].value
      const abono = amounts[amounts.length - 1].value
      if (cargo !== 0) return { amount: -Math.abs(cargo), format: 'pdf_cargo_abono' }
      if (abono !== 0) return { amount: Math.abs(abono), format: 'pdf_cargo_abono' }
    }
    const only = amounts[amounts.length - 1].value
    // Single amount: income keywords → credit; otherwise treat as cargo
    if (INCOME_HINT.test(description)) {
      return { amount: Math.abs(only), format: 'pdf_cargo_abono' }
    }
    return { amount: -Math.abs(only), format: 'pdf_cargo_abono' }
  }

  // Simple / unknown: keep signed amount; if unsigned expense-looking, leave as-is
  const only = amounts[amounts.length - 1].value
  if (format === 'pdf_desconocido' && only > 0 && !INCOME_HINT.test(description)) {
    // Many MX PDFs omit the minus sign on cargos
    return { amount: -Math.abs(only), format: 'pdf_line_simple' }
  }
  return { amount: only, format: format === 'pdf_desconocido' ? 'pdf_line_simple' : format }
}

/**
 * Parse plain text extracted from a Mexican bank-statement PDF into transactions.
 * Works on line-oriented layouts (Fecha + Concepto + Monto / Cargo / Abono).
 */
export function parseStatementPdfText(
  text: string,
  defaultAccount = 'Cuenta PDF',
): PdfParseResult {
  const errors: string[] = []
  const transactions: Transaction[] = []
  const bankHint = detectBankHint(text)
  let detectedFormat = detectFormat(text)
  const account = bankHint ?? defaultAccount

  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  let parsedLines = 0

  for (const [index, line] of lines.entries()) {
    if (isSkippable(line)) continue

    const dated = line.match(DATE_AT_START)
    if (!dated) continue

    const date = normalizeDate(dated[1])
    let rest = dated[2].trim()
    if (!date) {
      errors.push(`Línea ${index + 1}: fecha inválida «${dated[1]}»`)
      continue
    }

    const amounts = findAmountMatches(rest)
    if (amounts.length === 0) {
      errors.push(`Línea ${index + 1}: no se encontró monto`)
      continue
    }

    // Description = text before the last amount, with other amount tokens stripped
    const last = amounts[amounts.length - 1]
    let description = rest
      .slice(0, last.index)
      .replace(AMOUNT_TOKEN, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!description) description = 'Sin descripción'

    // Ignore balance-only rows
    if (/^saldo\b/i.test(description)) continue

    const resolved = resolveLineAmount(description, amounts, detectedFormat)
    if (resolved.format !== 'pdf_desconocido') detectedFormat = resolved.format

    if (resolved.amount === undefined || Number.isNaN(resolved.amount)) {
      errors.push(`Línea ${index + 1}: no se pudo interpretar el monto`)
      continue
    }

    parsedLines += 1
    transactions.push({
      id: uid(),
      date,
      description,
      amount: resolved.amount,
      account,
      category: categorizeTransaction(description, resolved.amount),
      source: 'pdf',
    })
  }

  if (transactions.length === 0) {
    errors.unshift(
      'No se reconocieron movimientos en el PDF. Prueba un estado con filas «fecha + concepto + monto» (o Cargo/Abono), o usa CSV.',
    )
  } else if (detectedFormat === 'pdf_desconocido') {
    detectedFormat = 'pdf_line_simple'
  }

  if (parsedLines > 0 && transactions.length < parsedLines) {
    // no-op; errors already captured
  }

  return { transactions, errors, detectedFormat, bankHint }
}

/**
 * Extract readable text from a PDF ArrayBuffer using pdf.js (client-side).
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const { getDocument } = await loadPdfJs()
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const pages: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const parts: string[] = []
    let lastY: number | undefined

    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[] }
      const str = typeof item.str === 'string' ? item.str : ''
      if (!str) continue
      const y = item.transform?.[5]
      if (lastY !== undefined && y !== undefined && Math.abs(lastY - y) > 2) {
        parts.push('\n')
      } else if (parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
        parts.push(' ')
      }
      parts.push(str)
      if (y !== undefined) lastY = y
    }
    pages.push(parts.join('').replace(/[ \t]+\n/g, '\n'))
  }

  return pages.join('\n')
}

/** Full pipeline: PDF bytes → text → transactions (same model as CSV). */
export async function parseStatementPdf(
  data: ArrayBuffer,
  defaultAccount = 'Cuenta PDF',
): Promise<PdfParseResult> {
  try {
    const extractedText = await extractPdfText(data)
    if (!extractedText.trim()) {
      return {
        transactions: [],
        errors: [
          'El PDF no tiene texto seleccionable (puede ser escaneo/imagen). Exporta CSV o un PDF con texto.',
        ],
        detectedFormat: 'pdf_desconocido',
        extractedText,
      }
    }
    const parsed = parseStatementPdfText(extractedText, defaultAccount)
    return { ...parsed, extractedText }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al leer el PDF'
    return {
      transactions: [],
      errors: [`No se pudo abrir el PDF: ${message}`],
      detectedFormat: 'pdf_desconocido',
    }
  }
}
