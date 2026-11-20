'use client'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { allowedStages, dayMX, localDate, stageName, stages, type Deal } from '@/lib/outbound'

const phases = [
  { label: 'Primer contacto', keys: stages.slice(0, 3) },
  { label: 'Seguimiento', keys: stages.slice(3, 7) },
  { label: 'Conversación', keys: stages.slice(7, 10) },
  { label: 'Reuniones y cierre', keys: stages.slice(10) },
]
function phaseFor(stage: string) {
  return phases.findIndex((p) => p.keys.some(([key]) => key === stage))
}
function tone(stage: string) {
  return ['lilac', 'mint', 'blue', 'stone'][Math.max(0, phaseFor(stage))]
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
        <span className="ob-monogram" aria-hidden="true">
          {initials}
        </span>
        <span className="ob-identity-text">
          <strong title={deal.company}>{deal.company}</strong>
          <small>{owner}</small>
        </span>
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
function useCapacity(ref: RefObject<HTMLDivElement | null>) {
  const [capacity, setCapacity] = useState(3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    function measure() {
      if (!el?.clientWidth || !el.clientHeight) return
      const style = getComputedStyle(el),
        height = parseFloat(style.getPropertyValue('--ob-row')),
        gap = parseFloat(style.rowGap) || 0
      if (!height) return
      const columns = style.gridTemplateColumns.split(' ').filter((t) => parseFloat(t) > 0).length
      setCapacity(
        Math.max(1, columns) * Math.max(1, Math.floor((el.clientHeight + gap) / (height + gap))),
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [ref])
  return capacity
}
function Pager({
  page,
  capacity,
  total,
  setPage,
  label,
}: {
  page: number
  capacity: number
  total: number
  setPage: (n: number) => void
  label: string
}) {
  const first = page * capacity
  return (
    <footer className="ob-pager" aria-label={'Paginación de ' + label}>
      <span aria-live="polite">
        {total
          ? first + 1 + '–' + Math.min(first + capacity, total) + ' de ' + total
          : '0 negocios'}
      </span>
      <div>
        <button
          aria-label={'Página anterior de ' + label}
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          ‹
        </button>
        <button
          aria-label={'Página siguiente de ' + label}
          disabled={first + capacity >= total}
          onClick={() => setPage(page + 1)}
        >
          ›
        </button>
      </div>
    </footer>
  )
}
function Lane({
  stage,
  rows,
  owner,
  canWrite,
  open,
  drag,
  setDrag,
}: {
  stage: string
  rows: Deal[]
  owner: Props['owner']
  canWrite: boolean
  open: Props['open']
  drag: Deal | undefined
  setDrag: (id: string) => void
}) {
  const grid = useRef<HTMLDivElement>(null),
    capacity = useCapacity(grid),
    [page, setPage] = useState(0)
  const index = Math.max(0, Math.min(page, Math.ceil(rows.length / capacity) - 1))
  const destination = !!drag && allowedStages(drag.stage).includes(stage),
    label = stageName(stage)
  return (
    <section
      className="ob-kanban-lane"
      data-stage={stage}
      data-destination={destination || undefined}
      aria-label={label}
      onDragOver={(e) => {
        if (destination) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(e) => {
        if (drag && destination) {
          e.preventDefault()
          open(drag.id, stage)
          setDrag('')
        }
      }}
    >
      <header className="ob-lane-title">
        <i aria-hidden="true" />
        <h3>{label}</h3>
        <b aria-label={rows.length + (rows.length === 1 ? ' negocio' : ' negocios')}>
          {rows.length}
        </b>
      </header>
      <div ref={grid} className="ob-lane-grid">
        {rows.slice(index * capacity, (index + 1) * capacity).map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            owner={owner(d)}
            canWrite={canWrite}
            open={() => open(d.id)}
            drag={setDrag}
          />
        ))}
        {!rows.length && (
          <div className="ob-lane-empty">{destination ? 'Soltar aquí' : 'Sin negocios'}</div>
        )}
      </div>
      {rows.length > 0 && (
        <Pager
          page={index}
          capacity={capacity}
          total={rows.length}
          setPage={setPage}
          label={label}
        />
      )}
    </section>
  )
}
function Board({
  rows,
  stage,
  setStage,
  owner,
  canWrite,
  open,
  quick,
}: { rows: Deal[]; quick: React.ReactNode } & Pick<
  Props,
  'stage' | 'setStage' | 'owner' | 'canWrite' | 'open'
>) {
  const [selected, setSelected] = useState(
      stage || stages.find(([k]) => rows.some((d) => d.stage === k))?.[0] || stages[0][0],
    ),
    [dragId, setDrag] = useState('')
  const [jump, setJump] = useState(selected)
  const track = useRef<HTMLDivElement>(null)
  const phase = Math.max(0, phaseFor(stage || selected)),
    keys = stage ? phases[phase].keys.filter(([k]) => k === stage) : phases[phase].keys
  const drag = rows.find((d) => d.id === dragId)
  const buckets = new Map<string, Deal[]>()
  for (const row of rows) {
    const bucket = buckets.get(row.stage)
    if (bucket) bucket.push(row)
    else buckets.set(row.stage, [row])
  }

  const otherDestinations = drag
    ? allowedStages(drag.stage).filter((key) => !keys.some(([k]) => k === key))
    : []
  function choose(key: string) {
    setStage('')
    setSelected(key)
    setJump(key)
  }
  useLayoutEffect(() => {
    const board = track.current
    if (!board || board.scrollWidth <= board.clientWidth) return
    const lane = Array.from(board.children).find(
      (el) => (el as HTMLElement).dataset.stage === jump,
    ) as HTMLElement | undefined
    if (lane)
      board.scrollLeft = lane.offsetLeft - (board.firstElementChild as HTMLElement).offsetLeft
  }, [jump, stage])
  return (
    <div className="ob-board">
      <div className="ob-board-tools">
        <nav className="ob-phases" aria-label="Fases del pipeline">
          {phases.map((p, i) => (
            <button key={p.label} aria-pressed={phase === i} onClick={() => choose(p.keys[0][0])}>
              {p.label}
              <b>{p.keys.reduce((n, [key]) => n + (buckets.get(key)?.length || 0), 0)}</b>
            </button>
          ))}
        </nav>
        <label className="ob-mobile-phase">
          <span className="sr-only">Ir a etapa</span>
          <select value={stage || selected} onChange={(e) => choose(e.target.value)}>
            {phases.map((p) => (
              <optgroup label={p.label} key={p.label}>
                {p.keys.map(([k, l]) => (
                  <option value={k} key={k}>
                    {l} ({buckets.get(k)?.length || 0})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {quick}
      </div>
      {stage && (
        <button className="ob-release-stage" onClick={() => choose(stage)}>
          Ver todas las etapas de {phases[phase].label}
        </button>
      )}
      <div
        className="ob-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.scrollWidth <= el.clientWidth) return
          const lanes = Array.from(el.children) as HTMLElement[]
          const nearest = lanes.reduce((a, b) =>
            Math.abs(b.offsetLeft - lanes[0].offsetLeft - el.scrollLeft) <
            Math.abs(a.offsetLeft - lanes[0].offsetLeft - el.scrollLeft)
              ? b
              : a,
          )
          if (nearest.dataset.stage) setSelected(nearest.dataset.stage)
        }}
        style={{
          gridTemplateColumns: keys
            .map(([k]) => (buckets.get(k)?.length ? 'minmax(0,1.95fr)' : 'minmax(0,1fr)'))
            .join(' '),
        }}
      >
        {keys.map(([k]) => (
          <Lane
            key={k}
            stage={k}
            rows={buckets.get(k) || []}
            owner={owner}
            canWrite={canWrite}
            open={open}
            drag={drag}
            setDrag={setDrag}
          />
        ))}
      </div>
      {!!otherDestinations.length && drag && (
        <div className="ob-cross-drop" aria-label="Destinos de otras fases">
          {otherDestinations.map((k) => (
            <button
              key={k}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                open(drag.id, k)
                setDrag('')
              }}
            >
              {stageName(k)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
function Directory({
  rows,
  stage,
  setStage,
  owner,
  open,
  quick,
}: { rows: Deal[]; quick: React.ReactNode } & Pick<
  Props,
  'stage' | 'setStage' | 'owner' | 'open'
>) {
  const grid = useRef<HTMLDivElement>(null),
    capacity = useCapacity(grid),
    [page, setPage] = useState(0)
  const index = Math.max(0, Math.min(page, Math.ceil(rows.length / capacity) - 1))
  return (
    <section className="ob-workarea ob-directory">
      <div className="ob-ledger">
        <div className="ob-ledger-head">
          <h2>Directorio de contactos</h2>
          <label className="ob-stage-select ob-stage-directory">
            <span>Etapa</span>
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Todas las etapas</option>
              {stages.map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {quick}
        </div>
        <div className="ob-contact-head">
          <span>Negocio / persona</span>
          <span>Etapa</span>
          <span>Próxima acción</span>
          <span>Responsable</span>
        </div>
        <div ref={grid} className="ob-contact-list">
          {rows.slice(index * capacity, (index + 1) * capacity).map((d) => (
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
          ))}
          {!rows.length && <div className="ob-empty">Sin negocios con estos filtros</div>}
        </div>
        <Pager
          page={index}
          capacity={capacity}
          total={rows.length}
          setPage={setPage}
          label="Contactos"
        />
      </div>
    </section>
  )
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
  const today = dayMX(new Date()),
    scope = stage ? records.filter((d) => d.stage === stage) : records
  const dueRows = records.filter(
    (d) => !due || (!!d.due && (due === 'hoy' ? d.due === today : d.due < today)),
  )
  const choices = [
    ['', 'Todos', scope.length],
    ['hoy', 'Para hoy', scope.filter((d) => d.due === today).length],
    ['vencido', 'Vencidos', scope.filter((d) => d.due && d.due < today).length],
  ] as const
  const quick = (
    <div className="ob-quick" aria-label="Seguimiento">
      {choices.map(([k, label, n]) => (
        <button key={k} aria-pressed={due === k} onClick={() => setDue(k)}>
          {label} <b>{n}</b>
        </button>
      ))}
    </div>
  )
  return view === 'Tablero' ? (
    <Board rows={dueRows} {...{ stage, setStage, owner, canWrite, open, quick }} />
  ) : (
    <Directory
      key={JSON.stringify([due, stage])}
      rows={dueRows.filter((d) => !stage || d.stage === stage)}
      {...{ stage, setStage, owner, open, quick }}
    />
  )
}
