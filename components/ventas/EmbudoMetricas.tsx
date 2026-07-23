'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from 'recharts'
import { CARD_S } from '@/components/ui/dashboard'

// ─── Tipos (subconjunto de los de ProspeccionClient) ─────────────────────────
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

const SEG: Record<string, { label: string; color: string }> = {
  despacho_legal:         { label: 'Legal',        color: '#6366f1' },
  promotora_inmobiliaria: { label: 'Inmobiliaria', color: '#0ea5e9' },
  agencia_marketing:      { label: 'Agencia',      color: '#ec4899' },
}
const CHAN: Record<string, { label: string; color: string }> = {
  email:    { label: 'Correo',   color: '#0ea5e9' },
  whatsapp: { label: 'WhatsApp', color: '#22c55e' },
  llamada:  { label: 'Llamada',  color: '#f59e0b' },
  visita:   { label: 'Visita',   color: '#8b5cf6' },
  linkedin: { label: 'LinkedIn', color: '#3b82f6' },
  meet:     { label: 'Meet',     color: '#14b8a6' },
}

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
  const day = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - day)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
}
function weekLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

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
    const total = prospects.length
    const contactados = prospects.filter(isContacted).length
    const interesados = prospects.filter(p => reached(p, 'interesado')).length
    const reuniones = prospects.filter(p => reached(p, 'reunion_agendada')).length
    const convertidos = prospects.filter(p => reached(p, 'convertido')).length
    const descartados = prospects.filter(p => p.stage === 'descartado').length
    const toques = acts.filter(a => a.type === 'toque').length
    const respuestas = acts.filter(a => a.type === 'respuesta').length
    return { total, contactados, interesados, reuniones, convertidos, descartados, toques, respuestas }
  }, [prospects, acts])

  const funnel = useMemo(() => ([
    { etapa: 'Por contactar', n: prospects.filter(p => reached(p, 'por_contactar')).length, color: '#94a3b8' },
    { etapa: 'Contactados',   n: m.contactados, color: '#38bdf8' },
    { etapa: 'Interesados',   n: m.interesados, color: '#34d399' },
    { etapa: 'Reuniones',     n: m.reuniones,   color: '#8b5cf6' },
    { etapa: 'Convertidos',   n: m.convertidos, color: '#14b8a6' },
  ]), [prospects, m])

  const porSegmento = useMemo(() => (
    Object.entries(SEG).map(([key, meta]) => {
      const list = prospects.filter(p => p.icp_segment === key)
      const cont = list.filter(isContacted).length
      return {
        key, label: meta.label, color: meta.color,
        total: list.length, contactados: cont,
        interesados: list.filter(p => reached(p, 'interesado')).length,
        reuniones: list.filter(p => reached(p, 'reunion_agendada')).length,
      }
    }).filter(s => s.total > 0)
  ), [prospects])

  const porCanal = useMemo(() => {
    const c: Record<string, number> = {}
    acts.filter(a => a.type === 'toque' && a.channel).forEach(a => { c[a.channel as string] = (c[a.channel as string] ?? 0) + 1 })
    return Object.entries(c).map(([k, n]) => ({ canal: CHAN[k]?.label ?? k, n, color: CHAN[k]?.color ?? '#94a3b8' })).sort((a, b) => b.n - a.n)
  }, [acts])

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
    return Object.entries(map).map(([id, v]) => ({
      name: id === '__none__' ? 'Sin asignar' : profileName(profiles, id), ...v,
    })).sort((a, b) => b.total - a.total)
  }, [prospects, profiles])

  if (m.total === 0) {
    return <div className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">Aún no hay prospectos en esta vista.</div>
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile label="Toques enviados" value={m.toques} sub={`${m.respuestas} respuestas`} tint="#0ea5e9" />
        <Tile label="Tasa de respuesta" value={`${pct(m.interesados, m.contactados)}%`} sub={`${m.interesados} de ${m.contactados} contactados`} tint="#34d399" />
        <Tile label="Tasa de reunión" value={`${pct(m.reuniones, m.contactados)}%`} sub={`${m.reuniones} reuniones`} tint="#8b5cf6" />
        <Tile label="Cierre" value={`${pct(m.convertidos, m.reuniones)}%`} sub={`${m.convertidos} convertidos · ${m.descartados} descartados`} tint="#14b8a6" />
      </div>

      {/* Embudo */}
      <Card title="Embudo de conversión">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
            <YAxis type="category" dataKey="etapa" width={92} tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-500 dark:text-slate-400" />
            <Tooltip cursor={{ fill: 'rgba(148,163,184,0.1)' }} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }} />
            <Bar dataKey="n" name="Prospectos" radius={[0, 6, 6, 0]}>
              {funnel.map((f, i) => <Cell key={i} fill={f.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Actividad por semana */}
        <Card title="Actividad por semana">
          {porSemana.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={porSemana} margin={{ left: -18, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid stroke="currentColor" className="text-slate-200 dark:text-white/10" vertical={false} />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="toques" name="Toques" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="respuestas" name="Respuestas" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Toques por canal */}
        <Card title="Toques por canal">
          {porCanal.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porCanal} margin={{ left: -18, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid stroke="currentColor" className="text-slate-200 dark:text-white/10" vertical={false} />
                <XAxis dataKey="canal" tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.1)' }} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }} />
                <Bar dataKey="n" name="Toques" radius={[6, 6, 0, 0]}>
                  {porCanal.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Conversión por segmento */}
      <Card title="Conversión por segmento">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-left">
                <th className="py-2 pr-4 font-bold">Segmento</th>
                <th className="py-2 px-3 font-bold tabular-nums">Prospectos</th>
                <th className="py-2 px-3 font-bold tabular-nums">Contactados</th>
                <th className="py-2 px-3 font-bold tabular-nums">Interesados</th>
                <th className="py-2 px-3 font-bold tabular-nums">Reuniones</th>
                <th className="py-2 pl-3 font-bold tabular-nums">Tasa reunión</th>
              </tr>
            </thead>
            <tbody>
              {porSegmento.map(s => (
                <tr key={s.key} className="border-t border-slate-100 dark:border-white/[0.06]">
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{s.total}</td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{s.contactados}</td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{s.interesados}</td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{s.reuniones}</td>
                  <td className="py-2.5 pl-3 tabular-nums font-semibold text-violet-600 dark:text-violet-400">{pct(s.reuniones, s.contactados)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Por vendedor */}
      {showSellers && porVendedor.length > 0 && (
        <Card title="Por vendedor">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-left">
                  <th className="py-2 pr-4 font-bold">Vendedor</th>
                  <th className="py-2 px-3 font-bold tabular-nums">Prospectos</th>
                  <th className="py-2 px-3 font-bold tabular-nums">Contactados</th>
                  <th className="py-2 px-3 font-bold tabular-nums">Interesados</th>
                  <th className="py-2 pl-3 font-bold tabular-nums">Reuniones</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map(v => (
                  <tr key={v.name} className="border-t border-slate-100 dark:border-white/[0.06]">
                    <td className="py-2.5 pr-4 font-medium text-slate-700 dark:text-slate-200">{v.name}</td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{v.total}</td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{v.contactados}</td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">{v.interesados}</td>
                    <td className="py-2.5 pl-3 tabular-nums font-semibold text-violet-600 dark:text-violet-400">{v.reuniones}</td>
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

function Tile({ label, value, sub, tint }: { label: string; value: string | number; sub: string; tint: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] px-4 py-3.5" style={CARD_S}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint }} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{sub}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-[#1e2535] border border-slate-200 dark:border-white/[0.08] p-4" style={CARD_S}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{title}</p>
      {children}
    </div>
  )
}

function Empty() {
  return <p className="text-xs text-slate-400 dark:text-slate-600 italic py-8 text-center">Sin datos todavía.</p>
}
