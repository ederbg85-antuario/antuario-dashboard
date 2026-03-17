/**
 * components/ui/dashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Sistema de diseño compartido para todos los dashboards de Antuario.
 * Importa lo que necesites en cada Client Component:
 *
 *   import { CARD_S, PAGE_WRAP, PageHeader, SectionHeader, KpiBox, ChartCard } from '@/components/ui/dashboard'
 *
 * REGLA: Este archivo solo contiene estilos y presentación.
 *        Nunca agregar lógica de negocio, fetching ni estado aquí.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'

// ─── Design tokens ────────────────────────────────────────────────────────────

/** Sombra 3D premium — aplica via CSS variable que cambia en dark mode */
export const CARD_S: React.CSSProperties = {
    boxShadow: 'var(--card-shadow)',
}

/** Wrapper raíz de las vistas de análisis (scroll, padding consistente con topbar) */
export const PAGE_WRAP = 'px-4 py-4 space-y-4'

// ─── PageHeader ───────────────────────────────────────────────────────────────

/**
 * Encabezado de página con eyebrow, título principal y subtítulo.
 *
 * @example
 * <PageHeader eyebrow="Ventas" title="Visión de Ventas" sub="Resumen estratégico" />
 */
export function PageHeader({
    eyebrow,
    title,
    sub,
}: {
    eyebrow?: string
    title: string
    sub?: string
}) {
    return (
        <div className="pb-2 border-b border-slate-100 dark:border-white/[0.06]">
            {eyebrow && (
                <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500 mb-1">
                    {eyebrow}
                </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                {title}
            </h1>
            {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
        </div>
    )
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

/**
 * Encabezado de sección con punto verde pulsante y sombra 3D.
 * El contenedor es compacto (w-fit), no ocupa todo el ancho.
 *
 * @example
 * <SectionHeader title="Indicadores clave" href="/ventas" />
 */
export function SectionHeader({
    title,
    href,
}: {
    title: string
    href?: string
}) {
    return (
        <div className="flex items-center gap-3">
            <div
                className="flex items-center gap-2.5 px-4 py-2 rounded-2xl w-fit bg-white dark:bg-[#161b27]"
                style={CARD_S}
            >
                <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
            </div>
            {href && (
                <a
                    href={href}
                    className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors font-medium"
                >
                    Ver detalle →
                </a>
            )}
        </div>
    )
}

// ─── KpiBox ───────────────────────────────────────────────────────────────────

/**
 * Tarjeta de KPI individual con sombra 3D y variantes de color.
 *
 * @example
 * <KpiBox label="CAC" value="$1,200" sub="Costo adquisición" alert />
 * <KpiBox label="ROAS" value="4.2x" sub="Retorno sobre Ads" good />
 */
export function KpiBox({
    label,
    value,
    sub,
    alert,
    good,
    badge,
    badgeColor,
}: {
    label: string
    value: string | number
    sub?: string
    alert?: boolean
    good?: boolean
    badge?: string
    badgeColor?: string
}) {
    const bg = alert ? 'bg-red-50 dark:bg-red-900/20' : good ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-white dark:bg-[#161b27]'
    const valCl = alert ? 'text-red-700 dark:text-red-400' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'

    return (
        <div className={`rounded-3xl p-4 transition-shadow ${bg}`} style={CARD_S}>
            <div className="flex items-start justify-between mb-2.5">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {label}
                </p>
                {badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${badgeColor ?? 'bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400'}`}>
                        {badge}
                    </span>
                )}
            </div>
            <p className={`text-xl font-bold tabular-nums leading-none ${valCl}`}>
                {value}
            </p>
            {sub && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-snug">{sub}</p>
            )}
        </div>
    )
}

// ─── ChartCard ────────────────────────────────────────────────────────────────

/**
 * Contenedor de gráfica con encabezado, badge opcional y cuerpo.
 *
 * @example
 * <ChartCard title="Revenue por mes" sub="últimos 6 meses" badge="INGRESOS" badgeColor="bg-emerald-50 text-emerald-700">
 *   <ResponsiveContainer>...</ResponsiveContainer>
 * </ChartCard>
 */
export function ChartCard({
    title,
    sub,
    badge,
    badgeColor,
    children,
}: {
    title: string
    sub?: string
    badge?: string
    badgeColor?: string
    children: React.ReactNode
}) {
    return (
        <div className="bg-white dark:bg-[#161b27] rounded-3xl p-5 md:p-6" style={CARD_S}>
            <div className="flex items-start justify-between mb-1">
                <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
                {badge && (
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${badgeColor ?? 'bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400'}`}>
                        {badge}
                    </span>
                )}
            </div>
            {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">{sub}</p>}
            {children}
        </div>
    )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

/**
 * Estado vacío estándar para cuando no hay datos en una sección.
 *
 * @example
 * <EmptyState message="Sin datos de Google Maps" action={{ label: 'Conectar GMB →', href: '/configuracion/integraciones' }} />
 */
export function EmptyState({
    message,
    action,
}: {
    message: string
    action?: { label: string; href: string }
}) {
    return (
        <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <div className="w-8 h-8 rounded-2xl bg-slate-50 dark:bg-white/[0.05] border border-slate-100 dark:border-white/[0.06] flex items-center justify-center mb-3" style={CARD_S}>
                <span className="text-slate-300 dark:text-slate-600 text-base">◇</span>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500">{message}</p>
            {action && (
                <a
                    href={action.href}
                    className="text-xs text-blue-500 hover:underline mt-1.5 block"
                >
                    {action.label}
                </a>
            )}
        </div>
    )
}

// ─── PulsingDot ───────────────────────────────────────────────────────────────

/**
 * Punto de estado pulsante. Verde por defecto.
 *
 * @example
 * <PulsingDot color="emerald" />  // verde (default)
 * <PulsingDot color="amber" />    // amarillo (alerta)
 * <PulsingDot color="red" />      // rojo (error)
 */
export function PulsingDot({
    color = 'emerald',
}: {
    color?: 'emerald' | 'amber' | 'red' | 'blue'
}) {
    const ring = { emerald: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-red-400', blue: 'bg-blue-400' }[color]
    const solid = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', blue: 'bg-blue-500' }[color]

    return (
        <span className="relative flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${ring} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${solid}`} />
        </span>
    )
}

// ─── FunnelCard ───────────────────────────────────────────────────────────────

/**
 * Contenedor premium para embudos con header oscuro flotante.
 * Usado en VisionVentas y otras vistas con embudos de conversión.
 *
 * @example
 * <FunnelCard headerLeft={<>...</>} headerRight={<>...</>}>
 *   {stages.map(s => <FunnelRow key={s.n} {...s} />)}
 * </FunnelCard>
 */
export function FunnelCard({
    headerLeft,
    headerRight,
    children,
}: {
    headerLeft: React.ReactNode
    headerRight?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="rounded-3xl bg-white p-4" style={CARD_S}>
            {/* Header oscuro con todas las esquinas redondeadas */}
            <div
                className="rounded-2xl px-5 py-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
            >
                <div>{headerLeft}</div>
                {headerRight && <div className="sm:text-right shrink-0">{headerRight}</div>}
            </div>
            {/* Cuerpo de etapas */}
            <div className="space-y-0.5">{children}</div>
        </div>
    )
}

/**
 * Fila individual dentro de un FunnelCard.
 */
export function FunnelRow({
    n,
    label,
    sub,
    value,
    color,
    rate,
    rateLabel,
    needsCRM,
    maxVal,
    formatN,
    formatPct,
}: {
    n: number
    label: string
    sub: string
    value: number
    color: string
    rate: number | null
    rateLabel: string | null
    needsCRM?: boolean
    maxVal: number
    formatN: (v: number) => string
    formatPct: (v: number) => string
}) {
    const barW = Math.max(1, (value / (maxVal || 1)) * 100)

    return (
        <div>
            {/* Conector de tasa */}
            {rate !== null && (
                <div className="flex items-center gap-2 pl-[52px] py-1">
                    <div
                        className="w-px h-3 rounded-full opacity-25"
                        style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-slate-400">
                        <span className="font-bold" style={{ color }}>
                            {formatPct(rate)}
                        </span>
                        {' — '}{rateLabel}
                    </span>
                </div>
            )}

            {/* Fila de etapa */}
            <div
                className="flex items-center gap-3 md:gap-4 px-3 py-3 rounded-2xl"
                style={{ background: `${color}0d` }}
            >
                {/* Chip número con sombra coloreada */}
                <div
                    className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                    style={{ backgroundColor: color, boxShadow: `0 3px 10px ${color}60` }}
                >
                    {n}
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[13px] font-semibold text-slate-800 leading-none">
                                {label}
                            </span>
                            {needsCRM && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 uppercase tracking-wider shrink-0">
                                    CRM
                                </span>
                            )}
                            <span className="hidden sm:block text-[11px] text-slate-400 truncate">
                                {sub}
                            </span>
                        </div>
                        <span
                            className="text-lg font-extrabold tabular-nums ml-3 shrink-0"
                            style={{ color }}
                        >
                            {formatN(value)}
                        </span>
                    </div>

                    {/* Barra proporcional */}
                    <div
                        className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: `${color}18` }}
                    >
                        <div
                            className="h-1.5 rounded-full transition-all duration-700"
                            style={{ width: `${barW}%`, backgroundColor: color, opacity: 0.85 }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
