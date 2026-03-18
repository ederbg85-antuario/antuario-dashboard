/**
 * chart-theme.tsx
 * Shared design system for all Recharts graphs across the platform.
 * Bold & colorful style with strong gradients and vivid strokes.
 */

// ── Palette ─────────────────────────────────────────────────────────────────
export const C = {
  blue:    '#3b82f6',
  indigo:  '#6366f1',
  violet:  '#8b5cf6',
  purple:  '#a855f7',
  rose:    '#f43f5e',
  amber:   '#f59e0b',
  orange:  '#f97316',
  emerald: '#10b981',
  teal:    '#14b8a6',
  cyan:    '#06b6d4',
  slate:   '#94a3b8',
  white:   '#ffffff',
} as const

/** Ordered palette for multi-series charts */
export const PALETTE = [
  C.blue, C.emerald, C.amber, C.violet, C.rose, C.teal, C.orange, C.indigo, C.cyan,
]

// ── Grid / Axis ──────────────────────────────────────────────────────────────
export const GRID_LIGHT = { strokeDasharray: '3 3', stroke: 'rgba(148,163,184,0.15)', vertical: false }
export const GRID_DARK  = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.06)', vertical: false }

export const AXIS_TICK  = { fontSize: 11, fill: '#94a3b8', fontWeight: 500 }
export const AXIS_PROPS = { tickLine: false, axisLine: false, tick: AXIS_TICK }

// ── Custom Tooltip ───────────────────────────────────────────────────────────
type TooltipPayloadItem = {
  name?: string
  value?: number | string
  color?: string
  unit?: string
}

type CustomTooltipProps = {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  formatter?: (v: number | string, name: string) => string
}

export function ChartTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-xs shadow-2xl border"
      style={{
        background: 'rgba(15,20,35,0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#e2e8f0',
        minWidth: 120,
      }}
    >
      {label && <p className="font-semibold text-slate-300 mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-bold text-white ml-auto pl-2">
            {formatter && typeof p.value !== 'undefined'
              ? formatter(p.value, p.name ?? '')
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Gradient Defs helper ─────────────────────────────────────────────────────
type GradientDef = {
  id: string
  color: string
  /** top opacity (default 0.45) */
  opacityTop?: number
  /** bottom opacity (default 0.02) */
  opacityBot?: number
}

export function Gradients({ defs }: { defs: GradientDef[] }) {
  return (
    <defs>
      {defs.map(({ id, color, opacityTop = 0.45, opacityBot = 0.02 }) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={opacityTop} />
          <stop offset="100%" stopColor={color} stopOpacity={opacityBot} />
        </linearGradient>
      ))}
    </defs>
  )
}

// ── Donut Legend ─────────────────────────────────────────────────────────────
type LegendItem = { name: string; value: number; color: string }

export function DonutLegend({
  items,
  total,
  formatter,
}: {
  items: LegendItem[]
  total: number
  formatter?: (v: number) => string
}) {
  const fmt = formatter ?? ((v: number) => v.toLocaleString())
  return (
    <ul className="flex flex-col gap-1.5 text-xs min-w-0">
      {items.map((it) => {
        const pct = total > 0 ? Math.round((it.value / total) * 100) : 0
        return (
          <li key={it.name} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: it.color }}
            />
            <span className="text-slate-500 dark:text-slate-400 truncate flex-1">{it.name}</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {fmt(it.value)}
            </span>
            <span className="text-slate-400 dark:text-slate-500 w-8 text-right tabular-nums">
              {pct}%
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ── Recharts tooltip style object (for simple cases) ────────────────────────
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(15,20,35,0.92)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    fontSize: 12,
    color: '#e2e8f0',
    backdropFilter: 'blur(16px)',
    padding: '8px 12px',
  },
  itemStyle: { color: '#e2e8f0', fontWeight: 600 },
  labelStyle: { color: '#94a3b8', fontWeight: 500, marginBottom: 4 },
  cursor: { stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1.5 },
}
