'use client'

import { useMemo, type ReactNode } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { CARD_S } from '@/components/ui/dashboard'

// ═══════════════════════════════════════════════════════════════════════════
// Métricas de venta en frío — paleta validada (dataviz) por modo:
//   claro  → sky #0ea5e9 · amber #f59e0b · violet #8b5cf6 · green #22c55e · blue #3b82f6 · teal #14b8a6
//   oscuro → #0284c7 · #d97706 · #8b5cf6 · #16a34a · #3b82f6 · #0d9488
// Los colores viven en CSS vars (wrapper) y TODAS las gráficas llevan
// etiquetas directas (los fills nunca son el único canal de lectura).
// ═══════════════════════════════════════════════════════════════════════════

type Prospect = {
  id: string
  icp_segment: string | null
  stage: string
  deal_path: string | null
  assigned_to: string | null
  touches: number | null
}
type Activity = {
  id: string
  prospect_id: string
  type: string
  channel: string | null
  direction: string | null
  created_at: string
}
type Profile = { id: string; full_name: string | null; email: string | null }

const SEG: Record<string, { label: string; var: string }> = {
  despacho_legal:         { label: 'Legal',        var: 'var(--mx-violet)' },
  promotora_inmobiliaria: { label: 'Inmobiliaria', var: 'var(--mx-sky)' },
  agencia_marketing:      { label: 'Agencia',      var: 'var(--mx-amber)' },
}
const CHAN: Record<string, { label: string; var: string }> = {
  email:    { label: 'Correo',   var: 'var(--mx-sky)' },
  whatsapp: { label: 'WhatsApp', var: 'var(--mx-green)' },
  llamada:  { label: 'Llamada',  var: 'var(--mx-amber)' },
  visita:   { label: 'Visita',   var: 'var(--mx-violet)' },
  linkedin: { label: 'LinkedIn', var: 'var(--mx-blue)' },
  meet:     { label: 'Meet',     var: 'var(--mx-teal)' },
}
const FUNNEL_STEPS: { key: string; label: string; var: string }[] = [
  { key: 'alcance',     label: 'Por contactar', var: 'var(--mx-slate)' },
  { key: 'contactados', label: 'Contactados',   var: 'var(--mx-sky)' },
  { key: 'interesados', label: 'Interesados',   var: 'var(--mx-green)' },
  { key: 'reuniones',   label: 'Reuniones',     var: 'var(--mx-violet)' },
  { key: 'convertidos', label: 'Convertidos',   var: 'var(--mx-teal)' },
]

const RANK: Record<string, number> = {
  por_investigar: 0, por_contactar: 1, contactado: 2, siguiendo: 3,
  interesado: 4, reunion_agendada: 5, convertido: 6, descartado: -1,
}
const reached = (p: Prospect, stage: string) => (RANK[p.stage] ?? -1) >= RANK[stage]
const isContacted = (p: Prospect) => (p.touches ?? 0) > 0 || reached(p, 'contactado')

function profileName(profiles: Profile[], id: string | null): string {
  if (!id) return 'Sin asignar'
  const p = profiles.find(x => x.id === id)
  return p?.full_name || p?.email || 'Miembro'
}
function weekStart(iso: string): string {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}
function weekLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

// Colores por modo: claro por default, oscuro via clase dark: (Tailwind arbitrary properties)
const MODE_VARS = [
  '[--mx-sky:#0ea5e9]', 'dark:[--mx-sky:#0284c7]',
  '[--mx-amber:#f59e0b]', 'dark:[--mx-amber:#d97706]',
  '[--mx-violet:#8b5cf6]', 'dark:[--mx-violet:#8b5cf6]',
  '[--mx-green:#22c55e]', 'dark:[--mx-green:#16a34a]',
  '[--mx-blue:#3b82f6]', 'dark:[--mx-blue:#3b82f6]',
  '[--mx-teal:#14b8a6]', 'dark:[--mx-teal:#0d9488]',
  '[--mx-slate:#94a3b8]', 'dark:[--mx-slate:#64748b]',
].join(' ')

