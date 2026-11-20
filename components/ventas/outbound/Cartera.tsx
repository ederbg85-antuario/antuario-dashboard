'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { allowedStages, dayMX, localDate, stageName, stages, type Deal } from '@/lib/outbound'

const groups = [
  { label: 'Contacto', keys: stages.slice(0, 7) },
  { label: 'Conversación', keys: stages.slice(7) },
]
function tone(stage: string) {
  if (['sin_respuesta', 'excluido'].includes(stage)) return 'stone'
  if (['agendada', 'realizada', 'propuesta'].includes(stage)) return 'blue'
  if (['respondio', 'prospectado', 'interes'].includes(stage)) return 'mint'
  return 'lilac'
}
function DueDate({ date }: { date: string | null }) {
  if (!date) return null
  const today = dayMX(new Date())
  return (
    <time dateTime={date} className={date < today ? 'ob-late' : ''}>
      {date === today ? 'Hoy' : localDate(date).replace(/ \d{4}$/, '')}
    </time>
  )
}
function DealCard({
  deal,
  owner,
  canWrite,
  open,
  drag,
}: {
  deal: Deal
  owner: string
  canWrite: boolean
  open: () => void
  drag: (id: string) => void
}) {
  const initials = deal.company
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase('es-MX')
  return (
    <button
      className="ob-record"
      draggable={canWrite}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id)
        e.dataTransfer.effectAllowed = 'move'
        drag(deal.id)
      }}
      onDragEnd={() => drag('')}
      onClick={open}
    >
      <span className="ob-identity">
        <span
          className="ob-monogram"
          data-palette={deal.company.charCodeAt(0) % 4}
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="ob-identity-text">
          <strong title={deal.company}>{deal.company}</strong>
          <small>{owner}</small>
        </span>
      </span>
      <span className="ob-record-stage" data-tone={tone(deal.stage)}>
        <i />
        {stageName(deal.stage)}
      </span>
      <span className="ob-record-next">
        <span title={deal.nextAction || undefined}>
          {deal.nextAction || 'Definir próxima acción'}
        </span>
        <DueDate date={deal.due} />
      </span>
    </button>
  )
}
type Props = {
  records: Deal[]
  view: string
  stage: string
  setStage: (s: string) => void
  due: string
  setDue: (s: string) => void
  owner: (d: Deal) => string
  canWrite: boolean
  open: (id: string, dest?: string) => void
}
export default function Cartera({
  records,
  view,
  stage,
  setStage,
  due,
  setDue,
  owner,
  canWrite,
  open,
}: Props) {
  const grid = useRef<HTMLDivElement>(null),
    [cap, setCap] = useState(4),
    [page, setPage] = useState(0),
    [drag, setDrag] = useState('')
  const [browsedGroup, setGroup] = useState(0)
  const group = stage ? Number(groups[1].keys.some(([s]) => s === stage)) : browsedGroup
  const board = view === 'Tablero',
    today = dayMX(new Date())
  const visible = records.filter(
    (d) =>
      (!stage || d.stage === stage) &&
      (!due || (!!d.due && (due === 'hoy' ? d.due === today : d.due < today))),
  )
  const pages = Math.max(1, Math.ceil(visible.length / cap)),
    index = Math.min(page, pages - 1),
    start = index * cap,
    pageRows = visible.slice(start, start + cap)
  const stageRows = records.filter((d) => !stage || d.stage === stage)
  const stageCounts = new Map<string, number>()
  for (const d of records)
    if (!due || (d.due && (due === 'hoy' ? d.due === today : d.due < today)))
      stageCounts.set(d.stage, (stageCounts.get(d.stage) || 0) + 1)
  const destinations = drag ? allowedStages(records.find((d) => d.id === drag)?.stage || '') : []
  useLayoutEffect(() => {
    const el = grid.current
    if (!el) return
    const measure = () => {
      const css = getComputedStyle(el),
        cols = board ? css.gridTemplateColumns.split(' ').filter(Boolean).length : 1
      const row = parseFloat(css.getPropertyValue('--ob-row')),
        gap = parseFloat(css.rowGap) || 0
      if (!Number.isFinite(row) || row <= 0) return
      setCap(Math.max(1, Math.floor((el.clientHeight + gap) / (row + gap))) * Math.max(1, cols))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [board])
  function selectStage(s: string) {
    setStage(s)
    setPage(0)
  }
  const choices = [
    ['', 'Todos', stageRows.length],
    ['hoy', 'Para hoy', stageRows.filter((d) => d.due === today).length],
    ['vencido', 'Vencidos', stageRows.filter((d) => d.due && d.due < today).length],
  ] as const
  return (
    <section className={'ob-workarea ' + (board ? '' : 'ob-directory')}>
      {board && (
        <aside className="ob-pipeline" aria-label="Etapas del pipeline">
          <div className="ob-rail-intro">
            <span className="ob-kicker">Pipeline</span>
            <button className="ob-all" aria-pressed={!stage} onClick={() => selectStage('')}>
              <span>Toda la cartera</span>
              <b>{records.length}</b>
            </button>
          </div>
          <div className="ob-rail-tabs">
            {groups.map((g, i) => (
              <button
                key={g.label}
                aria-pressed={group === i}
                onClick={() => {
                  setGroup(i)
                  if (stage && !g.keys.some(([s]) => s === stage))
                    selectStage(g.keys.find(([s]) => stageCounts.get(s))?.[0] || g.keys[0][0])
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <nav className="ob-steps" aria-label="Seleccionar etapa">
            {groups[group].keys.map(([s, label]) => (
              <button
                key={s}
                aria-pressed={stage === s}
                onDragOver={(e) => {
                  if (destinations.includes(s)) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDrop={(e) => {
                  if (drag && destinations.includes(s)) {
                    e.preventDefault()
                    open(drag, s)
                    setDrag('')
                  }
                }}
                data-destination={drag && destinations.includes(s) ? 'true' : undefined}
                className={stageCounts.get(s) ? 'ob-occupied' : ''}
                data-tone={tone(s)}
                onClick={() => selectStage(stage === s ? '' : s)}
              >
                <i />
                <span>{label}</span>
                <b>{stageCounts.get(s) || 0}</b>
              </button>
            ))}
          </nav>
        </aside>
      )}
      <div className="ob-ledger">
        <div className="ob-ledger-head">
          <h2>
            {board ? (stage ? stageName(stage) : 'Cartera de negocios') : 'Directorio de contactos'}
          </h2>
          <label className={'ob-stage-select ' + (!board ? 'ob-stage-directory' : '')}>
            <span>Etapa</span>
            <select value={stage} onChange={(e) => selectStage(e.target.value)}>
              <option value="">Todas las etapas</option>
              {groups.map((g) => (
                <optgroup label={g.label} key={g.label}>
                  {g.keys.map(([k, v]) => (
                    <option value={k} key={k}>
                      {v} ({stageCounts.get(k) || 0})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="ob-quick" aria-label="Seguimiento">
            {choices.map(([k, label, n]) => (
              <button
                key={k}
                aria-pressed={due === k}
                onClick={() => {
                  setDue(k)
                  setPage(0)
                }}
              >
                {label} <b>{n}</b>
              </button>
            ))}
          </div>
        </div>
        {drag && (
          <div className="ob-dropstrip" aria-label="Mover a etapa">
            {destinations.map((s) => (
              <button
                key={s}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  open(drag, s)
                  setDrag('')
                }}
              >
                {stageName(s)}
              </button>
            ))}
          </div>
        )}
        {!board && (
          <div className="ob-contact-head">
            <span>Negocio / persona</span>
            <span>Etapa</span>
            <span>Próxima acción</span>
            <span>Responsable</span>
          </div>
        )}
        <div ref={grid} className={board ? 'ob-record-grid' : 'ob-contact-list'}>
          {pageRows.map((d) =>
            board ? (
              <DealCard
                key={d.id}
                deal={d}
                owner={owner(d)}
                canWrite={canWrite}
                open={() => open(d.id)}
                drag={setDrag}
              />
            ) : (
              <button key={d.id} className="ob-contact-row" onClick={() => open(d.id)}>
                <span>
                  <strong>{d.company}</strong>
                  <small>
                    {[
                      ...(!d.primaryContact && d.name ? [d.name] : []),
                      ...d.people.map((p) => p.name),
                    ].join(', ') || 'Persona por identificar'}
                  </small>
                </span>
                <span className="ob-record-stage" data-tone={tone(d.stage)}>
                  <i />
                  {stageName(d.stage)}
                </span>
                <span className="ob-contact-action">
                  {d.nextAction || 'Definir próxima acción'} <DueDate date={d.due} />
                </span>
                <span className="ob-contact-owner">{owner(d)}</span>
              </button>
            ),
          )}
          {!visible.length && (
            <div className="ob-empty">
              <strong>
                {due === 'hoy'
                  ? 'Sin seguimientos para hoy'
                  : due === 'vencido'
                    ? 'Sin seguimientos vencidos'
                    : 'Sin negocios en esta selección'}
              </strong>
              {(stage || due) && (
                <button
                  onClick={() => {
                    selectStage('')
                    setDue('')
                  }}
                >
                  Ver toda la cartera
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="ob-pager">
          <span aria-live="polite">
            {visible.length
              ? start + 1 + '–' + Math.min(start + cap, visible.length) + ' de ' + visible.length
              : '0'}{' '}
            negocios
          </span>
          <div>
            <button
              aria-label="Página anterior"
              disabled={index === 0}
              onClick={() => setPage(index - 1)}
            >
              ‹
            </button>
            <span>
              {index + 1} / {pages}
            </span>
            <button
              aria-label="Página siguiente"
              disabled={index + 1 >= pages}
              onClick={() => setPage(index + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </div>
    </section>
  )
}
