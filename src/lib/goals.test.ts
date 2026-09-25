import { describe, expect, it } from 'vitest'
import { categorizeTransaction } from './categorize'
import { computeGoalProgress } from './goals'
import { dominantMonth, normalizeDate, parseAmount, parseStatementCsv } from './parseCsv'
import { computeBalanceSheet } from './balance'
import type { Transaction } from './types'

describe('categorizeTransaction', () => {
  it('marca streaming y cine como diversion', () => {
    expect(categorizeTransaction('NETFLIX.COM', -299)).toBe('diversion')
    expect(categorizeTransaction('CINEPOLIS VIP', -420)).toBe('diversion')
  })

  it('marca bitso y actinver como ahorro', () => {
    expect(categorizeTransaction('TRANSFERENCIA A BITSO', -5000)).toBe('ahorro')
    expect(categorizeTransaction('SPEI ENVIADO ACTINVER TRADE', -8000)).toBe('ahorro')
  })

  it('marca renta y cfe como costo de vida', () => {
    expect(categorizeTransaction('RENTA DEPARTAMENTO', -14500)).toBe('costo_vida')
    expect(categorizeTransaction('CFE SUMINISTRADOR', -1240)).toBe('costo_vida')
  })

  it('marca nomina positiva como ingreso', () => {
    expect(categorizeTransaction('NOMINA EMPRESA', 45000)).toBe('ingreso')
  })
})

describe('parseAmount y fechas MX', () => {
  it('parsea montos US y MX', () => {
    expect(parseAmount('1,850.40')).toBeCloseTo(1850.4)
    expect(parseAmount('1.850,40')).toBeCloseTo(1850.4)
    expect(parseAmount('($299.00)')).toBeCloseTo(-299)
    expect(parseAmount('-1,240.00')).toBeCloseTo(-1240)
  })

  it('normaliza fechas DD/MM/YYYY', () => {
    expect(normalizeDate('01/03/2026')).toBe('2026-03-01')
    expect(normalizeDate('2026-03-15')).toBe('2026-03-15')
  })
})

describe('computeGoalProgress', () => {
  it('calcula shares 50/30/20 sobre egresos', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        date: '2026-03-01',
        description: 'renta',
        amount: -5000,
        account: 'a',
        category: 'costo_vida',
        source: 'manual',
      },
      {
        id: '2',
        date: '2026-03-01',
        description: 'cine',
        amount: -3000,
        account: 'a',
        category: 'diversion',
        source: 'manual',
      },
      {
        id: '3',
        date: '2026-03-01',
        description: 'bitso',
        amount: -2000,
        account: 'a',
        category: 'ahorro',
        source: 'manual',
      },
    ]
    const progress = computeGoalProgress(txs)
    expect(progress.totalSpend).toBe(10000)
    expect(progress.shares.costo_vida).toBeCloseTo(0.5)
    expect(progress.shares.diversion).toBeCloseTo(0.3)
    expect(progress.shares.ahorro).toBeCloseTo(0.2)
    expect(progress.deltas.ahorro).toBeCloseTo(0)
  })
})

describe('parseStatementCsv', () => {
  it('parsea CSV simple y categoriza', () => {
    const csv = `fecha,descripcion,monto,cuenta
2026-03-02,NETFLIX.COM,-299.00,Santander
2026-03-04,TRANSFERENCIA A BITSO,-5000.00,Santander
2026-03-15,NOMINA EMPRESA,45000.00,Santander`
    const { transactions, errors } = parseStatementCsv(csv)
    expect(errors).toHaveLength(0)
    expect(transactions).toHaveLength(3)
    expect(transactions[0].category).toBe('diversion')
    expect(transactions[1].category).toBe('ahorro')
    expect(transactions[2].category).toBe('ingreso')
  })

  it('parsea formato Santander Cargo/Abono con fechas MX', () => {
    const csv = `Fecha,Concepto,Cargo,Abono,Cuenta
01/03/2026,NETFLIX.COM,299.00,,Santander
15/03/2026,NOMINA EMPRESA,,"45,000.00",Santander
04/03/2026,SPEI ENVIADO BITSO,"5,000.00",,Santander`
    const { transactions, errors, detectedFormat } = parseStatementCsv(csv)
    expect(errors).toHaveLength(0)
    expect(detectedFormat).toBe('cargo_abono')
    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toMatchObject({
      date: '2026-03-01',
      amount: -299,
      category: 'diversion',
    })
    expect(transactions[1]).toMatchObject({
      date: '2026-03-15',
      amount: 45000,
      category: 'ingreso',
    })
    expect(transactions[2]).toMatchObject({
      date: '2026-03-04',
      amount: -5000,
      category: 'ahorro',
    })
    expect(dominantMonth(transactions)).toBe('2026-03')
  })
})

describe('computeBalanceSheet', () => {
  it('resta pasivos del patrimonio neto', () => {
    const sheet = computeBalanceSheet([
      {
        id: '1',
        name: 'Débito',
        institution: 'Santander',
        kind: 'banco',
        balance: 20000,
        currency: 'MXN',
        updatedAt: '2026-03-01',
      },
      {
        id: '2',
        name: 'Trade',
        institution: 'Actinver',
        kind: 'inversion',
        balance: 50000,
        currency: 'MXN',
        updatedAt: '2026-03-01',
      },
      {
        id: '3',
        name: 'BTC',
        institution: 'Bitso',
        kind: 'crypto',
        balance: 10000,
        currency: 'MXN',
        updatedAt: '2026-03-01',
      },
      {
        id: '4',
        name: 'TDC',
        institution: 'Santander',
        kind: 'pasivo',
        balance: 8000,
        currency: 'MXN',
        updatedAt: '2026-03-01',
      },
    ])
    expect(sheet.assets).toBe(80000)
    expect(sheet.liabilities).toBe(8000)
    expect(sheet.netWorth).toBe(72000)
  })
})
