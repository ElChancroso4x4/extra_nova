import { categorizeTransaction } from './categorize'
import { normalizeDate, parseAmount } from './parseCsv'
import type { Transaction } from './types'

export type XmlDetectedFormat =
  | 'xml_movimientos'
  | 'xml_cfdi'
  | 'xml_generico'
  | 'xml_desconocido'

export type XmlParseResult = {
  transactions: Transaction[]
  errors: string[]
  detectedFormat: XmlDetectedFormat
  bankHint?: string
}

const DATE_KEYS = [
  'fecha',
  'date',
  'fechaoperacion',
  'fechadeoperacion',
  'fechavalor',
  'fechamovimiento',
  'fechaaplicacion',
  'fechatimbrado',
]
const DESC_KEYS = [
  'descripcion',
  'description',
  'concepto',
  'detalle',
  'memo',
  'referencia',
  'nombre',
  'beneficiario',
  'leyenda',
]
const AMOUNT_KEYS = ['monto', 'amount', 'importe', 'valor', 'cantidad', 'total']
const DEBIT_KEYS = ['cargo', 'retiro', 'debit', 'cargos', 'cargosmxn', 'debe']
const CREDIT_KEYS = ['abono', 'deposito', 'depositos', 'credit', 'abonos', 'abonosmxn', 'haber']
const ACCOUNT_KEYS = ['cuenta', 'account', 'tarjeta', 'producto', 'clabe', 'nocuenta']
const TYPE_KEYS = ['tipo', 'naturalezamovimiento', 'tipomovimiento', 'signo']

const MOVEMENT_TAG =
  /^(movimiento|mov|transaction|transaccion|registro|row|item|detalle|operacion|operación)$/i

function uid(): string {
  return crypto.randomUUID()
}

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '')
}

function localName(node: Element | Attr): string {
  const name = node.localName || node.nodeName || ''
  return name.includes(':') ? name.split(':').pop()! : name
}

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function pickMapValue(map: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map.get(key)
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}

function elementFieldMap(el: Element): Map<string, string> {
  const map = new Map<string, string>()

  for (const attr of Array.from(el.attributes)) {
    const key = normalizeKey(localName(attr))
    if (key && attr.value.trim()) map.set(key, attr.value.trim())
  }

  for (const child of Array.from(el.children)) {
    const key = normalizeKey(localName(child))
    const value = textOf(child)
    if (!key || !value) continue
    // Prefer leaf values; nested containers are handled separately
    if (child.children.length === 0 || value.length > 0) {
      if (!map.has(key)) map.set(key, value)
    }
  }

  return map
}

function resolveAmount(map: Map<string, string>): {
  amount?: number
  format: XmlDetectedFormat
} {
  const debitRaw = pickMapValue(map, DEBIT_KEYS)
  const creditRaw = pickMapValue(map, CREDIT_KEYS)

  if (debitRaw || creditRaw) {
    const debit = debitRaw ? parseAmount(debitRaw) : 0
    const credit = creditRaw ? parseAmount(creditRaw) : 0
    if (debitRaw && !Number.isNaN(debit) && debit !== 0) {
      return { amount: -Math.abs(debit), format: 'xml_movimientos' }
    }
    if (creditRaw && !Number.isNaN(credit) && credit !== 0) {
      return { amount: Math.abs(credit), format: 'xml_movimientos' }
    }
  }

  const amountRaw = pickMapValue(map, AMOUNT_KEYS)
  if (amountRaw) {
    let amount = parseAmount(amountRaw)
    if (!Number.isNaN(amount)) {
      const tipo = (pickMapValue(map, TYPE_KEYS) ?? '').toLowerCase()
      if (tipo && /cargo|retiro|debit|egreso|gasto|cargo/.test(tipo) && amount > 0) {
        amount = -Math.abs(amount)
      } else if (tipo && /abono|deposito|credit|ingreso/.test(tipo) && amount < 0) {
        amount = Math.abs(amount)
      }
      return { amount, format: 'xml_generico' }
    }
  }

  return { format: 'xml_desconocido' }
}

