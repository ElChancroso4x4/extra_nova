/**
 * Writes minimal text PDFs for Caudal fixtures (no external deps).
 * Run: node scripts/generate-sample-pdfs.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildPdf(lines, title = 'Estado de cuenta') {
  const contentLines = [
    'BT',
    '/F1 11 Tf',
    '50 760 Td',
    `(${escapePdfText(title)}) Tj`,
    '0 -18 Td',
  ]
  for (const line of lines) {
    contentLines.push(`(${escapePdfText(line)}) Tj`)
    contentLines.push('0 -14 Td')
  }
  contentLines.push('ET')
  const stream = contentLines.join('\n')

  const objects = []
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n',
  )
  objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`)
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n')

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += obj
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  pdf += `startxref\n${xrefPos}\n%%EOF\n`
  return pdf
}

const santanderLines = [
  'Santander - Estado de cuenta',
  'Fecha Concepto Cargo Abono',
  '01/03/2026 SUPERAMA POLANCO 1,850.40',
  '02/03/2026 NETFLIX.COM 299.00',
  '03/03/2026 CFE SUMINISTRADOR 1,240.00',
  '04/03/2026 SPEI ENVIADO BITSO 5,000.00',
  '05/03/2026 UBER EATS CDMX 287.50',
  '06/03/2026 RENTA DEPARTAMENTO 14,500.00',
  '07/03/2026 SPOTIFY PREMIUM 129.00',
  '15/03/2026 NOMINA EMPRESA 45,000.00',
  '16/03/2026 STEAM GAMES 650.00',
  '20/03/2026 SPEI ENVIADO CETES DIRECTO 3,000.00',
]

const mercadoPagoLines = [
  'Mercado Pago - Movimientos',
  'fecha descripcion monto',
  '2026-03-01 PAGO SERVICIO Luz -420.00',
  '2026-03-05 TRANSFERENCIA RECIBIDA 2500.00',
  '2026-03-08 NETFLIX.COM -299.00',
  '2026-03-12 SUPERAMA -890.50',
  '2026-03-18 SPEI ENVIADO BITSO -1500.00',
]

mkdirSync(join(root, 'public'), { recursive: true })
mkdirSync(join(root, 'src/lib/fixtures'), { recursive: true })

writeFileSync(join(root, 'public/sample-santander.pdf'), buildPdf(santanderLines, 'Santander'))
writeFileSync(join(root, 'public/sample-mercado-pago.pdf'), buildPdf(mercadoPagoLines, 'Mercado Pago'))

writeFileSync(
  join(root, 'src/lib/fixtures/sample-santander-pdf.txt'),
  `${santanderLines.join('\n')}\n`,
)
writeFileSync(
  join(root, 'src/lib/fixtures/sample-mercado-pago-pdf.txt'),
  `${mercadoPagoLines.join('\n')}\n`,
)

console.log('Wrote sample PDFs and text fixtures')
