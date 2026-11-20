'use client'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  allowedStages,
  channelName,
  localDate,
  stageName,
  type Command,
  type Deal,
  type Workspace,
} from '@/lib/outbound'
export function Sheet({
  title,
  children,
  close,
}: {
  title: string
  children: ReactNode
  close: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="ob-sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className="ob-sheet-head">
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label="Cerrar ficha">
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function fields(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
}
export function Field({
  name,
  label,
  value,
  required,
  type = 'text',
}: {
  name: string
  label: string
  value?: string | null
  required?: boolean
  type?: string
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value || ''}
        type={type}
        required={required}
        maxLength={1000}
      />
    </label>
  )
}
type Props = {
  d: Deal
  w: Workspace
  target: string
  busy: boolean
  error: string
  save: (cmd: Command) => Promise<boolean>
  close: () => void
}
export default function Ficha({ d, w, target, busy, error, save, close }: Props) {
  const [section, setSection] = useState(target ? 'Movimiento' : 'Resumen'),
    [next, setNext] = useState(target || allowedStages(d.stage)[0] || ''),
    [skip, setSkip] = useState(false)
  const owner =
    w.members.find((m) => m.id === d.owner)?.label ?? (d.owner ? 'Responsable' : 'Sin asignar')
  const cmd = (data: Command) => save({ ...data, id: d.id, revision: d.revision })
  const submit = async (e: FormEvent<HTMLFormElement>, op: string) => {
    const f = fields(e)
    if (await cmd({ ...f, op })) setSection('Resumen')
  }
  const openMove = (s: string) => {
    setNext(s)
    setSection('Movimiento')
    setSkip(false)
  }
  const fullHistory = (event: Deal['history'][number]) =>
    event.outcome?.startsWith('omitido_')
      ? 'Paso omitido · ' + stageName(event.outcome.slice(8))
      : event.outcome === 'cancel'
        ? 'Reunión cancelada'
        : event.outcome === 'no_show'
          ? 'Inasistencia'
          : event.type === 'toque'
            ? 'Abordaje manual'
            : event.type === 'respuesta'
              ? 'Respuesta recibida'
              : event.type === 'etapa' && event.outcome
                ? stageName(event.outcome)
                : 'Registro'
  return (
    <Sheet title={d.company} close={close}>
      <div className="ob-summary">
        <span className="ob-tag">{stageName(d.stage)}</span>
        <strong>{owner}</strong>
        <span>
          {d.source} · {d.zone || 'Zona por registrar'}
        </span>
      </div>
      <nav className="ob-tabs" aria-label="Secciones de la ficha">
        {(w.canWrite
          ? ['Resumen', 'Ficha', 'Personas', 'Movimiento', 'Historial']
          : ['Resumen', 'Personas', 'Historial']
        ).map((s) => (
          <button
            key={s}
            aria-pressed={section === s}
            onClick={() =>
              s === 'Movimiento' ? openMove(allowedStages(d.stage)[0] || '') : setSection(s)
            }
          >
            {s}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="ob-error">
          {error}
        </p>
      )}
      <div className="ob-sheet-body">
        {section === 'Resumen' && (
          <>
            <div className="ob-next">
              <small>Próxima acción</small>
              <h3>{d.nextAction || 'Sin acción programada'}</h3>
              {d.due && localDate(d.due)}
            </div>
            <dl>
              {[
                ['Encaje', d.fit],
                ['Decisor o vía de acceso', d.decision],
                ['Señal de interés', d.interest],
                [
                  'Persona principal',
                  [d.name, d.position, d.email, d.phone].filter(Boolean).join(' · '),
                ],
                [
                  'Reunión',
                  d.meeting &&
                    new Date(d.meeting).toLocaleString('es-MX', {
                      timeZone: 'America/Mexico_City',
                    }),
                ],
                ['Asistentes', d.attendees],
                ['Objetivo', d.objective],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || 'Por registrar'}</dd>
                </div>
              ))}
            </dl>
            {w.canWrite && allowedStages(d.stage).length > 0 && (
              <button className="op-button" onClick={() => openMove(allowedStages(d.stage)[0])}>
                Registrar movimiento
              </button>
            )}
          </>
        )}
        {section === 'Ficha' && (
          <>
            <form
              key={d.revision}
              onSubmit={async (e) => {
                const f = fields(e)
                if (await cmd({ ...f, op: 'details', wa: f.wa === 'on', call: f.call === 'on' }))
                  setSection('Resumen')
              }}
            >
              <div className="ob-grid">
                <Field name="source" label="Origen" value={d.source} required />
                <Field name="zone" label="Zona" value={d.zone} />
              </div>
              <Field name="fit" label="Evidencia de encaje" value={d.fit} />
              <Field name="decision" label="Decisor o vía de acceso" value={d.decision} />
              <Field name="interest" label="Señal explícita de interés" value={d.interest} />
              <div className="ob-grid">
                <Field name="nextAction" label="Próxima acción" value={d.nextAction} />
                <Field type="date" name="due" label="Fecha de seguimiento" value={d.due} />
              </div>
              <label className="ob-check">
                <input type="checkbox" name="wa" defaultChecked={d.wa} />
                WhatsApp permitido
              </label>
              <label className="ob-check">
                <input type="checkbox" name="call" defaultChecked={d.call} />
                Llamada permitida
              </label>
              <details>
                <summary>Experimento</summary>
                <Field name="experiment" label="Nombre del experimento" value={d.experiment} />
                <label>
                  Grupo
                  <select name="arm" defaultValue={d.arm || ''}>
                    <option value="">Sin grupo</option>
                    <option value="base">Base</option>
                    <option value="prueba">Prueba</option>
                  </select>
                </label>
              </details>
              <button disabled={busy} className="op-button">
                Guardar ficha
              </button>
            </form>
            {w.admin && (
              <form onSubmit={(e) => submit(e, 'assign')}>
                <h3>Asignación</h3>
                <label>
                  Responsable del negocio
                  <select name="owner" defaultValue={d.owner || ''}>
                    <option value="">Sin asignar</option>
                    {w.members
                      .filter((m) => m.writable)
                      .map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.label}
                        </option>
                      ))}
                  </select>
                </label>
                <button disabled={busy}>Actualizar responsable</button>
              </form>
            )}
          </>
        )}
        {section === 'Personas' && (
          <>
            {d.name && !d.primaryContact && (
              <article className="ob-person">
                <strong>{d.name}</strong>
                <p>{[d.position, d.email, d.phone].filter(Boolean).join(' · ')}</p>
                {w.canWrite && (
                  <button disabled={busy} onClick={() => cmd({ op: 'convert' })}>
                    Vincular al directorio CRM
                  </button>
                )}
              </article>
            )}
            {d.people.map((p) => (
              <article className="ob-person" key={p.id}>
                <strong>{p.name}</strong>
                <p>{[p.position, p.email, p.phone].filter(Boolean).join(' · ')}</p>
              </article>
            ))}
            {!d.people.length && !d.name && <p>Sin personas registradas.</p>}
            {w.canWrite && (
              <form onSubmit={(e) => submit(e, 'person')}>
                <h3>Vincular persona</h3>
                <Field name="name" label="Nombre de la persona" required />
                <Field name="position" label="Cargo" />
                <div className="ob-grid">
                  <Field name="email" type="email" label="Correo" />
                  <Field name="phone" label="Teléfono" />
                </div>
                <button disabled={busy} className="op-button">
                  Guardar persona
                </button>
              </form>
            )}
          </>
        )}
        {section === 'Movimiento' && (
          <>
            <form
              onSubmit={async (e) => {
                const f = fields(e)
                const ok = await cmd({
                  ...f,
                  op: skip ? 'skip' : 'move',
                  stage: next,
                  thread: f.thread === 'on',
                  meeting: f.meeting ? f.meeting + ':00-06:00' : null,
                })
                if (ok) setSection('Resumen')
              }}
            >
              <label>
                Etapa de destino
                <select
                  value={next}
                  required
                  onChange={(e) => {
                    setNext(e.target.value)
                    setSkip(false)
                  }}
                >
                  <option value="">Elegir etapa</option>
                  {allowedStages(d.stage).map((s) => (
                    <option key={s} value={s}>
                      {stageName(s)}
                    </option>
                  ))}
                </select>
              </label>
              {next === 'respondio' && (
                <label>
                  Canal de respuesta
                  <select name="channel">
                    {['email', 'whatsapp', 'llamada', 'linkedin', 'visita'].map((s) => (
                      <option value={s} key={s}>
                        {channelName(s)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {next === 'seguimiento' && (
                <label className="ob-check">
                  <input type="checkbox" name="thread" required />
                  Registré el seguimiento manual en el mismo hilo
                </label>
              )}
              {['whatsapp', 'llamada'].includes(next) && (
                <label className="ob-check">
                  <input
                    type="checkbox"
                    checked={skip}
                    onChange={(e) => setSkip(e.target.checked)}
                  />
                  Omitir este canal y registrar el motivo
                </label>
              )}
              {next === 'agendada' && (
                <>
                  <p>
                    Al guardar, la reunión y la ficha pasan a{' '}
                    {w.members.find((m) => m.id === w.handoff)?.label || 'dirección'}.
                  </p>
                  <Field
                    name="meeting"
                    label="Fecha y hora de la reunión · CDMX"
                    type="datetime-local"
                    required
                  />
                  <Field name="attendees" label="Asistentes confirmados" required />
                  <Field name="objective" label="Objetivo de la reunión" required />
                </>
              )}
              <label>
                Registro del movimiento
                <textarea
                  name="note"
                  rows={3}
                  maxLength={2400}
                  required={[
                    'correo',
                    'seguimiento',
                    'whatsapp',
                    'llamada',
                    'respondio',
                    'realizada',
                    'propuesta',
                    'excluido',
                  ].includes(next)}
                />
              </label>
              <button className="op-button" disabled={busy || !next}>
                Guardar movimiento
              </button>
            </form>
            {['correo', 'seguimiento', 'whatsapp', 'llamada'].includes(d.stage) && (
              <form
                onSubmit={async (e) => {
                  const f = fields(e)
                  if (
                    await cmd({
                      ...f,
                      op: 'attempt',
                      channel: ['correo', 'seguimiento'].includes(d.stage) ? 'email' : d.stage,
                    })
                  )
                    setSection('Historial')
                }}
              >
                <Field name="note" label="Otro intento manual en la misma etapa" required />
                <button disabled={busy}>Registrar intento</button>
              </form>
            )}
            {d.stage === 'agendada' && (
              <form
                onSubmit={async (e) => {
                  const f = fields(e)
                  if (await cmd(f)) setSection('Historial')
                }}
              >
                <label>
                  Incidencia
                  <select name="op">
                    <option value="cancel">Cancelación</option>
                    <option value="no_show">Inasistencia</option>
                  </select>
                </label>
                <Field name="note" label="Motivo" required />
                <button disabled={busy}>Registrar incidencia</button>
              </form>
            )}
          </>
        )}
        {section === 'Historial' && (
          <>
            {w.canWrite && (
              <form
                onSubmit={async (e) => {
                  const f = fields(e)
                  const form = e.currentTarget
                  if (await cmd({ ...f, op: 'note' })) form.reset()
                }}
              >
                <Field name="note" label="Nueva nota" required />
                <button disabled={busy}>Guardar nota</button>
              </form>
            )}
            {!d.history.length && <p>Aún no hay interacciones registradas.</p>}
            {d.history.map((a) => (
              <article className="ob-event" key={a.id}>
                <strong>{fullHistory(a)}</strong>
                <p>{a.body || stageName(a.outcome || a.type)}</p>
                <small>
                  {a.author} ·{' '}
                  {new Date(a.at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                  {a.channel ? ' · ' + channelName(a.channel) : ''}
                </small>
              </article>
            ))}
          </>
        )}
      </div>
    </Sheet>
  )
}