function detectBankHint(xmlText: string, doc: Document): string | undefined {
  const lower = xmlText.toLowerCase()
  if (lower.includes('santander')) return 'Santander'
  if (lower.includes('mercado pago') || lower.includes('mercadopago')) return 'Mercado Pago'
  if (lower.includes('bbva')) return 'BBVA'
  if (lower.includes('banorte')) return 'Banorte'
  if (lower.includes('hsbc')) return 'HSBC'
  if (lower.includes('banamex') || lower.includes('citibanamex')) return 'Citibanamex'
  const root = localName(doc.documentElement).toLowerCase()
  if (root.includes('banorte')) return 'Banorte'
  if (root.includes('bbva')) return 'BBVA'
  return undefined
}

function isCfdiDocument(doc: Document): boolean {
  const root = doc.documentElement
  const name = localName(root).toLowerCase()
  if (name === 'comprobante') return true
  const ns = (root.namespaceURI ?? '').toLowerCase()
  return ns.includes('cfd') || ns.includes('sat.gob.mx')
}

function parseCfdi(doc: Document, defaultAccount: string): XmlParseResult {
  const errors: string[] = []
  const root = doc.documentElement
  const fechaRaw =
    root.getAttribute('Fecha') ||
    root.getAttribute('fecha') ||
    textOf(root.querySelector('Fecha'))
  const date = fechaRaw ? normalizeDate(fechaRaw.slice(0, 10)) : null
  const totalRaw =
    root.getAttribute('Total') ||
    root.getAttribute('total') ||
    textOf(root.querySelector('Total'))
  const total = totalRaw ? parseAmount(totalRaw) : NaN
  const tipo =
    root.getAttribute('TipoDeComprobante') ||
    root.getAttribute('tipoDeComprobante') ||
    ''
  const emisor =
    root.querySelector('Emisor')?.getAttribute('Nombre') ||
    root.querySelector('Emisor')?.getAttribute('nombre') ||
    textOf(root.querySelector('Emisor Nombre')) ||
    'CFDI'
  const receptor =
    root.querySelector('Receptor')?.getAttribute('Nombre') ||
    root.querySelector('Receptor')?.getAttribute('nombre') ||
    ''

  const conceptos = Array.from(root.querySelectorAll('Concepto'))
  const transactions: Transaction[] = []

  // Personal budgeting: CFDI is almost always a factura you paid → expense.
  // TipoDeComprobante E (egreso/nota) stays negative; I (ingreso del emisor) also
  // as expense for the payer. Users can flip category/sign manually if needed.
  const signedBase = Number.isFinite(total) ? -Math.abs(total) : undefined
  void tipo

  if (conceptos.length > 0 && date) {
    for (const concepto of conceptos) {
      const desc =
        concepto.getAttribute('Descripcion') ||
        concepto.getAttribute('descripcion') ||
        textOf(concepto) ||
        'Concepto CFDI'
      const importeRaw =
        concepto.getAttribute('Importe') ||
        concepto.getAttribute('importe') ||
        concepto.getAttribute('ValorUnitario')
      let amount = importeRaw ? parseAmount(importeRaw) : NaN
      if (Number.isNaN(amount)) continue
      amount = -Math.abs(amount)

      transactions.push({
        id: uid(),
        date,
        description: desc.trim(),
        amount,
        account: defaultAccount || emisor || 'CFDI',
        category: categorizeTransaction(desc, amount),
        source: 'xml',
      })
    }
  }

  if (transactions.length === 0 && date && signedBase !== undefined) {
    const description = [emisor, receptor].filter(Boolean).join(' → ') || 'Comprobante CFDI'
    transactions.push({
      id: uid(),
      date,
      description,
      amount: signedBase,
      account: defaultAccount || 'CFDI',
      category: categorizeTransaction(description, signedBase),
      source: 'xml',
    })
  }

  if (transactions.length === 0) {
    errors.push(
      'CFDI detectado pero sin Fecha/Total utilizables. El CFDI es factura SAT, no estado de cuenta; si puedes, exporta movimientos en XML/CSV del banco.',
    )
  } else {
    errors.push(
      'Nota: CFDI ≠ estado de cuenta. Se importaron montos/fechas del comprobante; revisa categorías.',
    )
  }

  return {
    transactions,
    errors,
    detectedFormat: 'xml_cfdi',
    bankHint: 'CFDI',
  }
}

