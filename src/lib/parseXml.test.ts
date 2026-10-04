import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseStatementXml } from './parseXml'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '../../public')

describe('parseStatementXml', () => {
  it('parsea movimientos Banorte-like con Cargo/Abono', () => {
    const xml = readFileSync(join(publicDir, 'sample-movimientos.xml'), 'utf8')
    const { transactions, errors, detectedFormat, bankHint } = parseStatementXml(xml)

    expect(bankHint).toBe('Banorte')
    expect(detectedFormat).toBe('xml_movimientos')
    expect(errors.filter((e) => e.startsWith('No se reconocieron'))).toHaveLength(0)
    expect(transactions.length).toBeGreaterThanOrEqual(7)

    const netflix = transactions.find((t) => /netflix/i.test(t.description))
    expect(netflix).toMatchObject({
      date: '2026-03-02',
      amount: -299,
      source: 'xml',
      category: 'diversion',
    })

    const nomina = transactions.find((t) => /nomina/i.test(t.description))
    expect(nomina).toMatchObject({
      date: '2026-03-15',
      amount: 45000,
      category: 'ingreso',
    })
  })

  it('parsea lista genérica con monto firmado', () => {
    const xml = `<?xml version="1.0"?>
      <movimientos>
        <item fecha="2026-03-01" descripcion="PAGO SERVICIO Luz" monto="-420.00" />
        <item fecha="2026-03-05" descripcion="TRANSFERENCIA RECIBIDA" monto="2500" />
      </movimientos>`
    const { transactions, detectedFormat } = parseStatementXml(xml)
    expect(detectedFormat).toBe('xml_generico')
    expect(transactions).toHaveLength(2)
    expect(transactions[0]?.amount).toBe(-420)
    expect(transactions[1]?.amount).toBe(2500)
  })

  it('importa subset CFDI con nota de que no es estado de cuenta', () => {
    const xml = readFileSync(join(publicDir, 'sample-cfdi-minimal.xml'), 'utf8')
    const { transactions, errors, detectedFormat } = parseStatementXml(xml)
    expect(detectedFormat).toBe('xml_cfdi')
    expect(transactions.length).toBeGreaterThanOrEqual(1)
    expect(transactions[0]?.date).toBe('2026-03-10')
    expect(errors.some((e) => /CFDI/i.test(e))).toBe(true)
  })

  it('error claro si no hay movimientos', () => {
    const { transactions, errors, detectedFormat } = parseStatementXml(
      '<root><hola>mundo</hola></root>',
    )
    expect(transactions).toHaveLength(0)
    expect(detectedFormat).toBe('xml_desconocido')
    expect(errors[0]).toMatch(/No se reconocieron movimientos/)
  })

  it('rechaza XML mal formado', () => {
    const { transactions, errors } = parseStatementXml('<Movimientos><Movimiento>')
    expect(transactions).toHaveLength(0)
    expect(errors[0]).toMatch(/mal formado|No se pudo/i)
  })
})
