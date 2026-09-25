import { AGGREGATOR_RECOMMENDATION, CONNECTORS } from '../lib/connectors'

export function ConectoresPage() {
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Conectores</h1>
          <p>
            Qué se puede automatizar hoy con Santander, Mercado Pago, Actinver Trade y Bitso — y qué
            sigue siendo captura manual o CSV.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>Recomendación</h2>
        <p>
          Para unificar tu banca y wallets en México, el camino más corto es{' '}
          <strong>{AGGREGATOR_RECOMMENDATION.name}</strong>: {AGGREGATOR_RECOMMENDATION.why}
        </p>
        <p>
          <a href={AGGREGATOR_RECOMMENDATION.link} target="_blank" rel="noreferrer">
            syncfy.com →
          </a>
        </p>
        <ol>
          {AGGREGATOR_RECOMMENDATION.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="grid-2">
        {CONNECTORS.map((connector) => (
          <article key={connector.id} className="panel connector">
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ marginBottom: 0 }}>{connector.name}</h2>
                <div className="muted">{connector.institution}</div>
              </div>
              <span className={`chip ${connector.status}`}>
                {connector.status === 'listo'
                  ? 'Automatizable'
                  : connector.status === 'parcial'
                    ? 'Parcial'
                    : 'Manual'}
              </span>
            </div>
            <p>{connector.summary}</p>
            <div className="connector-options">
              {connector.options.map((option) => (
                <div key={option.title} className="option">
                  <strong>{option.title}</strong>
                  <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                    {option.detail}
                  </p>
                  {option.link ? (
                    <p style={{ margin: '0.45rem 0 0' }}>
                      <a href={option.link} target="_blank" rel="noreferrer">
                        Documentación
                      </a>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="panel">
        <h2>Cómo encaja con Caudal</h2>
        <ul>
          <li>
            <strong>Hoy:</strong> CSV + captura manual en Presupuesto y Balance (listo para usar).
          </li>
          <li>
            <strong>Fase 2:</strong> Syncfy widget → sincronizar movimientos de Santander, Mercado
            Pago y Bitso al Presupuesto.
          </li>
          <li>
            <strong>Fase 2b:</strong> Bitso Trading API directa para refrescar saldos crypto en el
            Balance (HMAC + API keys).
          </li>
          <li>
            <strong>Actinver:</strong> permanece manual / CSV hasta que un agregador vuelva a
            cubrirlo.
          </li>
        </ul>
      </div>
    </div>
  )
}
