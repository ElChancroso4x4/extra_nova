import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Caudal</h1>
        <p>
          Sube tus estados de cuenta, acomoda el mes en 50 / 30 / 20 y mira tu patrimonio en un solo
          balance.
        </p>
        <div className="hero-actions">
          <Link className="btn ghost" to="/presupuesto">
            Empezar presupuesto
          </Link>
          <Link className="btn secondary" to="/balance">
            Ver balance
          </Link>
        </div>
      </section>

      <div className="home-modules">
        <Link className="module-link" to="/presupuesto">
          <strong>1 · Presupuesto</strong>
          <span>
            Extrae transacciones de tus tarjetas y cuentas, categorízalas y mide tus objetivos
            mensuales.
          </span>
        </Link>
        <Link className="module-link" to="/balance">
          <strong>2 · Balance general</strong>
          <span>
            Concentra saldos de bancos, Actinver, Bitso y pasivos para calcular tu patrimonio neto.
          </span>
        </Link>
        <Link className="module-link" to="/conectores">
          <strong>3 · Conectores</strong>
          <span>
            Rutas reales para automatizar Santander, Mercado Pago, Actinver Trade y Bitso.
          </span>
        </Link>
      </div>
    </>
  )
}
