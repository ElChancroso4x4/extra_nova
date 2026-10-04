import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { categorizeTransaction } from '../lib/categorize'
import {
  CATEGORY_LABELS,
  DEFAULT_GOALS,
  type Category,
  type Transaction,
} from '../lib/types'
import { computeGoalProgress, currentYearMonth, formatMxn, formatPct } from '../lib/goals'
import { dominantMonth, parseStatementCsv } from '../lib/parseCsv'
import { parseStatementPdf } from '../lib/parsePdf'
import { parseStatementXml } from '../lib/parseXml'
import { loadTransactions, saveTransactions } from '../lib/storage'

const BUDGET_CATEGORIES: Category[] = ['costo_vida', 'diversion', 'ahorro', 'ingreso', 'ignorar']

type SampleId =
  | 'mixto'
  | 'santander'
  | 'mercado_pago'
  | 'santander_pdf'
  | 'mercado_pago_pdf'
  | 'movimientos_xml'
  | 'cfdi_xml'

type SampleKind = 'csv' | 'pdf' | 'xml'

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

const SAMPLES: Record<SampleId, { file: string; label: string; kind: SampleKind }> = {
  mixto: { file: assetUrl('sample-estado-cuenta.csv'), label: 'Mes mixto', kind: 'csv' },
  santander: {
    file: assetUrl('sample-santander.csv'),
    label: 'Santander (Cargo/Abono)',
    kind: 'csv',
  },
  mercado_pago: {
    file: assetUrl('sample-mercado-pago.csv'),
    label: 'Mercado Pago',
    kind: 'csv',
  },
  santander_pdf: {
    file: assetUrl('sample-santander.pdf'),
    label: 'PDF Santander',
    kind: 'pdf',
  },
  mercado_pago_pdf: {
    file: assetUrl('sample-mercado-pago.pdf'),
    label: 'PDF Mercado Pago',
    kind: 'pdf',
  },
  movimientos_xml: {
    file: assetUrl('sample-movimientos.xml'),
    label: 'XML Banorte (movimientos)',
    kind: 'xml',
  },
  cfdi_xml: {
    file: assetUrl('sample-cfdi-minimal.xml'),
    label: 'XML CFDI (factura)',
    kind: 'xml',
  },
}

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return file.type === 'application/pdf' || name.endsWith('.pdf')
}

function isXmlFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    file.type === 'text/xml' ||
    file.type === 'application/xml' ||
    name.endsWith('.xml')
  )
}

function isCsvLikeFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    file.type === 'text/csv' ||
    file.type === 'text/plain' ||
    name.endsWith('.csv') ||
    name.endsWith('.txt')
  )
}

function readingLabel(kind: SampleKind | 'file', name: string): string {
  if (kind === 'pdf') return `Leyendo PDF «${name}»…`
  if (kind === 'xml') return `Leyendo XML «${name}»…`
  if (kind === 'csv') return `Leyendo CSV «${name}»…`
  return `Leyendo «${name}»…`
}

