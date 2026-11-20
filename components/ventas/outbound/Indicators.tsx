'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { channelName, dayMX, localDate, percent, type Metrics } from '@/lib/outbound'
export default function Indicators({
  seller,
  version,
  sellerSelect,
  configure,
}: {
  seller: string
  version: number
  sellerSelect: ReactNode
  configure?: () => void
}) {
  const [section, setSection] = useState('Embudo')
  const [week, setWeek] = useState(dayMX(new Date()))
  const queryKey = JSON.stringify([week, seller, version])
  const [result, setResult] = useState<{ key: string; data?: Metrics; error?: string } | null>(null)
  const m = result?.key === queryKey ? result.data : null
  const error = result?.key === queryKey ? result.error : null
  useEffect(() => {
    const controller = new AbortController()
    const q = new URLSearchParams({ view: 'metrics', week })
    if (seller) q.set('seller', seller)
    fetch('/api/prospeccion?' + q, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error('No se pudieron cargar los indicadores')
        const data = await r.json()
        if (!controller.signal.aborted) setResult({ key: queryKey, data })
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ key: queryKey, error: e.message })
      })
    return () => controller.abort()
  }, [week, seller, queryKey])
  return (
    <section className="ob-metrics">
      <div className="ob-metric-tools">
        <label className="ob-week">
          Semana del primer abordaje
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value || dayMX(new Date()))}
          />
        </label>
        {sellerSelect}
        {configure && (
          <button className="ob-tool" onClick={configure}>
            Configurar meta
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {!m && !error && <p role="status">Cargando indicadores…</p>}
      {m && (
        <div className="ob-stats-layout">
          <aside className="ob-stats-side">
            <article className="ob-score">
              <span className="ob-kicker">Meta semanal · CDMX</span>
              <h2>
                {m.funnel[0]} <small>/ {m.goal}</small>
              </h2>
              <span>Negocios únicos abordados</span>
              <progress
                max={m.goal || 1}
                value={m.funnel[0]}
                aria-label="Avance de la meta semanal"
              />
              <strong>{percent(m.funnel[0], m.goal)} de la meta</strong>
            </article>
            <article className="ob-due-total">
              <b>{m.overdue}</b>
              <span>Seguimientos vencidos hoy</span>
            </article>
          </aside>
          <section className="ob-stat-panel">
            <nav className="ob-stat-nav" aria-label="Detalle de indicadores">
              {['Embudo', 'Tendencia', 'Canales', 'Experimentos'].map((s) => (
                <button key={s} aria-pressed={section === s} onClick={() => setSection(s)}>
                  {s}
                </button>
              ))}
            </nav>
            <div className="ob-stat-content">
              {section === 'Embudo' && (
                <>
                  <h2>Embudo de la misma cohorte</h2>
                  <p className="ob-stat-context">Semana del {localDate(m.week)}</p>
                  <div className="ob-funnel-key">
                    <span>Etapa</span>
                    <span>Negocios</span>
                    <span>Conversión</span>
                  </div>
                  {[
                    'Abordados',
                    'Respondieron',
                    'Prospectados',
                    'Interés real',
                    'Reunión agendada',
                    'Reunión realizada',
                  ].map((name, i) => (
                    <div className="ob-funnel" key={name}>
                      <span>{name}</span>
                      <i>
                        <b
                          style={{
                            width: (m.funnel[0] ? (100 * m.funnel[i]) / m.funnel[0] : 0) + '%',
                          }}
                        />
                      </i>
                      <strong>{m.funnel[i]}</strong>
                      <small>
                        {i === 0
                          ? 'Base'
                          : m.funnel[i] +
                            ' / ' +
                            m.funnel[i - 1] +
                            ' · ' +
                            percent(m.funnel[i], m.funnel[i - 1])}
                      </small>
                    </div>
                  ))}
                </>
              )}
              {section === 'Tendencia' && (
                <>
                  <h2>Últimas cuatro semanas</h2>
                  <p className="ob-stat-context">Negocios con primer abordaje por semana</p>
                  <div className="ob-trend">
                    {m.trend.map((t) => (
                      <div key={t.week}>
                        <strong>{t.n}</strong>
                        <i
                          style={{
                            height: Math.max(
                              2,
                              (68 * t.n) / Math.max(1, ...m.trend.map((v) => v.n)),
                            ),
                          }}
                        />
                        <small>{localDate(t.week).replace(/ \d{4}$/, '')}</small>
                      </div>
                    ))}
                  </div>
                  <p>
                    Semana seleccionada <b>{m.trend[3].n}</b> · Anterior <b>{m.trend[2].n}</b> ·
                    Diferencia <b>{m.trend[3].n - m.trend[2].n}</b>
                  </p>
                </>
              )}
              {section === 'Canales' && (
                <>
                  <h2>Respuesta por canal</h2>
                  <table>
                    <thead>
                      <tr>
                        {['Canal', 'Intentos', 'Con respuesta', 'Tasa'].map((k) => (
                          <th key={k}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.channels.map((c) => (
                        <tr key={c.channel}>
                          <td>{channelName(c.channel)}</td>
                          <td>{c.attempts}</td>
                          <td>{c.responses}</td>
                          <td>{percent(c.responses, c.attempts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="ob-stat-context">
                    Cada respuesta se atribuye al último intento previo por ese canal.
                  </p>
                </>
              )}
              {section === 'Experimentos' && (
                <>
                  <h2>Experimentos de la cohorte</h2>
                  {!m.experiments.length && (
                    <p className="ob-stat-context">Sin datos de experimentos para esta semana.</p>
                  )}
                  {m.experiments.map((e) => (
                    <article className="ob-experiment" key={e.experiment}>
                      <strong>{e.experiment}</strong>
                      <p>
                        Base {e.base_yes}/{e.base} · {percent(e.base_yes, e.base)}
                        <br />
                        Prueba {e.test_yes}/{e.test} · {percent(e.test_yes, e.test)}
                      </p>
                      <b>
                        {e.base && e.test
                          ? ((e.test_yes / e.test - e.base_yes / e.base) * 100).toLocaleString(
                              'es-MX',
                              { maximumFractionDigits: 1 },
                            ) + ' pp'
                          : 'Sin datos'}
                      </b>
                    </article>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
