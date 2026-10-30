'use client'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {FinancialChart,FinancialText,useFinancialPrivacy} from '@/components/privacy/FinancialPrivacy'
import { formatAccountMoney } from '@/lib/client-account-money'

export const accountColors = {
  lilac: 'var(--account-lilac)',
  mint: 'var(--account-mint)',
  peach: 'var(--account-peach)',
  blue: 'var(--account-blue)',
  danger: 'var(--account-danger)'
}
export const axis = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 10, fill: 'var(--text-2)' }
}
export const money = formatAccountMoney
export const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(
        value
      )
export const shortDate = (value: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value))
export const fullDate = (value: string) =>
  new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: value.length > 10 ? 'short' : undefined,
    timeZone: 'America/Mexico_City'
  }).format(new Date(value.length === 10 ? `${value}T18:00:00Z` : value))
const statusLabels: Record<string, string> = {
  healthy: 'Al día',
  attention: 'Revisar',
  blocked: 'Bloqueado',
  unknown: 'Por verificar',
  active: 'Activa',
  archived: 'Archivada',
  pending: 'Por hacer',
  in_progress: 'En curso',
  review: 'En revisión',
  delivered: 'Entregado',
  paused: 'Pausada',
  ended: 'Finalizada',
  draft: 'Borrador',
  issued: 'Emitida',
  cancelled: 'Cancelada',
  discovery: 'Evaluación',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  won: 'Aceptada',
  lost: 'Descartada'
}
export function Status({ value, label }: { value: string; label?: string }) {
  return (
    <span className="account-health" data-state={value}>
      <i aria-hidden="true" />
      {label ?? statusLabels[value] ?? value}
    </span>
  )
}
export function Empty({
  title = 'Sin datos registrados',
  description = 'Registra una fuente y un periodo para ver esta gráfica.',
  action
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="account-empty">
      <span aria-hidden="true">◈</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Surface({
  title,
  description,
  action,
  children,
  source,
  className = '',
  financial = false
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  source?: string
  className?: string
  financial?: boolean
}) {
  return (
    <section className={`account-surface ${className}`} data-account-enter>
      <header className="account-card-heading">
        <div>
          <h2>{title}</h2>
          {description && <p><FinancialText>{description}</FinancialText></p>}
        </div>
        {action}
      </header>
      {financial?<FinancialChart>{children}</FinancialChart>:children}
      {source && <p className="account-source"><FinancialText>{source}</FinancialText></p>}
    </section>
  )
}
export function ChartTip({
  active,
  payload,
  label
}: {
  active?: boolean
  payload?: readonly {
    name?: string
    value?: number | string
    color?: string
  }[]
  label?: ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="account-chart-tooltip">
      {label != null && <strong>{label}</strong>}
      {payload.map((item, i) => (
        <p key={`${item.name}-${i}`}>
          <span style={{ color: item.color }}>{item.name}</span>
          <b>
            {typeof item.value === 'number'
              ? number(item.value, 2)
              : (item.value ?? '—')}
          </b>
        </p>
      ))}
    </div>
  )
}
export function Kpi({
  label,
  value,
  change,
  series = [],
  color = accountColors.lilac,
  improvesWhen = 'up',
  hint,
  financial = false
}: {
  label: string
  value: string
  change?: number | null
  series?: { date: string; value: number | null }[]
  color?: string
  improvesWhen?: 'up' | 'down' | 'neutral'
  hint?: string
  financial?: boolean
}) {
  const {visible,text}=useFinancialPrivacy()
  const masked=financial&&!visible
  const points = series.filter((p) => p.value != null),
    hasSeries = points.length > 1,
    improved =
      change == null || change === 0 || improvesWhen === 'neutral'
        ? undefined
        : improvesWhen === 'down'
          ? change < 0
          : change > 0
  return (
    <article
      className={`account-surface account-kpi ${hasSeries ? 'has-sparkline' : ''}`}
      data-account-enter
    >
      <span className="account-kpi-label">
        {label}
        {hint && (
          <span title={text(hint)} aria-label={text(hint)}>
            ⓘ
          </span>
        )}
      </span>
      <strong>{masked?'••••':value}</strong>
      <span className="account-kpi-delta" data-improved={improved}>
        {!masked && change != null ? (
          <>
            {change > 0 ? '↗' : change < 0 ? '↘' : '→'}{' '}
            {number(Math.abs(change), 1)}% <span>vs. anterior</span>
          </>
        ) : (
          <span className="account-kpi-empty">Sin comparación</span>
        )}
      </span>
      {hasSeries && !masked && (
        <div className="account-sparkline" aria-hidden="true">
          <Sparkline series={series} color={color} />
        </div>
      )}
    </article>
  )
}
export function LoadingAccounts() {
  return (
    <div
      className="accounts-workspace"
      role="status"
      aria-label="Cargando cuentas"
      aria-busy="true"
    >
      <div className="account-skeleton account-skeleton-head" />
      <div className="account-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="account-skeleton account-skeleton-kpi" />
        ))}
      </div>
      <div className="account-grid">
        {[0, 1].map((i) => (
          <div key={i} className="account-skeleton account-skeleton-chart" />
        ))}
      </div>
      <span className="sr-only">Cargando la cuenta…</span>
    </div>
  )
}
export function AccountDialog({
  title,
  children,
  close,
  className = '',
  locked = false
}: {
  title: string
  children: ReactNode
  close: () => void
  className?: string
  locked?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`account-dialog ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!locked) close()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="account-dialog-close"
          aria-label="Cerrar"
          disabled={locked}
          onClick={() => {
            if (!locked) close()
          }}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}

function Sparkline({
  series,
  color
}: {
  series: { date: string; value: number | null }[]
  color: string
}) {
  const values = series.flatMap((point) =>
      point.value === null ? [] : [point.value]
    ),
    min = Math.min(...values),
    max = Math.max(...values)
  const path = series
    .map((point, index) => {
      if (point.value === null) {
        return ''
      }
      const x = (index / Math.max(1, series.length - 1)) * 100,
        y = max === min ? 20 : 36 - ((point.value - min) / (max - min)) * 32,
        command = `${index === 0 || series[index - 1]?.value === null ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      return command
    })
    .join(' ')
  return (
    <svg
      viewBox="0 0 100 40"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
