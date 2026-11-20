'use client'
import { useEffect, useState } from 'react'
import { channelName, dayMX, localDate, percent, type Metrics } from '@/lib/outbound'
export default function Indicators({ seller, version }: { seller: string; version: number }) {
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
      <label>
        Semana del primer abordaje
        <input
          type="date"
          value={week}
          onChange={(e) => setWeek(e.target.value || dayMX(new Date()))}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {!m && !error && <p role="status">Cargando indicadores…</p>}
      {m && (
        <>
          <div className="ob-insights">
            <article className="ob-goal">
              <p className="op-eyebrow">Meta semanal · CDMX</p>
              <h2>
                {m.funnel[0]} <small>/ {m.goal}</small>
              </h2>
              <p>Negocios únicos abordados · {percent(m.funnel[0], m.goal)}</p>
              <p>Semana del {localDate(m.week)}</p>
            </article>
            <article className="op-card">
              <h2>Embudo de la misma cohorte</h2>
              {[
                'Abordados',
                'Respondieron',
                'Prospectados',
                'Interés real',
                'Reunión agendada',
                'Reunión realizada',
              ].map((label, i) => (
                <div className="ob-funnel" key={label}>
                  <span>{label}</span>
                  <i>
                    <b
                      style={{ width: (m.funnel[0] ? (100 * m.funnel[i]) / m.funnel[0] : 0) + '%' }}
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
            </article>
          </div>
          <div className="ob-grid">
            <article className="op-card">
              <h2>Últimas cuatro semanas</h2>
              <div className="ob-trend">
                {m.trend.map((t) => (
                  <div key={t.week}>
                    <strong>{t.n}</strong>
                    <i
                      style={{
                        height: Math.max(2, (64 * t.n) / Math.max(1, ...m.trend.map((t) => t.n))),
                      }}
                    />
                    <small>{localDate(t.week).replace(/ \d{4}$/, '')}</small>
                  </div>
                ))}
              </div>
              <p>
                Semana seleccionada {m.trend[3].n} · Anterior {m.trend[2].n} · Diferencia{' '}
                {m.trend[3].n - m.trend[2].n}
              </p>
            </article>
            <article className="op-card">
              <h2>Respuesta por canal</h2>
              <table>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Intentos</th>
                    <th>Con respuesta</th>
                    <th>Tasa</th>
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
              <p>La respuesta se atribuye al último intento anterior por el mismo canal.</p>
            </article>
            <article className="op-card">
              <h2>Seguimientos vencidos hoy</h2>
              <strong className="ob-total">{m.overdue}</strong>
              <p>Próximas acciones con fecha anterior a hoy en Ciudad de México.</p>
            </article>
            <article className="op-card">
              <h2>Experimentos de la cohorte</h2>
              {!m.experiments.length && <p>Sin datos de experimentos para esta semana.</p>}
              {m.experiments.map((e) => (
                <div key={e.experiment}>
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
                </div>
              ))}
            </article>
          </div>
        </>
      )}
    </section>
  )
}
