import { describe, expect, it } from 'vitest'
import { categorizeTransaction } from './categorize'
import { computeGoalProgress } from './goals'
import { parseStatementCsv } from './parseCsv'
import { computeBalanceSheet } from './balance'
import type { Transaction } from './types'

describe('categorizeTransaction', () => {
  it('marca streaming y cine como diversion', () => {
    expect(categorizeTransaction('NETFLIX.COM', -299)).toBe('diversion')
    expect(categorizeTransaction('CINEPOLIS VIP', -420)).toBe('diversion')
  })

  it('marca bitso y actinver como ahorro', () => {
    expect(categorizeTransaction('TRANSFERENCIA A BITSO', -5000)).toBe('ahorro')
    expect(categorizeTransaction('ACTINVER TRADE DEPOSITO', -8000)).toBe('ahorro')
  })

  it('marca renta y cfe como costo de vida', () => {
    expect(categorizeTransaction('RENTA DEPARTAMENTO', -14500)).toBe('costo_vida')
    expect(categorizeTransaction('CFE SUMINISTRADOR', -1240)).toBe('costo_vida')
  })

  it('marca nomina positiva como ingreso', () => {
    expect(categorizeTransaction('NOMINA EMPRESA', 45000)).toBe('ingreso')
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
  it('parsea CSV de muestra y categoriza', () => {
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
