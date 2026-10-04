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
import { loadTransactions, saveTransactions } from '../lib/storage'

const BUDGET_CATEGORIES: Category[] = ['costo_vida', 'diversion', 'ahorro', 'ingreso', 'ignorar']

type SampleId = 'mixto' | 'santander' | 'mercado_pago'

const SAMPLES: Record<SampleId, { file: string; label: string }> = {
  mixto: { file: '/sample-estado-cuenta.csv', label: 'Mes mixto' },
  santander: { file: '/sample-santander.csv', label: 'Santander (Cargo/Abono)' },
  mercado_pago: { file: '/sample-mercado-pago.csv', label: 'Mercado Pago' },
}

export function PresupuestoPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [month, setMonth] = useState(currentYearMonth())
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
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
    const text = await file.text()
    const { transactions: parsed, errors, detectedFormat } = parseStatementCsv(text, file.name)
    applyImport(parsed, `Importado «${file.name}»`, errors, detectedFormat)
  }

  async function loadSample(id: SampleId) {
    const sample = SAMPLES[id]
    const res = await fetch(sample.file)
    const text = await res.text()
    const { transactions: parsed, errors, detectedFormat } = parseStatementCsv(text)
    applyImport(parsed, `Ejemplo ${sample.label}`, errors, detectedFormat)
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
            Prueba primero con CSV: sube un estado de cuenta, revisa categorías y mide tu meta 50 /
            30 / 20. Los conectores automáticos vienen después.
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
        <h2>Cómo probar con tu CSV</h2>
        <ol className="howto">
          <li>
            Descarga un ejemplo abajo (Santander o Mercado Pago) <em>o</em> exporta movimientos desde
            SuperNET / Mercado Pago en CSV o Excel guardado como CSV.
          </li>
          <li>Arrástralo al área de carga. La app detecta fechas <code>DD/MM/YYYY</code> y columnas Cargo/Abono.</li>
          <li>Revisa el mes y corrige categorías con el menú de cada fila si hace falta.</li>
          <li>Mira si te acercas a 50% vida · 30% diversión · 20% ahorro.</li>
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
          <h2>Subir estado de cuenta (CSV)</h2>
          <div
            className={`dropzone ${dragOver ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void ingestFile(file)
            }}
          >
            <p>
              Arrastra un CSV aquí o{' '}
              <label style={{ color: 'var(--moss)', fontWeight: 700, cursor: 'pointer' }}>
                elige archivo
                <input
                  type="file"
                  accept=".csv,text/csv,.txt"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void ingestFile(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </p>
            <p className="muted">
              Formatos: <code>fecha, descripcion, monto</code> · o Santander{' '}
              <code>Fecha, Concepto, Cargo, Abono</code>
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
            <button type="button" className="btn" onClick={() => void loadSample('santander')}>
              Probar CSV Santander
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => void loadSample('mercado_pago')}
            >
              Probar CSV Mercado Pago
            </button>
            <button type="button" className="btn secondary" onClick={() => void loadSample('mixto')}>
              Mes mixto
            </button>
          </div>
          <div className="actions" style={{ marginTop: '0.55rem' }}>
            <a className="btn secondary" href="/sample-santander.csv" download>
              Descargar Santander
            </a>
            <a className="btn secondary" href="/sample-mercado-pago.csv" download>
              Descargar Mercado Pago
            </a>
          </div>
          {message ? <p className="muted">{message}</p> : null}
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
            Aún no hay movimientos en este mes. Usa «Probar CSV Santander» o sube tu propio archivo.
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
