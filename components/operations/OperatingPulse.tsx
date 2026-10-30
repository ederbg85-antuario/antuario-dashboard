'use client'

import {useState, type ReactNode} from 'react'
import WosScene from '@/components/workspace/WosScene'

type Props = {
  pending: number
  review: number
  overdue: number
  unassigned: number
  accounts: number
  onFocus: (focus: string) => void
  onReview: () => void
  children: ReactNode
}

/** A snapshot of the existing task records, never an invented recommendation. */
export default function OperatingPulse({pending, review, overdue, unassigned, accounts, onFocus, onReview, children}: Props) {
  const [motion, setMotion] = useState(true)

  return <div className="operating-pulse-grid">
    <article className="operating-pulse" data-operating-enter aria-label="Resumen operativo con Woss">
      <div className="operating-pulse-copy">
        <div className="operating-pulse-total"><strong>{pending}</strong><span>tareas pendientes<br/><small>en {accounts} {accounts===1?'cuenta':'cuentas'}</small></span></div>
        <div className="operating-pulse-actions" aria-label="Atención pendiente">
          <button onClick={onReview}><b>{review}</b><span>en revisión</span><span aria-hidden="true">↗</span></button>
          <button onClick={()=>onFocus('overdue')}><b>{overdue}</b><span>vencidas</span><span aria-hidden="true">↗</span></button>
          <button onClick={()=>onFocus('unassigned')}><b>{unassigned}</b><span>sin responsable</span><span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <figure className="operating-woss-stage" aria-label="Woss, mascota de Antuario">
        <WosScene className="operating-woss" variant="peace" motion={motion} expressive/>
        <button className="operating-motion-toggle" onClick={()=>setMotion(!motion)} aria-label={motion?'Pausar animación de Woss':'Activar animación de Woss'} aria-pressed={!motion}>
          {motion?<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="2.5" height="10" rx="1"/><rect x="9.5" y="3" width="2.5" height="10" rx="1"/></svg>:<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="m5 3 8 5-8 5z"/></svg>}
          <span>Woss</span>
        </button>
      </figure>
    </article>
    {children}
  </div>
}
