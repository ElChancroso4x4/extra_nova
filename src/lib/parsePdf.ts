import { categorizeTransaction } from './categorize'
import { normalizeDate, parseAmount } from './parseCsv'
import { ensurePdfJsBinaryPolyfills } from './pdfCompat'
import type { Transaction } from './types'

let workerConfigured = false
let workerBlobUrl: string | null = null

const PDF_PARSE_TIMEOUT_MS = 60_000
/** Soft cap — very large bank PDFs are usually scans; prefer CSV/XML. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024

/**
 * Resolve pdf.js workerSrc for the current origin + Vite BASE_URL.
 * Always returns an absolute URL so module workers work under `/extra_nova/presupuesto/`.
 */
export function resolvePdfWorkerSrc(
  workerUrl: string = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`,
  baseUrl: string = import.meta.env.BASE_URL,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string {
  const raw = (workerUrl || '').trim()
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('file:')) {
    return raw
  }

  // Absolute site path (e.g. `/extra_nova/pdf.worker.min.mjs`)
  if (raw.startsWith('/')) {
    return new URL(raw, origin).href
  }

  // Relative fallback — join with BASE_URL then origin
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const rel = raw.replace(/^\.\//, '')
  return new URL(`${base}${rel}`, origin).href
}

/**
 * Fetch the worker and re-wrap as a blob URL with an explicit JS MIME type.
 * Helps Safari / strict hosts that serve `.mjs` with awkward Content-Types.
 */
async function resolveWorkerSrcPreferBlob(absoluteUrl: string): Promise<string> {
  if (typeof fetch !== 'function' || typeof URL.createObjectURL !== 'function') {
    return absoluteUrl
  }
  try {
    const res = await fetch(absoluteUrl, { credentials: 'same-origin' })
    if (!res.ok) return absoluteUrl
    const buf = await res.arrayBuffer()
    if (workerBlobUrl) {
      try {
        URL.revokeObjectURL(workerBlobUrl)
      } catch {
        /* ignore */
      }
    }
    const blob = new Blob([buf], { type: 'text/javascript' })
    workerBlobUrl = URL.createObjectURL(blob)
    return workerBlobUrl
  } catch {
    return absoluteUrl
  }
}

async function loadPdfJs() {
  ensurePdfJsBinaryPolyfills()
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
    } else {
      const absolute = resolvePdfWorkerSrc()
      pdfjs.GlobalWorkerOptions.workerSrc = await resolveWorkerSrcPreferBlob(absolute)
    }
    workerConfigured = true
  }
  return pdfjs
}

function uid(): string {
  return crypto.randomUUID()
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

const AMOUNT_TOKEN =
  /([(+-]?\s*\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\(?\s*\$?\s*\d+(?:[.,]\d{2})?)\s*(?:MXN)?\)?/gi

const DATE_AT_START =
  /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s+|[,|]\s*)(.+)$/

const DATE_ONLY = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})$/
const DATE_ANYWHERE =
  /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/

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
 * Real bank PDFs often split a row across lines (date / concept / amounts).
 * Coalesce date-only lines with the following concept+amount fragments.
 */
export function coalescePdfLines(rawLines: string[]): string[] {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (DATE_ONLY.test(line)) {
      const parts = [line]
      let j = i + 1
      let sawAmount = false
      while (j < lines.length && j < i + 6) {
        const next = lines[j]!
        if (DATE_ONLY.test(next) || DATE_AT_START.test(next)) break
        if (isSkippable(next) && !findAmountMatches(next).length) {
          j += 1
          continue
        }
        parts.push(next)
        if (findAmountMatches(next).length) {
          sawAmount = true
          // Keep one more line for cargo/abono pairs (amount-only, not a new dated row)
          const peek = lines[j + 1]
          if (
            peek &&
            findAmountMatches(peek).length &&
            !DATE_ONLY.test(peek) &&
            !DATE_AT_START.test(peek) &&
            !DATE_ANYWHERE.test(peek)
          ) {
            parts.push(peek)
            j += 1
          }
          j += 1
          break
        }
        j += 1
      }
      out.push(parts.join(' '))
      i = sawAmount ? j : i + 1
      continue
    }

    // Date not at start — normalize «CONCEPTO 01/03/2026 100.00»
    if (!DATE_AT_START.test(line) && DATE_ANYWHERE.test(line) && findAmountMatches(line).length) {
      const m = line.match(DATE_ANYWHERE)
      if (m && m.index !== undefined && m.index > 0) {
        const date = m[0]
        const rest = `${line.slice(0, m.index)} ${line.slice(m.index + date.length)}`.replace(/\s+/g, ' ').trim()
        out.push(`${date} ${rest}`)
        i += 1
        continue
      }
    }

    out.push(line)
    i += 1
  }
  return out
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

  const lines = coalescePdfLines(text.replace(/\r/g, '').split('\n'))

  let parsedLines = 0

  for (const [index, line] of lines.entries()) {
    if (isSkippable(line)) continue

    const dated = line.match(DATE_AT_START)
    if (!dated) continue

    const date = normalizeDate(dated[1])
    const rest = dated[2].trim()
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
    const preview = lines.slice(0, 4).join(' · ').slice(0, 160)
    errors.unshift(
      'No se reconocieron movimientos en el PDF. Prueba un estado con filas «fecha + concepto + monto» (o Cargo/Abono), exporta CSV/XML, o usa un PDF con texto seleccionable (no escaneo).' +
        (preview ? ` Texto detectado: «${preview}…»` : ''),
    )
  } else if (detectedFormat === 'pdf_desconocido') {
    detectedFormat = 'pdf_line_simple'
  }

  if (parsedLines > 0 && transactions.length < parsedLines) {
    // no-op; errors already captured
  }

  return { transactions, errors, detectedFormat, bankHint }
}

async function extractTextFromPdfDoc(pdf: {
  numPages: number
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: unknown[] }>
  }>
}): Promise<string> {
  const pages: string[] = []
  const maxPages = Math.min(pdf.numPages, 40)

  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
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

  if (pdf.numPages > maxPages) {
    pages.push(`\n[…] solo se leyeron las primeras ${maxPages} páginas de ${pdf.numPages}`)
  }

  return pages.join('\n')
}

/**
 * Extract readable text from a PDF ArrayBuffer using pdf.js (client-side).
 * Uses the legacy build + binary polyfills; pdf.js falls back to a fake worker
 * on the main thread if the module Worker fails to start.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  ensurePdfJsBinaryPolyfills()
  const { getDocument } = await loadPdfJs()
  // Fresh copy — pdf.js may transfer the TypedArray to the worker thread
  const bytes = Uint8Array.from(new Uint8Array(data))

  const loadingTask = getDocument({
    data: bytes,
    useSystemFonts: true,
    useWorkerFetch: false,
  })
  const pdf = await loadingTask.promise
  return extractTextFromPdfDoc(pdf)
}

function friendlyPdfError(message: string): string {
  if (/password|encrypted/i.test(message)) {
    return 'El PDF está protegido con contraseña. Quítala o exporta CSV/XML.'
  }
  if (/toHex/i.test(message)) {
    return 'Tu navegador necesita una actualización para leer PDF (Uint8Array.toHex). Prueba CSV/XML o actualiza el navegador.'
  }
  if (/Invalid PDF|Missing PDF|corrupted/i.test(message)) {
    return 'El archivo no parece un PDF válido o está dañado.'
  }
  return message
}

/** Full pipeline: PDF bytes → text → transactions (same model as CSV). */
export async function parseStatementPdf(
  data: ArrayBuffer,
  defaultAccount = 'Cuenta PDF',
): Promise<PdfParseResult> {
  if (data.byteLength === 0) {
    return {
      transactions: [],
      errors: ['El PDF está vacío.'],
      detectedFormat: 'pdf_desconocido',
    }
  }
  if (data.byteLength > PDF_MAX_BYTES) {
    const mb = (data.byteLength / (1024 * 1024)).toFixed(1)
    return {
      transactions: [],
      errors: [
        `El PDF pesa ${mb} MB (máx. ${PDF_MAX_BYTES / (1024 * 1024)} MB). Exporta CSV/XML o un extracto más corto.`,
      ],
      detectedFormat: 'pdf_desconocido',
    }
  }

  try {
    const extractedText = await withTimeout(
      extractPdfText(data),
      PDF_PARSE_TIMEOUT_MS,
      'Tiempo de espera agotado al leer el PDF (worker pdf.js). Prueba CSV/XML o un archivo más pequeño.',
    )
    if (!extractedText.trim()) {
      return {
        transactions: [],
        errors: [
          'El PDF no tiene texto seleccionable (puede ser escaneo/imagen). Exporta CSV, XML de movimientos o un PDF con texto.',
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
      errors: [`No se pudo abrir el PDF: ${friendlyPdfError(message)}`],
      detectedFormat: 'pdf_desconocido',
    }
  }
}
