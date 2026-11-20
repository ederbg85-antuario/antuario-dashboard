'use client'
import { useState, useRef, useEffect } from 'react'
import {
  allowedStages,
  channelName,
  dayMX,
  localDate,
  stageName,
  stages,
  type Workspace,
  type Command,
  type Deal,
} from '@/lib/outbound'
import Ficha, { Sheet, Field, fields } from './Ficha'
import Indicators from './Indicators'
import './outbound.css'
export default function Prospecting({
  initial,
  initialId,
}: {
  initial: Workspace
  initialId?: string
}) {
  const [w, setW] = useState(initial),
    [view, setView] = useState('Tablero'),
    [id, setId] = useState(initialId || ''),
    [target, setTarget] = useState('')
  const [add, setAdd] = useState(false),
    [goal, setGoal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('')
  const [seller, setSeller] = useState(''),
    [stage, setStage] = useState(''),
    [channel, setChannel] = useState(''),
    [due, setDue] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [search, setSearch] = useState(''),
    [source, setSource] = useState(''),
    [zone, setZone] = useState('')
  const [version, setVersion] = useState(0),
    [drag, setDrag] = useState('')
  const lock = useRef(false),
    retry = useRef({ key: '', uuid: '' })
  const today = dayMX(new Date()),
    selected = w.deals.find((d) => d.id === id)
  function open(deal: string, dest = '') {
    setId(deal)
    setTarget(dest)
    setError('')
    const u = new URL(location.href)
    if (deal) u.searchParams.set('negocio', deal)
    else u.searchParams.delete('negocio')
    history.replaceState(null, '', u)
  }
  async function refresh() {
    const r = await fetch('/api/prospeccion', { cache: 'no-store' })
    if (!r.ok) throw Error('No se pudo actualizar la cartera')
    const next: Workspace = await r.json()
    setW(next)
    setVersion((v) => v + 1)
    return next
  }
  useEffect(() => {
    const onFocus = () => {
      refresh().catch(() => setError('No se pudo actualizar la cartera. Recarga la página.'))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  async function save(cmd: Command) {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setError('')
    setStatus('')
    const key = JSON.stringify(cmd)
    if (retry.current.key !== key) retry.current = { key, uuid: crypto.randomUUID() }
    try {
      const r = await fetch('/api/prospeccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cmd, request: retry.current.uuid }),
      })
      const body = await r.json()
      if (!r.ok) {
        if (r.status === 403 || r.status === 409) {
          const fresh = await refresh()
          if (id && !fresh.deals.some((d) => d.id === id)) open('')
        }
        throw Error(body.error || 'No se pudo guardar')
      }
      const fresh = await refresh()
      retry.current = { key: '', uuid: '' }
      setAdd(false)
      setGoal(false)
      if (cmd.op === 'create' && fresh.deals.some((d) => d.id === body.id)) open(body.id)
      else if (id && !fresh.deals.some((d) => d.id === id)) open('')
      setStatus(
        cmd.op === 'move' && cmd.stage === 'agendada'
          ? 'Reunión entregada a dirección.'
          : 'Cambio guardado.',
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const owner = (d: Deal) =>
    w.members.find((m) => m.id === d.owner)?.label || (d.owner ? 'Responsable' : 'Sin asignar')
  const filtered = w.deals.filter((d) => {
    const needle = search.trim().toLocaleLowerCase('es-MX')
    return (
      (!seller || (seller === 'none' ? !d.owner : d.owner === seller)) &&
      (!stage || d.stage === stage) &&
      (!channel || d.history.some((a) => a.channel === channel)) &&
      (!source || d.source === source) &&
      (!zone || d.zone === zone) &&
      (!due || (!!d.due && (due === 'hoy' ? d.due === today : d.due < today))) &&
      (!from || dayMX(d.changed) >= from) &&
      (!to || dayMX(d.changed) <= to) &&
      (!needle ||
        [d.company, d.name, d.email, ...d.people.flatMap((p) => [p.name, p.email])].some((s) =>
          s?.toLocaleLowerCase('es-MX').includes(needle),
        ))
    )
  })
  function lane(group: readonly (readonly [string, string])[], title: string) {
    return (
      <section className="ob-lane">
        <h2>{title}</h2>
        <div className="ob-columns">
          {group.map(([key, label]) => {
            const rows = filtered.filter((d) => d.stage === key),
              possible =
                !!drag &&
                allowedStages(w.deals.find((d) => d.id === drag)?.stage || '').includes(key)
            return (
              <section
                key={key}
                className={'ob-column' + (possible ? ' ob-drop' : '')}
                onDragOver={(e) => {
                  if (possible) e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (possible) open(drag, key)
                  setDrag('')
                }}
              >
                <h3>
                  {label} <small>{rows.length}</small>
                </h3>
                <div className="ob-stack">
                  {rows.map((d) => (
                    <button
                      type="button"
                      className="ob-card"
                      key={d.id}
                      draggable={w.canWrite}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', d.id)
                        setDrag(d.id)
                      }}
                      onDragEnd={() => setDrag('')}
                      onClick={() => open(d.id)}
                    >
                      <strong>{d.company}</strong>
                      <span>{owner(d)}</span>
                      <small>
                        {d.nextAction || 'Definir próxima acción'}
                        {d.due ? ' · ' + localDate(d.due) : ''}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    )
  }
  return (
    <main className="op-workspace ob">
      <header className="op-page-heading">
        <div>
          <p className="op-eyebrow">ANTUARIO / VENTAS</p>
          <h1>Prospección</h1>
        </div>
        {w.canWrite && (
          <button
            className="op-button"
            onClick={() => {
              setError('')
              setAdd(true)
            }}
          >
            ＋ Nuevo negocio
          </button>
        )}
      </header>
      <nav className="ob-tabs" aria-label="Vistas de Prospección">
        {['Tablero', 'Contactos', 'Indicadores'].map((v) => (
          <button
            aria-pressed={view === v}
            key={v}
            onClick={() => {
              setView(v)
              if (v === 'Indicadores' && seller === 'none') setSeller('')
            }}
          >
            {v}
          </button>
        ))}
      </nav>
      <div className="ob-filters">
        {w.admin && (
          <label>
            Vendedor
            <select value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="">Equipo comercial</option>
              {view !== 'Indicadores' && <option value="none">Sin asignar</option>}
              {w.members.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {view !== 'Indicadores' && (
          <>
            <label>
              Buscar negocio o persona
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>
              Etapa
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">Todas</option>
                {stages.map(([k, s]) => (
                  <option key={k} value={k}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seguimiento
              <select value={due} onChange={(e) => setDue(e.target.value)}>
                <option value="">Todos</option>
                <option value="hoy">Para hoy</option>
                <option value="vencido">Vencidos</option>
              </select>
            </label>
            <details className="ob-more">
              <summary>Más filtros</summary>
              <div>
                <label>
                  Canal
                  <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="">Todos</option>
                    {['email', 'whatsapp', 'llamada', 'linkedin', 'visita'].map((k) => (
                      <option key={k} value={k}>
                        {channelName(k)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Origen
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="">Todos</option>
                    {Array.from(new Set(w.deals.map((d) => d.source).filter(Boolean)))
                      .sort()
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Zona
                  <select value={zone} onChange={(e) => setZone(e.target.value)}>
                    <option value="">Todas</option>
                    {Array.from(new Set(w.deals.flatMap((d) => (d.zone ? [d.zone] : []))))
                      .sort()
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Actividad desde
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label>
                  Actividad hasta
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
            </details>
          </>
        )}
        {view === 'Indicadores' && w.admin && (
          <button
            onClick={() => {
              setError('')
              setGoal(true)
            }}
          >
            Configurar meta
          </button>
        )}
      </div>
      {status && <p role="status">{status}</p>}
      {!selected && !add && !goal && error && <p role="alert">{error}</p>}
      {view === 'Tablero' && (
        <>
          {lane(stages.slice(0, 7), 'Contacto inicial y seguimiento')}
          {lane(stages.slice(7, 13), 'Conversación y reunión')}
          {filtered.some((d) => d.stage === 'excluido') && lane(stages.slice(13), 'Exclusiones')}
        </>
      )}
      {view === 'Contactos' && (
        <section className="op-card ob-table">
          <h2>
            Contactos y seguimiento{' '}
            <small>
              {filtered.length} {filtered.length === 1 ? 'negocio' : 'negocios'}
            </small>
          </h2>
          <div>
            <table>
              <thead>
                <tr>
                  {['Negocio', 'Personas', 'Vendedor', 'Etapa', 'Próxima acción', 'Fecha'].map(
                    (k) => (
                      <th key={k}>{k}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button onClick={() => open(d.id)}>{d.company}</button>
                    </td>
                    <td>
                      {[
                        ...(!d.primaryContact && d.name ? [d.name] : []),
                        ...d.people.map((p) => p.name),
                      ].join(', ') || 'Por identificar'}
                    </td>
                    <td>{owner(d)}</td>
                    <td>{stageName(d.stage)}</td>
                    <td>{d.nextAction || 'Por definir'}</td>
                    <td>{d.due ? localDate(d.due) : 'Sin fecha'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && <p>Sin negocios para estos filtros.</p>}
        </section>
      )}
      {view === 'Indicadores' && <Indicators seller={seller} version={version} />}
      {selected && (
        <Ficha
          key={selected.id}
          d={selected}
          w={w}
          target={target}
          close={() => open('')}
          busy={busy}
          error={error}
          save={save}
        />
      )}
      {add && (
        <Sheet title="Nuevo negocio" close={() => setAdd(false)}>
          <form onSubmit={(e) => save({ ...fields(e), op: 'create' })}>
            <Field name="company" label="Nombre del negocio" required />
            <Field name="domain" label="Dominio del negocio (opcional)" />
            <Field name="source" label="Origen" required />
            <Field name="zone" label="Zona" />
            <Field name="name" label="Persona principal" />
            <Field name="position" label="Cargo" />
            <Field name="email" label="Correo" type="email" />
            <Field name="phone" label="Teléfono" />
            {w.admin && (
              <label>
                Responsable
                <select name="owner" defaultValue={w.userId}>
                  <option value="">Sin asignar</option>
                  {w.members
                    .filter((m) => m.writable)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <button disabled={busy} className="op-button">
              Guardar negocio
            </button>
          </form>
        </Sheet>
      )}
      {goal && (
        <Sheet title="Meta semanal por vendedor" close={() => setGoal(false)}>
          <form onSubmit={(e) => save({ ...fields(e), op: 'goal' })}>
            <Field
              name="goal"
              label="Negocios únicos por semana"
              type="number"
              value={String(w.goal)}
              required
            />
            {error && <p role="alert">{error}</p>}
            <button className="op-button" disabled={busy}>
              Guardar meta
            </button>
          </form>
        </Sheet>
      )}
    </main>
  )
}
