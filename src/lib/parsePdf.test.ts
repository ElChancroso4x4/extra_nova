import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  coalescePdfLines,
  detectBankHint,
  parseStatementPdf,
  parseStatementPdfText,
  resolvePdfWorkerSrc,
} from './parsePdf'

const here = dirname(fileURLToPath(import.meta.url))

describe('resolvePdfWorkerSrc', () => {
  it('keeps absolute http(s) URLs', () => {
    expect(
      resolvePdfWorkerSrc('https://cdn.example/worker.mjs', '/extra_nova/', 'https://app.test'),
    ).toBe('https://cdn.example/worker.mjs')
  })

  it('joins site-absolute paths with origin (GitHub Pages base)', () => {
    expect(
      resolvePdfWorkerSrc(
        '/extra_nova/assets/pdf.worker.min.mjs',
        '/extra_nova/',
        'https://elchancroso4x4.github.io',
      ),
    ).toBe('https://elchancroso4x4.github.io/extra_nova/assets/pdf.worker.min.mjs')
  })

  it('resolves relative worker paths under BASE_URL', () => {
    expect(
      resolvePdfWorkerSrc(
        'assets/pdf.worker.min.mjs',
        '/extra_nova/',
        'https://elchancroso4x4.github.io',
      ),
    ).toBe('https://elchancroso4x4.github.io/extra_nova/assets/pdf.worker.min.mjs')
  })

  it('does not drop the /extra_nova/ prefix when the page is under /presupuesto/', () => {
    const src = resolvePdfWorkerSrc(
      '/extra_nova/assets/pdf.worker.min-abc.mjs',
      '/extra_nova/',
      'https://elchancroso4x4.github.io',
    )
    expect(src).toContain('/extra_nova/assets/')
    expect(src).not.toContain('/presupuesto/')
  })
})

describe('parseStatementPdfText', () => {
  it('parsea layout Santander Cargo/Abono desde fixture de texto', () => {
    const text = readFileSync(join(here, 'fixtures/sample-santander-pdf.txt'), 'utf8')
    const { transactions, errors, detectedFormat, bankHint } = parseStatementPdfText(text)

    expect(bankHint).toBe('Santander')
    expect(detectedFormat).toBe('pdf_cargo_abono')
    expect(errors.filter((e) => e.startsWith('No se reconocieron'))).toHaveLength(0)
    expect(transactions.length).toBeGreaterThanOrEqual(8)

    const netflix = transactions.find((t) => /netflix/i.test(t.description))
    expect(netflix).toMatchObject({
      date: '2026-03-02',
      amount: -299,
      category: 'diversion',
      source: 'pdf',
      account: 'Santander',
    })

    const nomina = transactions.find((t) => /nomina/i.test(t.description))
    expect(nomina).toMatchObject({
      date: '2026-03-15',
      amount: 45000,
      category: 'ingreso',
      source: 'pdf',
    })

    const bitso = transactions.find((t) => /bitso/i.test(t.description))
    expect(bitso?.category).toBe('ahorro')
    expect(bitso?.amount).toBeLessThan(0)
  })

  it('parsea layout simple con montos firmados (Mercado Pago)', () => {
    const text = readFileSync(join(here, 'fixtures/sample-mercado-pago-pdf.txt'), 'utf8')
    const { transactions, detectedFormat, bankHint } = parseStatementPdfText(text)

    expect(bankHint).toBe('Mercado Pago')
    expect(detectedFormat).toBe('pdf_line_simple')
    expect(transactions).toHaveLength(5)
    expect(transactions[0]).toMatchObject({
      date: '2026-03-01',
      amount: -420,
    })
    expect(transactions[1]).toMatchObject({
      date: '2026-03-05',
      amount: 2500,
      category: 'ingreso',
    })
  })

  it('devuelve error claro si el layout es desconocido', () => {
    const { transactions, errors, detectedFormat } = parseStatementPdfText(
      'Documento confidencial\nSin fechas ni montos útiles\nSolo prosa bancaria',
    )
    expect(transactions).toHaveLength(0)
    expect(detectedFormat).toBe('pdf_desconocido')
    expect(errors[0]).toMatch(/No se reconocieron movimientos/)
  })

  it('detecta banco por encabezado', () => {
    expect(detectBankHint('BBVA Bancomer estado')).toBe('BBVA')
    expect(detectBankHint('Movimientos Banorte')).toBe('Banorte')
  })

  it('une filas fragmentadas fecha / concepto / monto', () => {
    const coalesced = coalescePdfLines([
      '01/03/2026',
      'SUPERAMA POLANCO',
      '1,850.40',
      '02/03/2026 NETFLIX.COM 299.00',
    ])
    expect(coalesced[0]).toMatch(/01\/03\/2026 SUPERAMA POLANCO 1,850\.40/)
    const { transactions } = parseStatementPdfText(coalesced.join('\n'))
    expect(transactions.find((t) => /superama/i.test(t.description))?.amount).toBe(-1850.4)
  })
})

describe('parseStatementPdf (pdf.js)', () => {
  it('extrae texto y parsea sample-santander.pdf', async () => {
    const bytes = readFileSync(join(here, '../../public/sample-santander.pdf'))
    const result = await parseStatementPdf(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )

    if (result.transactions.length === 0) {
      // Surface parser/pdf.js errors in the assertion message
      expect(result.errors, result.errors.join(' | ')).toEqual([])
    }
    expect(result.extractedText ?? '').toMatch(/Santander/i)
    expect(result.transactions.length).toBeGreaterThanOrEqual(8)
    expect(result.detectedFormat).toBe('pdf_cargo_abono')
    expect(result.transactions.every((t) => t.source === 'pdf')).toBe(true)
  })
})
