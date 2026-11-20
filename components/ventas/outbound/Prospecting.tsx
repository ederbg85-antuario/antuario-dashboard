'use client'
import { useState, useRef, useEffect } from 'react'
import { channelName, dayMX, stages, type Workspace, type Command, type Deal } from '@/lib/outbound'
import Ficha, { Sheet, Field, fields } from './Ficha'
import WosScene from '@/components/workspace/WosScene'
import Indicators from './Indicators'
import Cartera from './Cartera'
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
    [filtersOpen, setFiltersOpen] = useState(false)
  const lock = useRef(false),
    retry = useRef({ key: '', uuid: '' })
  const selected = w.deals.find((d) => d.id === id)
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
      (!channel || d.history.some((a) => a.channel === channel)) &&
      (!source || d.source === source) &&
      (!zone || d.zone === zone) &&
      (!from || dayMX(d.changed) >= from) &&
      (!to || dayMX(d.changed) <= to) &&
      (!needle ||
        [d.company, d.name, d.email, ...d.people.flatMap((p) => [p.name, p.email])].some((s) =>
          s?.toLocaleLowerCase('es-MX').includes(needle),
        ))
    )
  })
  const advanced = [channel, from, to, source, zone].filter(Boolean).length
  const sellerSelect = w.admin && (
    <label className="ob-seller">
      <span className="sr-only">Vendedor</span>
      <select value={seller} onChange={(e) => setSeller(e.target.value)}>
        <option value="">Equipo comercial</option>
        {view !== 'Indicadores' && <option value="none">Sin asignar</option>}
        {w.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <section className="op-workspace ob" aria-label="Prospección">
      <div className="ob-console">
        <aside className="ob-overview" aria-label="Cartera de prospección">
          <div className="ob-overview-hero">
            <div className="ob-title">
              <div>
                <h1>Prospección</h1>
                <p>
                  {w.deals.length}{' '}
                  {w.deals.length === 1 ? 'negocio en cartera' : 'negocios en cartera'}
                </p>
              </div>
            </div>
            <figure className="ob-woss" aria-label="Woss, mascota de Antuario">
              <WosScene variant="peace" motion={false} />
            </figure>
          </div>
          {view !== 'Indicadores' && (
            <div className="ob-toolbar">
              <label className="ob-search">
                <i aria-hidden="true" />
                <span className="sr-only">Buscar negocio o persona</span>
                <input
                  type="search"
                  placeholder="Buscar en cartera"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {sellerSelect}
              <button
                className="ob-tool"
                aria-haspopup="dialog"
                onClick={() => setFiltersOpen(true)}
              >
                <i className="ob-sliders" aria-hidden="true" />
                Más filtros{advanced > 0 && <b>{advanced}</b>}
                {seller && <i aria-label="Vendedor seleccionado" className="ob-seller-indicator" />}
              </button>
            </div>
          )}
        </aside>
        <div className="ob-desk">
          <header className="ob-top">
            {' '}
            <nav className="ob-view-tabs" aria-label="Vistas de Prospección">
              {['Tablero', 'Contactos', 'Indicadores'].map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v)
                    setStatus('')
                    if (v === 'Indicadores' && seller === 'none') setSeller('')
                  }}
                >
                  {v}
                </button>
              ))}
            </nav>
            {w.canWrite && (
              <button
                className="ob-primary ob-new"
                onClick={() => {
                  setError('')
                  setAdd(true)
                }}
              >
                <span aria-hidden="true">＋</span> Nuevo negocio
              </button>
            )}
          </header>
          {status && (
            <p className="ob-feedback" role="status">
              {status}
            </p>
          )}
          {!selected && !add && !goal && error && <p role="alert">{error}</p>}
          {view !== 'Indicadores' && (
            <Cartera
              key={JSON.stringify([view, seller, channel, from, to, search, source, zone])}
              view={view}
              records={filtered}
              stage={stage}
              setStage={setStage}
              due={due}
              setDue={setDue}
              owner={owner}
              canWrite={w.canWrite}
              open={open}
            />
          )}
          {view === 'Indicadores' && (
            <Indicators
              seller={seller}
              version={version}
              sellerSelect={sellerSelect}
              configure={
                w.admin
                  ? () => {
                      setError('')
                      setGoal(true)
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
      {filtersOpen && (
        <Sheet title="Filtros de cartera" close={() => setFiltersOpen(false)}>
          <div className="ob-filter-form">
            {w.admin && (
              <div className="ob-mobile-seller">
                <span>Vendedor</span>
                {sellerSelect}
              </div>
            )}
            <div className="ob-grid">
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
            <div className="ob-filter-actions">
              <button
                onClick={() => {
                  setStage('')
                  setDue('')
                  setChannel('')
                  setSource('')
                  setZone('')
                  setFrom('')
                  setTo('')
                  setSearch('')
                  setSeller('')
                }}
              >
                Limpiar filtros
              </button>
              <button className="ob-primary" onClick={() => setFiltersOpen(false)}>
                Ver resultados
              </button>
            </div>
          </div>
        </Sheet>
      )}
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
          <form className="ob-create" onSubmit={(e) => save({ ...fields(e), op: 'create' })}>
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
    </section>
  )
}