const TOOLTIP_STYLE = {
  background: 'rgba(13,18,32,0.94)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14, fontSize: 12, color: '#e2e8f0', boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: '8px 12px',
} as const

export default function EmbudoMetricas({
  prospects, activities, profiles, showSellers,
}: {
  prospects: Prospect[]
  activities: Activity[]
  profiles: Profile[]
  showSellers: boolean
}) {
  const ids = useMemo(() => new Set(prospects.map(p => p.id)), [prospects])
  const acts = useMemo(() => activities.filter(a => ids.has(a.prospect_id)), [activities, ids])

  const m = useMemo(() => {
    const contactados = prospects.filter(isContacted).length
    const interesados = prospects.filter(p => reached(p, 'interesado')).length
    const reuniones = prospects.filter(p => reached(p, 'reunion_agendada')).length
    const convertidos = prospects.filter(p => reached(p, 'convertido')).length
    return {
      total: prospects.length, contactados, interesados, reuniones, convertidos,
      descartados: prospects.filter(p => p.stage === 'descartado').length,
      toques: acts.filter(a => a.type === 'toque').length,
      respuestas: acts.filter(a => a.type === 'respuesta').length,
    }
  }, [prospects, acts])

  const funnel = useMemo(() => {
    const vals: Record<string, number> = {
      alcance: prospects.filter(p => reached(p, 'por_contactar')).length,
      contactados: m.contactados, interesados: m.interesados,
      reuniones: m.reuniones, convertidos: m.convertidos,
    }
    return FUNNEL_STEPS.map((s, i) => ({
      ...s, n: vals[s.key],
      rate: i === 0 ? null : pct(vals[s.key], vals[FUNNEL_STEPS[i - 1].key]),
    }))
  }, [prospects, m])

  const porSemana = useMemo(() => {
    const map: Record<string, { toques: number; respuestas: number }> = {}
    acts.forEach(a => {
      if (a.type !== 'toque' && a.type !== 'respuesta') return
      const w = weekStart(a.created_at)
      ;(map[w] ??= { toques: 0, respuestas: 0 })
      if (a.type === 'toque') map[w].toques++
      else map[w].respuestas++
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
      .map(([w, v]) => ({ semana: weekLabel(w), ...v }))
  }, [acts])

  const porCanal = useMemo(() => {
    const c: Record<string, number> = {}
    acts.filter(a => a.type === 'toque' && a.channel).forEach(a => { c[a.channel as string] = (c[a.channel as string] ?? 0) + 1 })
    return Object.entries(c)
      .map(([k, n]) => ({ key: k, label: CHAN[k]?.label ?? k, cvar: CHAN[k]?.var ?? 'var(--mx-slate)', n }))
      .sort((a, b) => b.n - a.n)
  }, [acts])

  const porSegmento = useMemo(() => (
    Object.entries(SEG).map(([key, meta]) => {
      const list = prospects.filter(p => p.icp_segment === key)
      const cont = list.filter(isContacted).length
      const reun = list.filter(p => reached(p, 'reunion_agendada')).length
      return { key, ...meta, total: list.length, contactados: cont, interesados: list.filter(p => reached(p, 'interesado')).length, reuniones: reun, rate: pct(reun, cont) }
    }).filter(s => s.total > 0)
  ), [prospects])

  const porVendedor = useMemo(() => {
    const map: Record<string, { total: number; contactados: number; interesados: number; reuniones: number }> = {}
    prospects.forEach(p => {
      const k = p.assigned_to ?? '__none__'
      ;(map[k] ??= { total: 0, contactados: 0, interesados: 0, reuniones: 0 })
      map[k].total++
      if (isContacted(p)) map[k].contactados++
      if (reached(p, 'interesado')) map[k].interesados++
      if (reached(p, 'reunion_agendada')) map[k].reuniones++
    })
    return Object.entries(map).map(([id, v]) => ({ name: id === '__none__' ? 'Sin asignar' : profileName(profiles, id), ...v })).sort((a, b) => b.total - a.total)
  }, [prospects, profiles])

  if (m.total === 0) {
    return <div className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">Aún no hay prospectos en esta vista.</div>
  }

  const maxFunnel = Math.max(...funnel.map(f => f.n), 1)
  const maxCanal = Math.max(...porCanal.map(c => c.n), 1)

  return (
    <div className={`space-y-4 ${MODE_VARS}`}>
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Tile icon={<IconSend />} cvar="var(--mx-sky)" label="Toques enviados" value={String(m.toques)} sub={`${m.respuestas} respuestas recibidas`} />
        <Tile icon={<IconReply />} cvar="var(--mx-green)" label="Tasa de respuesta" value={`${pct(m.interesados, m.contactados)}%`} sub={`${m.interesados} de ${m.contactados} contactados`} />
        <Tile icon={<IconCalendar />} cvar="var(--mx-violet)" label="Tasa de reunión" value={`${pct(m.reuniones, m.contactados)}%`} sub={`${m.reuniones} reuniones logradas`} />
        <Tile icon={<IconFlag />} cvar="var(--mx-teal)" label="Cierre" value={`${pct(m.convertidos, m.reuniones)}%`} sub={`${m.convertidos} convertidos · ${m.descartados} descartados`} />
      </div>

      {/* ── Embudo ── */}
      <Card title="Embudo de conversión" sub="De la cartera al cierre — % de conversión entre cada etapa">
        <div className="space-y-1.5 pt-1">
          {funnel.map(f => (
            <div key={f.key} className="group">
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400">{f.label}</span>
                <div className="relative h-8 flex-1 overflow-hidden rounded-xl bg-slate-100/80 dark:bg-white/[0.04]">
                  <div
                    className="flex h-full items-center rounded-xl pl-3 transition-all duration-700"
                    style={{ width: `${Math.max((f.n / maxFunnel) * 100, f.n > 0 ? 7 : 0)}%`, background: `linear-gradient(90deg, ${f.var}, color-mix(in oklab, ${f.var} 72%, transparent))` }}
                  >
                    <span className="text-[12px] font-bold tabular-nums text-white drop-shadow-sm">{f.n}</span>
                  </div>
                </div>
                <span className="w-14 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                  {f.rate !== null ? `${f.rate}%` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Actividad por semana ── */}
        <div className="lg:col-span-3">
          <Card title="Actividad por semana" sub="Toques enviados vs. respuestas recibidas">
            {porSemana.length === 0 ? <Empty /> : (
              <>
                <div className="mb-2 flex items-center gap-4">
                  <LegendChip cvar="var(--mx-sky)" label="Toques" />
                  <LegendChip cvar="var(--mx-green)" label="Respuestas" />
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={porSemana} margin={{ left: -22, right: 6, top: 6, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gToques" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--mx-sky)', stopOpacity: 0.28 }} />
                        <stop offset="100%" style={{ stopColor: 'var(--mx-sky)', stopOpacity: 0 }} />
                      </linearGradient>
                      <linearGradient id="gResp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--mx-green)', stopOpacity: 0.28 }} />
                        <stop offset="100%" style={{ stopColor: 'var(--mx-green)', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200/70 dark:text-white/[0.06]" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10.5 }} tickLine={false} axisLine={false} stroke="currentColor" className="text-slate-400" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10.5 }} tickLine={false} axisLine={false} width={34} stroke="currentColor" className="text-slate-400" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: 'rgba(148,163,184,0.35)', strokeDasharray: '4 4' }} />
                    <Area type="monotone" dataKey="toques" name="Toques" stroke="var(--mx-sky)" strokeWidth={2} fill="url(#gToques)" dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--mx-sky)' }} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="respuestas" name="Respuestas" stroke="var(--mx-green)" strokeWidth={2} fill="url(#gResp)" dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--mx-green)' }} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
          </Card>
        </div>

        {/* ── Toques por canal ── */}
        <div className="lg:col-span-2">
          <Card title="Toques por canal" sub="Dónde estás tocando puertas">
            {porCanal.length === 0 ? <Empty /> : (
              <div className="space-y-2.5 pt-1">
                {porCanal.map(c => (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">{c.label}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded-lg bg-slate-100/80 dark:bg-white/[0.04]">
                      <div className="h-full rounded-lg transition-all duration-700" style={{ width: `${Math.max((c.n / maxCanal) * 100, 6)}%`, background: c.cvar }} />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{c.n}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Conversión por segmento ── */}
      <Card title="Conversión por segmento" sub="Qué giro está respondiendo mejor">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <th className="py-2 pr-4 font-bold">Segmento</th>
                <th className="px-3 py-2 font-bold tabular-nums">Prospectos</th>
                <th className="px-3 py-2 font-bold tabular-nums">Contactados</th>
                <th className="px-3 py-2 font-bold tabular-nums">Interesados</th>
                <th className="px-3 py-2 font-bold tabular-nums">Reuniones</th>
                <th className="w-[30%] py-2 pl-3 font-bold">Tasa de reunión</th>
              </tr>
            </thead>
            <tbody>
              {porSegmento.map(s => (
                <tr key={s.key} className="border-t border-slate-100 dark:border-white/[0.06]">
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.var }} />{s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{s.total}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{s.contactados}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{s.interesados}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{s.reuniones}</td>
                  <td className="py-2.5 pl-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.05]">
                        <div className="h-full rounded-full" style={{ width: `${s.rate}%`, background: s.var }} />
                      </div>
                      <span className="w-9 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{s.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Por vendedor ── */}
      {showSellers && porVendedor.length > 0 && (
        <Card title="Por vendedor" sub="Actividad y resultados de cada quien">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="py-2 pr-4 font-bold">Vendedor</th>
                  <th className="px-3 py-2 font-bold tabular-nums">Prospectos</th>
                  <th className="px-3 py-2 font-bold tabular-nums">Contactados</th>
                  <th className="px-3 py-2 font-bold tabular-nums">Interesados</th>
                  <th className="py-2 pl-3 font-bold tabular-nums">Reuniones</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map(v => (
                  <tr key={v.name} className="border-t border-slate-100 dark:border-white/[0.06]">
                    <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-200">{v.name}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{v.total}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{v.contactados}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{v.interesados}</td>
                    <td className="py-2.5 pl-3 tabular-nums font-semibold" style={{ color: 'var(--mx-violet)' }}>{v.reuniones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── UI ──────────────────────────────────────────────────────────────────────
function Tile({ icon, cvar, label, value, sub }: { icon: ReactNode; cvar: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-[#1e2535]" style={CARD_S}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${cvar} 14%, transparent)`, color: cvar }}>
          {icon}
        </span>
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tabular-nums tracking-tight text-slate-800 dark:text-slate-100">{value}</p>
      <p className="mt-1.5 truncate text-[10.5px] text-slate-400 dark:text-slate-500">{sub}</p>
    </div>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#1e2535]" style={CARD_S}>
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
        {sub && <p className="mt-0.5 text-[11px] text-slate-400/80 dark:text-slate-500/80">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function LegendChip({ cvar, label }: { cvar: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      <span className="h-[3px] w-4 rounded-full" style={{ background: cvar }} />{label}
    </span>
  )
}

function Empty() {
  return <p className="py-8 text-center text-xs italic text-slate-400 dark:text-slate-600">Sin datos todavía.</p>
}

// Iconos SVG line (sin emojis, estilo Antuario)
function IconSend() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.3 3.9a.5.5 0 01.7-.6l16.6 8.3a.5.5 0 010 .9L4 20.7a.5.5 0 01-.7-.6L6 12zm0 0h7" /></svg>
}
function IconReply() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l-5-5 5-5M4 9h9a7 7 0 017 7v3" /></svg>
}
function IconCalendar() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" /></svg>
}
function IconFlag() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 1h12l-2.5 4L17 13H5" /></svg>
}