export function PresupuestoPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [month, setMonth] = useState(currentYearMonth())
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [replaceOnImport, setReplaceOnImport] = useState(false)
  const [manual, setManual] = useState({
    date: `${currentYearMonth()}-01`,
    description: '',
    amount: '',
    account: 'Santander',
  })

  useEffect(() => {
    setTransactions(loadTransactions())
  }, [])

  useEffect(() => {
    saveTransactions(transactions)
  }, [transactions])

  const monthTx = useMemo(
    () => transactions.filter((tx) => tx.date.startsWith(month)),
    [transactions, month],
  )

  const progress = useMemo(() => computeGoalProgress(monthTx), [monthTx])

  function applyImport(parsed: Transaction[], label: string, errors: string[], format?: string) {
    if (parsed.length === 0) {
      setMessage(errors[0] ?? 'No se encontraron transacciones en el archivo.')
      return
    }
    const nextMonth = dominantMonth(parsed)
    if (nextMonth) setMonth(nextMonth)
    setTransactions((prev) => (replaceOnImport ? parsed : [...parsed, ...prev]))
    const formatNote = format ? ` · formato ${format}` : ''
    setMessage(
      `${label}: ${parsed.length} movimientos${formatNote}${
        errors.length ? ` (${errors.length} filas con aviso)` : ''
      }.`,
    )
  }

  async function ingestFile(file: File) {
    if (importing) return
    setImporting(true)
    const kind: SampleKind | 'file' = isPdfFile(file)
      ? 'pdf'
      : isXmlFile(file)
        ? 'xml'
        : isCsvLikeFile(file)
          ? 'csv'
          : 'file'
    setMessage(readingLabel(kind, file.name))
    try {
      if (isPdfFile(file)) {
        const buffer = await file.arrayBuffer()
        const { transactions: parsed, errors, detectedFormat } = await parseStatementPdf(
          buffer,
          file.name.replace(/\.pdf$/i, ''),
        )
        applyImport(parsed, `Importado PDF «${file.name}»`, errors, detectedFormat)
        return
      }

      if (isXmlFile(file)) {
        const text = await file.text()
        const { transactions: parsed, errors, detectedFormat } = parseStatementXml(
          text,
          file.name.replace(/\.xml$/i, ''),
        )
        applyImport(parsed, `Importado XML «${file.name}»`, errors, detectedFormat)
        return
      }

      if (!isCsvLikeFile(file)) {
        setMessage(
          `Tipo no soportado: «${file.name}». Usa CSV (.csv), XML (.xml) o PDF de estado de cuenta (.pdf).`,
        )
        return
      }

      const text = await file.text()
      const { transactions: parsed, errors, detectedFormat } = parseStatementCsv(text, file.name)
      applyImport(parsed, `Importado CSV «${file.name}»`, errors, detectedFormat)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Error desconocido'
      setMessage(`No se pudo importar «${file.name}»: ${detail}`)
    } finally {
      setImporting(false)
    }
  }

  async function loadSample(id: SampleId) {
    if (importing) return
    const sample = SAMPLES[id]
    setImporting(true)
    setMessage(readingLabel(sample.kind, sample.label))
    try {
      const res = await fetch(sample.file)
      if (!res.ok) {
        setMessage(
          `No se pudo descargar el ejemplo (${res.status}). Comprueba la URL ${sample.file}.`,
        )
        return
      }
      if (sample.kind === 'pdf') {
        const buffer = await res.arrayBuffer()
        const { transactions: parsed, errors, detectedFormat } = await parseStatementPdf(buffer)
        applyImport(parsed, `Ejemplo ${sample.label}`, errors, detectedFormat)
        return
      }
      const text = await res.text()
      if (sample.kind === 'xml') {
        const { transactions: parsed, errors, detectedFormat } = parseStatementXml(text)
        applyImport(parsed, `Ejemplo ${sample.label}`, errors, detectedFormat)
        return
      }
      const { transactions: parsed, errors, detectedFormat } = parseStatementCsv(text)
      applyImport(parsed, `Ejemplo ${sample.label}`, errors, detectedFormat)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Error desconocido'
      setMessage(`No se pudo cargar el ejemplo «${sample.label}»: ${detail}`)
    } finally {
      setImporting(false)
    }
  }

  function onCategoryChange(id: string, category: Category) {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, category } : tx)))
  }

  function removeTx(id: string) {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id))
  }

  function clearMonth() {
    setTransactions((prev) => prev.filter((tx) => !tx.date.startsWith(month)))
    setMessage(`Se borraron los movimientos de ${month}.`)
  }

  function clearAll() {
    setTransactions([])
    setMessage('Se borraron todos los movimientos.')
  }

  function addManual(e: FormEvent) {
    e.preventDefault()
    const amount = Number.parseFloat(manual.amount)
    if (!manual.description || Number.isNaN(amount)) return
    const tx: Transaction = {
      id: crypto.randomUUID(),
      date: manual.date,
      description: manual.description,
      amount,
      account: manual.account,
      category: categorizeTransaction(manual.description, amount),
      source: 'manual',
    }
    setTransactions((prev) => [tx, ...prev])
    setManual((m) => ({ ...m, description: '', amount: '' }))
  }

  const goalRows: Array<{ key: keyof typeof DEFAULT_GOALS; label: string }> = [
    { key: 'costo_vida', label: 'Costo de vida · 50%' },
    { key: 'diversion', label: 'Diversión y recreación · 30%' },
    { key: 'ahorro', label: 'Ahorro · 20%' },
  ]

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Presupuesto mensual</h1>
          <p>
            Sube un estado de cuenta en CSV, XML o PDF, revisa categorías y mide tu meta 50 / 30 / 20.
            Los conectores automáticos vienen después.
          </p>
        </div>
        <div className="actions">
          <label>
            Mes
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="panel">
        <h2>Cómo importar CSV, XML o PDF</h2>
        <ol className="howto">
          <li>
            Usa un ejemplo abajo <em>o</em> exporta movimientos desde tu banco / Mercado Pago en{' '}
            <strong>CSV o XML</strong> (más fiable). PDF solo si tiene texto seleccionable (no
            escaneo).
          </li>
          <li>
            Arrástralo al área de carga. CSV/XML: <code>fecha + concepto + monto</code> o
            Cargo/Abono. PDF: mismas filas en texto. CFDI (factura SAT) ≠ estado de cuenta; se
            importan montos/fechas con aviso.
          </li>
          <li>
            Deja desmarcado «Reemplazar…» para sumar varias cuentas en secuencia (CSV, XML o PDF).
          </li>
          <li>Revisa el mes, corrige categorías y mira 50% vida · 30% diversión · 20% ahorro.</li>
        </ol>
      </div>

      <div className="grid-3">
        <div className="panel">
          <div className="stat-label">Ingresos del mes</div>
          <div className="stat-value">{formatMxn(progress.income)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Egresos categorizados</div>
          <div className="stat-value">{formatMxn(progress.totalSpend)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Movimientos</div>
          <div className="stat-value">{monthTx.length}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Objetivos del mes</h2>
        <p className="muted">
          Las barras muestran tu distribución real. La marca vertical es la meta.
        </p>
        <div className="goal-row">
          {goalRows.map(({ key, label }) => {
            const share = progress.shares[key]
            const delta = progress.deltas[key]
            const onTrack =
              key === 'ahorro' ? delta >= -0.02 : Math.abs(delta) <= 0.05 || delta <= 0.05
            return (
              <div key={key}>
                <div className="goal-meta">
                  <span>{label}</span>
                  <span>
                    {formatMxn(progress.totals[key])} · {formatPct(share)}{' '}
                    <span className={onTrack ? 'delta-ok' : 'delta-bad'}>
                      ({delta >= 0 ? '+' : ''}
                      {formatPct(delta)} vs meta)
                    </span>
                  </span>
                </div>
                <div
                  className="bar target"
                  style={{ ['--target' as string]: `${DEFAULT_GOALS[key] * 100}%` }}
                >
                  <span style={{ width: `${Math.min(share * 100, 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Subir estado de cuenta (CSV, XML o PDF)</h2>
          <div
            className={`dropzone ${dragOver ? 'active' : ''} ${importing ? 'busy' : ''}`}
            aria-busy={importing}
            onDragOver={(e) => {
              e.preventDefault()
              if (!importing) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (importing) return
              const file = e.dataTransfer.files?.[0]
              if (file) void ingestFile(file)
            }}
          >
            <p>
              {importing ? (
                'Procesando archivo…'
              ) : (
                <>
                  Arrastra un CSV, XML o PDF aquí o{' '}
                  <label style={{ color: 'var(--moss)', fontWeight: 700, cursor: 'pointer' }}>
                    elige archivo
                    <input
                      type="file"
                      accept=".csv,text/csv,.txt,application/pdf,.pdf,.xml,text/xml,application/xml"
                      hidden
                      disabled={importing}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void ingestFile(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </>
              )}
            </p>
            <p className="muted">
              Acepta <strong>.csv</strong> / <strong>.txt</strong>, <strong>.xml</strong> y{' '}
              <strong>.pdf</strong> (texto seleccionable). Preferido: CSV o XML de movimientos.
              PDF: pdf.js en el navegador (build legacy + polyfill).
            </p>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={replaceOnImport}
              onChange={(e) => setReplaceOnImport(e.target.checked)}
            />
            Reemplazar todos los movimientos al importar (en vez de sumar)
          </label>

          <div className="actions" style={{ marginTop: '0.9rem' }}>
            <button
              type="button"
              className="btn"
              disabled={importing}
              onClick={() => void loadSample('santander')}
            >
              Probar CSV Santander
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={importing}
              onClick={() => void loadSample('mercado_pago')}
            >
              Probar CSV Mercado Pago
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={importing}
              onClick={() => void loadSample('mixto')}
            >
              Mes mixto
            </button>
          </div>
          <div className="actions" style={{ marginTop: '0.55rem' }}>
            <button
              type="button"
              className="btn"
              disabled={importing}
              onClick={() => void loadSample('movimientos_xml')}
            >
              Probar XML Banorte
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={importing}
              onClick={() => void loadSample('cfdi_xml')}
            >
              Probar XML CFDI
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={importing}
              onClick={() => void loadSample('santander_pdf')}
            >
              Probar PDF Santander
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={importing}
              onClick={() => void loadSample('mercado_pago_pdf')}
            >
              Probar PDF Mercado Pago
            </button>
          </div>
          <div className="actions" style={{ marginTop: '0.55rem' }}>
            <a className="btn secondary" href={assetUrl('sample-santander.csv')} download>
              Descargar CSV Santander
            </a>
            <a className="btn secondary" href={assetUrl('sample-movimientos.xml')} download>
              Descargar XML movimientos
            </a>
            <a className="btn secondary" href={assetUrl('sample-santander.pdf')} download>
              Descargar PDF Santander
            </a>
            <a className="btn secondary" href={assetUrl('sample-mercado-pago.pdf')} download>
              Descargar PDF Mercado Pago
            </a>
          </div>
          {message ? (
            <p className={`import-status ${importing ? 'import-status-busy' : ''}`} role="status">
              {message}
            </p>
          ) : null}
        </div>

        <div className="panel">
          <h2>Agregar movimiento</h2>
          <form onSubmit={addManual}>
            <div className="form-row">
              <label>
                Fecha
                <input
                  type="date"
                  value={manual.date}
                  onChange={(e) => setManual({ ...manual, date: e.target.value })}
                  required
                />
              </label>
              <label>
                Cuenta
                <input
                  value={manual.account}
                  onChange={(e) => setManual({ ...manual, account: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Descripción
                <input
                  value={manual.description}
                  onChange={(e) => setManual({ ...manual, description: e.target.value })}
                  required
                />
              </label>
              <label>
                Monto (negativo = gasto)
                <input
                  type="number"
                  step="0.01"
                  value={manual.amount}
                  onChange={(e) => setManual({ ...manual, amount: e.target.value })}
                  required
                />
              </label>
            </div>
            <button className="btn" type="submit">
              Guardar
            </button>
          </form>
        </div>
      </div>

      <div className="panel">
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <h2 style={{ margin: 0 }}>Transacciones del mes</h2>
          <div className="actions">
            <button type="button" className="btn danger" onClick={clearMonth} disabled={!monthTx.length}>
              Borrar mes
            </button>
            <button type="button" className="btn danger" onClick={clearAll} disabled={!transactions.length}>
              Borrar todo
            </button>
          </div>
        </div>
        {monthTx.length === 0 ? (
          <div className="empty">
            Aún no hay movimientos en este mes. Usa un ejemplo CSV/XML/PDF o sube tu propio archivo.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Cuenta</th>
                  <th>Monto</th>
                  <th>Categoría</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monthTx.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>{tx.description}</td>
                    <td>{tx.account}</td>
                    <td className={tx.amount < 0 ? 'amount-neg' : 'amount-pos'}>
                      {formatMxn(tx.amount)}
                    </td>
                    <td>
                      <select
                        value={tx.category}
                        onChange={(e) => onCategoryChange(tx.id, e.target.value as Category)}
                      >
                        {BUDGET_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn danger" onClick={() => removeTx(tx.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
