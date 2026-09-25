import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { computeBalanceSheet } from '../lib/balance'
import { formatMxn } from '../lib/goals'
import { loadAccounts, saveAccounts } from '../lib/storage'
import {
  KIND_LABELS,
  type AccountKind,
  type BalanceAccount,
} from '../lib/types'

const KINDS: AccountKind[] = ['banco', 'inversion', 'crypto', 'efectivo', 'pasivo']

const SEED: Omit<BalanceAccount, 'id'>[] = [
  {
    name: 'Cuenta de débito',
    institution: 'Santander',
    kind: 'banco',
    balance: 28500,
    currency: 'MXN',
    updatedAt: new Date().toISOString().slice(0, 10),
  },
  {
    name: 'Mercado Pago',
    institution: 'Mercado Pago',
    kind: 'banco',
    balance: 4200,
    currency: 'MXN',
    updatedAt: new Date().toISOString().slice(0, 10),
  },
  {
    name: 'Portafolio Trade',
    institution: 'Actinver Trade',
    kind: 'inversion',
    balance: 120000,
    currency: 'MXN',
    updatedAt: new Date().toISOString().slice(0, 10),
  },
  {
    name: 'Crypto spot',
    institution: 'Bitso',
    kind: 'crypto',
    balance: 18500,
    currency: 'MXN',
    updatedAt: new Date().toISOString().slice(0, 10),
  },
  {
    name: 'Tarjeta de crédito',
    institution: 'Santander',
    kind: 'pasivo',
    balance: 9600,
    currency: 'MXN',
    updatedAt: new Date().toISOString().slice(0, 10),
  },
]

export function BalancePage() {
  const [accounts, setAccounts] = useState<BalanceAccount[]>([])
  const [form, setForm] = useState({
    name: '',
    institution: 'Santander',
    kind: 'banco' as AccountKind,
    balance: '',
    currency: 'MXN' as 'MXN' | 'USD',
  })

  useEffect(() => {
    const existing = loadAccounts()
    setAccounts(existing)
  }, [])

  useEffect(() => {
    saveAccounts(accounts)
  }, [accounts])

  const sheet = useMemo(() => computeBalanceSheet(accounts), [accounts])

  function addAccount(e: FormEvent) {
    e.preventDefault()
    const balance = Number.parseFloat(form.balance)
    if (!form.name || Number.isNaN(balance)) return
    const account: BalanceAccount = {
      id: crypto.randomUUID(),
      name: form.name,
      institution: form.institution,
      kind: form.kind,
      balance,
      currency: form.currency,
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    setAccounts((prev) => [account, ...prev])
    setForm((f) => ({ ...f, name: '', balance: '' }))
  }

  function updateBalance(id: string, balance: number) {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, balance, updatedAt: new Date().toISOString().slice(0, 10) }
          : a,
      ),
    )
  }

  function removeAccount(id: string) {
    setAccounts((prev) => prev.filter((a) => a.id !== id))
  }

  function seedDemo() {
    setAccounts(
      SEED.map((a) => ({
        ...a,
        id: crypto.randomUUID(),
      })),
    )
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Balance general</h1>
          <p>
            Registra saldos de bancos, inversiones y crypto. Los pasivos se restan para obtener tu
            patrimonio neto.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={seedDemo}>
            Cargar saldos demo
          </button>
        </div>
      </div>

      <div className="grid-3">
        <div className="panel">
          <div className="stat-label">Activos</div>
          <div className="stat-value">{formatMxn(sheet.assets)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Pasivos</div>
          <div className="stat-value">{formatMxn(sheet.liabilities)}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Patrimonio neto</div>
          <div className="stat-value">{formatMxn(sheet.netWorth)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Agregar cuenta o inversión</h2>
          <form onSubmit={addAccount}>
            <div className="form-row">
              <label>
                Nombre
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Cuenta débito"
                  required
                />
              </label>
              <label>
                Institución
                <input
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  list="institutions"
                />
                <datalist id="institutions">
                  <option value="Santander" />
                  <option value="Mercado Pago" />
                  <option value="Actinver Trade" />
                  <option value="Bitso" />
                </datalist>
              </label>
            </div>
            <div className="form-row">
              <label>
                Tipo
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Moneda
                <select
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value as 'MXN' | 'USD' })
                  }
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD (≈17 MXN)</option>
                </select>
              </label>
              <label>
                Saldo
                <input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  required
                />
              </label>
            </div>
            <button className="btn" type="submit">
              Agregar al balance
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Composición</h2>
          {Object.keys(sheet.byKind).length === 0 ? (
            <div className="empty">Sin cuentas todavía.</div>
          ) : (
            <div className="goal-row">
              {Object.entries(sheet.byKind).map(([kind, value]) => (
                <div key={kind}>
                  <div className="goal-meta">
                    <span>{KIND_LABELS[kind as AccountKind] ?? kind}</span>
                    <span>{formatMxn(value)}</span>
                  </div>
                  <div className="bar">
                    <span
                      style={{
                        width: `${sheet.assets + sheet.liabilities === 0 ? 0 : Math.min((Math.abs(value) / (sheet.assets + sheet.liabilities)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Cuentas</h2>
        {accounts.length === 0 ? (
          <div className="empty">
            Agrega tus saldos de Santander, Mercado Pago, Actinver y Bitso, o carga el demo.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Institución</th>
                  <th>Tipo</th>
                  <th>Saldo</th>
                  <th>Actualizado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.institution}</td>
                    <td>
                      <span className="chip">{KIND_LABELS[account.kind]}</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={account.balance}
                        onChange={(e) =>
                          updateBalance(account.id, Number.parseFloat(e.target.value) || 0)
                        }
                        style={{ maxWidth: 140 }}
                      />{' '}
                      {account.currency}
                    </td>
                    <td>{account.updatedAt}</td>
                    <td>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => removeAccount(account.id)}
                      >
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