function collectCandidateElements(doc: Document): Element[] {
  const all = Array.from(doc.getElementsByTagName('*'))
  const tagged = all.filter((el) => MOVEMENT_TAG.test(localName(el)))
  if (tagged.length > 0) return tagged

  // Fallback: elements that look like a transaction row (have fecha + monto-ish fields)
  return all.filter((el) => {
    if (el.children.length === 0 && el.attributes.length < 2) return false
    const map = elementFieldMap(el)
    const hasDate = DATE_KEYS.some((k) => map.has(k))
    const hasAmount =
      AMOUNT_KEYS.some((k) => map.has(k)) ||
      DEBIT_KEYS.some((k) => map.has(k)) ||
      CREDIT_KEYS.some((k) => map.has(k))
    return hasDate && hasAmount
  })
}

function parseMovementElements(
  elements: Element[],
  defaultAccount: string,
): Omit<XmlParseResult, 'bankHint'> {
  const errors: string[] = []
  const transactions: Transaction[] = []
  let detectedFormat: XmlDetectedFormat = 'xml_desconocido'

  for (const [index, el] of elements.entries()) {
    const map = elementFieldMap(el)
    const dateRaw = pickMapValue(map, DATE_KEYS)
    const date = dateRaw ? normalizeDate(dateRaw) : null
    const description = pickMapValue(map, DESC_KEYS) ?? 'Sin descripción'
    const account = pickMapValue(map, ACCOUNT_KEYS) ?? defaultAccount
    const { amount, format } = resolveAmount(map)

    if (format !== 'xml_desconocido') detectedFormat = format

    if (!date || amount === undefined || Number.isNaN(amount)) {
      // Skip containers that matched loosely
      if (el.children.length > 2 && !dateRaw) continue
      errors.push(`Nodo ${index + 1} (${localName(el)}): no se pudo leer fecha/monto`)
      continue
    }

    transactions.push({
      id: uid(),
      date,
      description: description.trim(),
      amount,
      account,
      category: categorizeTransaction(description, amount),
      source: 'xml',
    })
  }

  if (transactions.length > 0 && detectedFormat === 'xml_desconocido') {
    detectedFormat = 'xml_generico'
  }

  return { transactions, errors, detectedFormat }
}

/**
 * Parse Mexican bank / generic movement XML (and a CFDI subset) into Transaction[].
 */
export function parseStatementXml(xmlText: string, defaultAccount = 'Cuenta XML'): XmlParseResult {
  const trimmed = xmlText.replace(/^\uFEFF/, '').trim()
  if (!trimmed) {
    return {
      transactions: [],
      errors: ['El archivo XML está vacío.'],
      detectedFormat: 'xml_desconocido',
    }
  }

  if (typeof DOMParser === 'undefined') {
    return {
      transactions: [],
      errors: ['Este entorno no soporta DOMParser para leer XML.'],
      detectedFormat: 'xml_desconocido',
    }
  }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'XML inválido'
    return {
      transactions: [],
      errors: [`No se pudo leer el XML: ${message}`],
      detectedFormat: 'xml_desconocido',
    }
  }

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return {
      transactions: [],
      errors: ['XML mal formado. Revisa que sea un export válido (UTF-8).'],
      detectedFormat: 'xml_desconocido',
    }
  }

  const bankHint = detectBankHint(trimmed, doc)

  if (isCfdiDocument(doc)) {
    return parseCfdi(doc, defaultAccount)
  }

  const candidates = collectCandidateElements(doc)
  const parsed = parseMovementElements(candidates, bankHint ?? defaultAccount)

  if (parsed.transactions.length === 0) {
    return {
      transactions: [],
      errors: [
        'No se reconocieron movimientos en el XML. Usa nodos con fecha + concepto + monto (o Cargo/Abono), p. ej. <Movimiento fecha="…" concepto="…" cargo="…" abono="…"/>. CFDI (facturas SAT) también se intenta, pero no es un estado de cuenta.',
        ...parsed.errors.slice(0, 5),
      ],
      detectedFormat: 'xml_desconocido',
      bankHint,
    }
  }

  // Prefer xml_movimientos when cargo/abono was used
  const format =
    parsed.detectedFormat === 'xml_generico' &&
    /<(cargo|abono|retiro|deposito)\b/i.test(trimmed)
      ? 'xml_movimientos'
      : parsed.detectedFormat

  return {
    ...parsed,
    detectedFormat: format,
    bankHint,
    errors: parsed.errors,
  }
}
