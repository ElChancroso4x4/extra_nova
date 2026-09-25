import type { Category } from './types'

const AHORRO_KEYWORDS = [
  'bitso',
  'actinver',
  'cetes',
  'ahorro',
  'inversion',
  'inversión',
  'fondo',
  'sofipo',
  'gbm',
  'kuspit',
  'trade',
  'deposito a plazo',
  'depósito a plazo',
]

const DIVERSION_KEYWORDS = [
  'netflix',
  'spotify',
  'disney',
  'hbo',
  'prime video',
  'cine',
  'cinepolis',
  'cinemex',
  'uber eats',
  'rappi',
  'didi food',
  'restaurante',
  'cafe',
  'café',
  'bar ',
  'steam',
  'playstation',
  'xbox',
  'nintendo',
  'viaje',
  'hotel',
  'airbnb',
  'concierto',
  'teatro',
  'gym',
  'gimnasio',
  'sport city',
]

const COSTO_VIDA_KEYWORDS = [
  'renta',
  'hipoteca',
  'cfe',
  'agua',
  'telcel',
  'telmex',
  'totalplay',
  'izzi',
  'gasolina',
  'pemex',
  'oxxo',
  'super',
  'walmart',
  'soriana',
  'chedraui',
  'costco',
  'farmacia',
  'metrobus',
  'metro ',
  'uber trip',
  'uber x',
  'didi',
  'imss',
  'seguro',
  'colegiatura',
  'amazon',
]

const INGRESO_KEYWORDS = [
  'nomina',
  'nómina',
  'sueldo',
  'payroll',
  'deposito nomina',
  'depósito nómina',
  'reembolso',
  'interes',
  'interés',
  'cashback',
  'transferencia recibida',
]

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k))
}

/**
 * Categoriza por palabras clave del concepto.
 * Montos positivos se tratan como ingreso salvo que el texto diga otra cosa.
 */
export function categorizeTransaction(description: string, amount: number): Category {
  const text = description.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

  if (amount > 0 || includesAny(text, INGRESO_KEYWORDS)) {
    if (amount > 0) return 'ingreso'
  }

  if (includesAny(text, AHORRO_KEYWORDS)) return 'ahorro'
  if (includesAny(text, DIVERSION_KEYWORDS)) return 'diversion'
  if (includesAny(text, COSTO_VIDA_KEYWORDS)) return 'costo_vida'

  // Default: gasto del día a día
  if (amount < 0) return 'costo_vida'
  return 'ingreso'
}
