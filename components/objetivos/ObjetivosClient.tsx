'use client'

import { useState, useMemo, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Types ────────────────────────────────────────────────────────────────────

type Goal = {
  id: string; organization_id: number
  title: string; description: string | null
  category: string; metric_key: string | null; metric_unit: string | null
  target_value: number | null; current_value: number | null; baseline_value: number | null
  period: string; start_date: string; end_date: string | null
  status: string; priority: string
  owner_id: string | null; notes: string | null
  created_at: string; updated_at: string
}

type GoalTarget = {
  id: string; goal_id: string; organization_id: number
  title: string; description: string | null
  metric_key: string | null; metric_unit: string | null
  target_value: number; current_value: number; baseline_value: number
  weight: number; status: string; owner_id: string | null
  sort_order: number; notes: string | null
  created_at: string; updated_at: string
}

type Profile = { id: string; full_name: string | null; email: string | null }

type Props = {
  orgId: number; currentUserId: string; currentUserRole: string
  initialGoals: Goal[]; initialTargets: GoalTarget[]; profiles: Profile[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
// IMPORTANTE: 'critica' sin tilde — así quedó en el CHECK constraint de Supabase

const CATEGORIES = [
  { value: 'ventas',      label: 'Ventas',      color: 'bg-emerald-100 text-emerald-800' },
  { value: 'marketing',   label: 'Marketing',   color: 'bg-blue-100 text-blue-800' },
  { value: 'operaciones', label: 'Operaciones', color: 'bg-amber-100 text-amber-800' },
  { value: 'financiero',  label: 'Financiero',  color: 'bg-violet-100 text-violet-800' },
  { value: 'equipo',      label: 'Equipo',      color: 'bg-cyan-100 text-cyan-800' },
  { value: 'producto',    label: 'Producto',    color: 'bg-rose-100 text-rose-800' },
  { value: 'clientes',    label: 'Clientes',    color: 'bg-orange-100 text-orange-800' },
  { value: 'otro',        label: 'Otro',        color: 'bg-slate-100 text-slate-700' },
]

const PERIODS = [
  { value: 'mensual',       label: 'Mensual' },
  { value: 'trimestral',    label: 'Trimestral' },
  { value: 'semestral',     label: 'Semestral' },
  { value: 'anual',         label: 'Anual' },
  { value: 'personalizado', label: 'Personalizado' },
]

const PRIORITIES = [
  { value: 'baja',    label: 'Baja',    color: 'bg-slate-100 text-slate-600' },
  { value: 'media',   label: 'Media',   color: 'bg-blue-100 text-blue-700' },
  { value: 'alta',    label: 'Alta',    color: 'bg-amber-100 text-amber-700' },
  { value: 'critica', label: 'Crítica', color: 'bg-red-100 text-red-700' },   // sin tilde
]

const STATUSES = [
  { value: 'draft',      label: 'Borrador',   color: 'bg-slate-100 text-slate-500' },
  { value: 'active',     label: 'Activo',     color: 'bg-emerald-100 text-emerald-700' },
  { value: 'paused',     label: 'En pausa',   color: 'bg-amber-100 text-amber-700' },
  { value: 'completed',  label: 'Completado', color: 'bg-blue-100 text-blue-700' },
  { value: 'cancelled',  label: 'Cancelado',  color: 'bg-red-100 text-red-500' },
]

const EMPTY_GOAL = {
  title: '', description: '', category: 'ventas', metric_key: '',
  metric_unit: '', target_value: '', baseline_value: '',
  period: 'trimestral', start_date: new Date().toISOString().split('T')[0],
  end_date: '', status: 'active', priority: 'media', owner_id: '', notes: '',
}

const EMPTY_TARGET = {
  title: '', description: '', metric_key: '', metric_unit: '',
  target_value: '', baseline_value: '', weight: '', notes: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(current: number | null, target: number | null) {
  if (!target || target === 0) return 0
  return Math.min(100, Math.round(((current ?? 0) / target) * 100))
}

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function catInfo(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[7]
}
function prioInfo(p: string) {
  return PRIORITIES.find(x => x.value === p) ?? PRIORITIES[1]
}
function statusInfo(s: string) {
  return STATUSES.find(x => x.value === s) ?? STATUSES[0]
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'bg-emerald-500', height = 'h-2' }: {
  value: number; color?: string; height?: string
}) {
  return (
    <div className={`w-full ${height} bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ObjetivosClient({
  orgId, currentUserId, initialGoals, initialTargets, profiles,
}: Props) {
  const [goals,   setGoals]   = useState<Goal[]>(initialGoals)
  const [targets, setTargets] = useState<GoalTarget[]>(initialTargets)

  const [filterCat,    setFilterCat]    = useState('all')
  const [filterStatus, setFilterStatus] = useState('active')
  const [selected,     setSelected]     = useState<Goal | null>(null)

  // Goal modal
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [editingGoal,   setEditingGoal]   = useState<Goal | null>(null)
  const [goalForm,      setGoalForm]      = useState(EMPTY_GOAL)
  const [goalSaving,    setGoalSaving]    = useState(false)
  const [goalError,     setGoalError]     = useState('')

  // Target modal
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [editingTarget,   setEditingTarget]   = useState<GoalTarget | null>(null)
  const [targetForm,      setTargetForm]      = useState(EMPTY_TARGET)
  const [targetSaving,    setTargetSaving]    = useState(false)
  const [targetError,     setTargetError]     = useState('')

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return goals.filter(g => {
      if (filterCat    !== 'all' && g.category !== filterCat)    return false
      if (filterStatus !== 'all' && g.status   !== filterStatus) return false
      return true
    })
  }, [goals, filterCat, filterStatus])

  const selectedTargets = useMemo(() =>
    selected ? targets.filter(t => t.goal_id === selected.id).sort((a, b) => a.sort_order - b.sort_order) : [],
    [selected, targets]
  )

  const kpis = useMemo(() => {
    const active    = goals.filter(g => g.status === 'active').length
    const completed = goals.filter(g => g.status === 'completed').length
    const avgPct    = goals.length
      ? Math.round(goals.reduce((s, g) => s + pct(g.current_value, g.target_value), 0) / goals.length)
      : 0
    return { total: goals.length, active, completed, avgPct }
  }, [goals])

  // ── Goal CRUD ──────────────────────────────────────────────────────────────

  const openCreateGoal = useCallback(() => {
    setGoalForm(EMPTY_GOAL); setGoalError(''); setEditingGoal(null); setShowGoalModal(true)
  }, [])

  const openEditGoal = useCallback((g: Goal) => {
    setGoalForm({
      title: g.title, description: g.description ?? '', category: g.category,
      metric_key: g.metric_key ?? '', metric_unit: g.metric_unit ?? '',
      target_value: String(g.target_value ?? ''), baseline_value: String(g.baseline_value ?? ''),
      period: g.period, start_date: g.start_date, end_date: g.end_date ?? '',
      status: g.status, priority: g.priority, owner_id: g.owner_id ?? '', notes: g.notes ?? '',
    })
    setGoalError(''); setEditingGoal(g); setShowGoalModal(true)
  }, [])

  const handleSaveGoal = useCallback(async () => {
    if (!goalForm.title.trim()) { setGoalError('El título es obligatorio'); return }
    setGoalSaving(true); setGoalError('')
    const client  = getSB()
    const payload = {
      organization_id: orgId,
      title:           goalForm.title.trim(),
      description:     goalForm.description  || null,
      category:        goalForm.category,
      metric_key:      goalForm.metric_key   || null,
      metric_unit:     goalForm.metric_unit  || null,
      target_value:    goalForm.target_value  ? Number(goalForm.target_value)  : null,
      baseline_value:  goalForm.baseline_value ? Number(goalForm.baseline_value) : null,
      period:          goalForm.period,
      start_date:      goalForm.start_date,
      end_date:        goalForm.end_date     || null,
      status:          goalForm.status,
      priority:        goalForm.priority,
      owner_id:        goalForm.owner_id     || null,
      notes:           goalForm.notes        || null,
    }

    if (editingGoal) {
      const { data, error: e } = await client.from('goals')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingGoal.id).select().single()
      if (e) { setGoalError(e.message); setGoalSaving(false); return }
      setGoals(p => p.map(g => g.id === editingGoal.id ? data : g))
      if (selected?.id === editingGoal.id) setSelected(data)
    } else {
      const { data, error: e } = await client.from('goals')
        .insert({ ...payload, created_by: currentUserId }).select().single()
      if (e) { setGoalError(e.message); setGoalSaving(false); return }
      setGoals(p => [data, ...p])
    }
    setGoalSaving(false); setShowGoalModal(false)
  }, [goalForm, editingGoal, orgId, currentUserId, selected])

  const handleDeleteGoal = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este objetivo? Se eliminarán también sus metas.')) return
    await getSB().from('goals').delete().eq('id', id)
    setGoals(p => p.filter(g => g.id !== id))
    setTargets(p => p.filter(t => t.goal_id !== id))
    if (selected?.id === id) setSelected(null)
  }, [selected])

  // ── Target CRUD ────────────────────────────────────────────────────────────

  const openCreateTarget = useCallback(() => {
    setTargetForm(EMPTY_TARGET); setTargetError(''); setEditingTarget(null); setShowTargetModal(true)
  }, [])

  const openEditTarget = useCallback((t: GoalTarget) => {
    setTargetForm({
      title: t.title, description: t.description ?? '',
      metric_key: t.metric_key ?? '', metric_unit: t.metric_unit ?? '',
      target_value: String(t.target_value), baseline_value: String(t.baseline_value),
      weight: String(t.weight), notes: t.notes ?? '',
    })
    setTargetError(''); setEditingTarget(t); setShowTargetModal(true)
  }, [])

  const handleSaveTarget = useCallback(async () => {
    if (!targetForm.title.trim()) { setTargetError('El título es obligatorio'); return }
    if (!selected) return
    setTargetSaving(true); setTargetError('')
    const client  = getSB()
    const payload = {
      goal_id:         selected.id,
      organization_id: orgId,
      title:           targetForm.title.trim(),
      description:     targetForm.description  || null,
      metric_key:      targetForm.metric_key   || null,
      metric_unit:     targetForm.metric_unit  || null,
      target_value:    Number(targetForm.target_value)  || 0,
      baseline_value:  Number(targetForm.baseline_value) || 0,
      weight:          Number(targetForm.weight)  || 0,
      notes:           targetForm.notes  || null,
      sort_order:      editingTarget ? editingTarget.sort_order : selectedTargets.length,
    }

    if (editingTarget) {
      const { data, error: e } = await client.from('goal_targets')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingTarget.id).select().single()
      if (e) { setTargetError(e.message); setTargetSaving(false); return }
      setTargets(p => p.map(t => t.id === editingTarget.id ? data : t))
    } else {
      const { data, error: e } = await client.from('goal_targets')
        .insert(payload).select().single()
      if (e) { setTargetError(e.message); setTargetSaving(false); return }
      setTargets(p => [...p, data])
    }
    setTargetSaving(false); setShowTargetModal(false)
  }, [targetForm, editingTarget, selected, orgId, selectedTargets.length])

  const handleDeleteTarget = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta meta?')) return
    await getSB().from('goal_targets').delete().eq('id', id)
    setTargets(p => p.filter(t => t.id !== id))
  }, [])

  const setG = (k: string, v: string) => setGoalForm(p => ({ ...p, [k]: v }))
  const setT = (k: string, v: string) => setTargetForm(p => ({ ...p, [k]: v }))

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50">

      {/* ── Left: filters + KPIs ─────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 bg-white dark:bg-[#161b27] border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">Objetivos</h2>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-2xl font-bold text-slate-900">{kpis.total}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3">
              <p className="text-xs text-emerald-500">Activos</p>
              <p className="text-2xl font-bold text-emerald-700">{kpis.active}</p>
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs text-blue-500 mb-1">Progreso promedio</p>
            <p className="text-xl font-bold text-blue-700 mb-1.5">{kpis.avgPct}%</p>
            <ProgressBar value={kpis.avgPct} color="bg-blue-500" />
          </div>
        </div>

        {/* Category filters */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Categoría</p>
          <div className="space-y-1">
            <button onClick={() => setFilterCat('all')}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filterCat === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              Todas
            </button>
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setFilterCat(c.value)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filterCat === c.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status filters */}
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Estado</p>
          <div className="space-y-1">
            {[{ value: 'all', label: 'Todos' }, ...STATUSES].map(s => (
              <button key={s.value} onClick={() => setFilterStatus(s.value)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filterStatus === s.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={openCreateGoal}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            + Nuevo objetivo
          </button>
        </div>
      </aside>

      {/* ── Center: goals list ────────────────────────────────────────────── */}
      <main className={`flex flex-col transition-all ${selected ? 'w-96 shrink-0' : 'flex-1'}`}>
        <div className="bg-white dark:bg-[#161b27] border-b border-slate-200 dark:border-slate-800 px-5 py-3 flex items-center justify-between">
          <p className="text-sm text-slate-500">{filtered.length} objetivos</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#1a2030] flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600">Sin objetivos</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Crea tu primer objetivo estratégico</p>
            </div>
          ) : (
            filtered.map(goal => {
              const cat      = catInfo(goal.category)
              const prio     = prioInfo(goal.priority)
              const st       = statusInfo(goal.status)
              const progress = pct(goal.current_value, goal.target_value)
              const goalTargets = targets.filter(t => t.goal_id === goal.id)
              const isActive = selected?.id === goal.id

              return (
                <div key={goal.id} onClick={() => setSelected(isActive ? null : goal)}
                  className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${isActive ? 'border-slate-800 shadow-md' : 'border-slate-200'}`}>

                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prio.color}`}>{prio.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      </div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug">{goal.title}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-slate-900">{progress}%</p>
                      <p className="text-xs text-slate-400">progreso</p>
                    </div>
                  </div>

                  <ProgressBar
                    value={progress}
                    color={progress >= 75 ? 'bg-emerald-500' : progress >= 40 ? 'bg-blue-500' : 'bg-amber-500'}
                  />

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-slate-400">
                      {goal.metric_unit
                        ? `${goal.current_value ?? 0} / ${goal.target_value ?? '—'} ${goal.metric_unit}`
                        : goal.metric_key ?? '—'}
                    </p>
                    <p className="text-xs text-slate-400">{goalTargets.length} metas</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      {/* ── Right: goal detail ────────────────────────────────────────────── */}
      {selected && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#161b27] border-l border-slate-200 dark:border-slate-800">
          <GoalDetail
            goal={selected}
            targets={selectedTargets}
            profiles={profiles}
            onEdit={() => openEditGoal(selected)}
            onDelete={() => handleDeleteGoal(selected.id)}
            onClose={() => setSelected(null)}
            onAddTarget={openCreateTarget}
            onEditTarget={openEditTarget}
            onDeleteTarget={handleDeleteTarget}
          />
        </div>
      )}

      {/* ── Goal Modal ────────────────────────────────────────────────────── */}
      {showGoalModal && (
        <Modal title={editingGoal ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={() => setShowGoalModal(false)}>
          <div className="space-y-4">
            <Field label="Título *">
              <Input value={goalForm.title} onChange={v => setG('title', v)} placeholder="Aumentar tráfico SEO 40%" />
            </Field>
            <Field label="Descripción">
              <textarea value={goalForm.description} onChange={e => setG('description', e.target.value)}
                rows={2} placeholder="Contexto del objetivo..."
                className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <Select value={goalForm.category} onChange={v => setG('category', v)}
                  options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))} />
              </Field>
              <Field label="Período">
                <Select value={goalForm.period} onChange={v => setG('period', v)}
                  options={PERIODS.map(p => ({ value: p.value, label: p.label }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Métrica (clave)">
                <Input value={goalForm.metric_key} onChange={v => setG('metric_key', v)} placeholder="trafico_seo" />
              </Field>
              <Field label="Unidad">
                <Input value={goalForm.metric_unit} onChange={v => setG('metric_unit', v)} placeholder="visitas, MXN, %" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor objetivo">
                <Input value={goalForm.target_value} onChange={v => setG('target_value', v)} placeholder="1000" type="number" />
              </Field>
              <Field label="Valor base">
                <Input value={goalForm.baseline_value} onChange={v => setG('baseline_value', v)} placeholder="600" type="number" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha inicio">
                <Input value={goalForm.start_date} onChange={v => setG('start_date', v)} type="date" />
              </Field>
              <Field label="Fecha fin">
                <Input value={goalForm.end_date} onChange={v => setG('end_date', v)} type="date" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridad">
                <Select value={goalForm.priority} onChange={v => setG('priority', v)}
                  options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} />
              </Field>
              <Field label="Estado">
                <Select value={goalForm.status} onChange={v => setG('status', v)}
                  options={STATUSES.map(s => ({ value: s.value, label: s.label }))} />
              </Field>
            </div>
            <Field label="Responsable">
              <Select value={goalForm.owner_id} onChange={v => setG('owner_id', v)}
                options={[{ value: '', label: 'Sin asignar' }, ...profiles.map(p => ({ value: p.id, label: p.full_name ?? p.email ?? p.id }))]} />
            </Field>
            <Field label="Notas">
              <textarea value={goalForm.notes} onChange={e => setG('notes', e.target.value)} rows={2}
                className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none" />
            </Field>
            {goalError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{goalError}</p>}
          </div>
          <ModalFooter
            onCancel={() => setShowGoalModal(false)}
            onSave={handleSaveGoal}
            saving={goalSaving}
            label={editingGoal ? 'Guardar cambios' : 'Crear objetivo'}
          />
        </Modal>
      )}

      {/* ── Target Modal ──────────────────────────────────────────────────── */}
      {showTargetModal && (
        <Modal title={editingTarget ? 'Editar meta' : 'Nueva meta'} onClose={() => setShowTargetModal(false)}>
          <div className="space-y-4">
            <Field label="Título de la meta *">
              <Input value={targetForm.title} onChange={v => setT('title', v)} placeholder="Mejorar landing pages" />
            </Field>
            <Field label="Descripción">
              <textarea value={targetForm.description} onChange={e => setT('description', e.target.value)}
                rows={2} className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Métrica (clave)">
                <Input value={targetForm.metric_key} onChange={v => setT('metric_key', v)} placeholder="visitas_landing" />
              </Field>
              <Field label="Unidad">
                <Input value={targetForm.metric_unit} onChange={v => setT('metric_unit', v)} placeholder="visitas" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Objetivo">
                <Input value={targetForm.target_value} onChange={v => setT('target_value', v)} placeholder="400" type="number" />
              </Field>
              <Field label="Base">
                <Input value={targetForm.baseline_value} onChange={v => setT('baseline_value', v)} placeholder="200" type="number" />
              </Field>
              <Field label="Peso (%)">
                <Input value={targetForm.weight} onChange={v => setT('weight', v)} placeholder="50" type="number" />
              </Field>
            </div>
            <Field label="Notas">
              <textarea value={targetForm.notes} onChange={e => setT('notes', e.target.value)} rows={2}
                className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none" />
            </Field>
            {targetError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{targetError}</p>}
          </div>
          <ModalFooter
            onCancel={() => setShowTargetModal(false)}
            onSave={handleSaveTarget}
            saving={targetSaving}
            label={editingTarget ? 'Guardar meta' : 'Crear meta'}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── Goal Detail Panel ────────────────────────────────────────────────────────

function GoalDetail({
  goal, targets, profiles,
  onEdit, onDelete, onClose,
  onAddTarget, onEditTarget, onDeleteTarget,
}: {
  goal: Goal; targets: GoalTarget[]; profiles: Profile[]
  onEdit: () => void; onDelete: () => void; onClose: () => void
  onAddTarget: () => void
  onEditTarget: (t: GoalTarget) => void
  onDeleteTarget: (id: string) => void
}) {
  const cat      = catInfo(goal.category)
  const prio     = prioInfo(goal.priority)
  const st       = statusInfo(goal.status)
  const progress = pct(goal.current_value, goal.target_value)
  const owner    = profiles.find(p => p.id === goal.owner_id)
  const totalWeight = targets.reduce((s, t) => s + t.weight, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prio.color}`}>{prio.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">{goal.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50">Editar</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Big progress */}
        <div className="bg-slate-50 rounded-2xl p-4">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Progreso</p>
              <p className="text-4xl font-bold text-slate-900">{progress}%</p>
            </div>
            {goal.target_value && (
              <div className="text-right">
                <p className="text-xs text-slate-400">Actual / Objetivo</p>
                <p className="text-lg font-semibold text-slate-700">
                  {goal.current_value ?? 0} / {goal.target_value} {goal.metric_unit ?? ''}
                </p>
              </div>
            )}
          </div>
          <ProgressBar
            value={progress} height="h-3"
            color={progress >= 75 ? 'bg-emerald-500' : progress >= 40 ? 'bg-blue-500' : 'bg-amber-500'}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Info */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Detalles</p>
          <div className="space-y-1">
            <Row label="Período"     value={{ mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', personalizado: 'Personalizado' }[goal.period] ?? goal.period} />
            <Row label="Inicio"      value={goal.start_date} />
            <Row label="Fin"         value={goal.end_date ?? '—'} />
            <Row label="Métrica"     value={goal.metric_key ?? '—'} />
            <Row label="Unidad"      value={goal.metric_unit ?? '—'} />
            <Row label="Base"        value={goal.baseline_value != null ? String(goal.baseline_value) : '—'} />
            <Row label="Responsable" value={owner?.full_name ?? owner?.email ?? '—'} />
          </div>
        </div>

        {goal.description && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Descripción</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#0d1117] rounded-xl p-3">{goal.description}</p>
          </div>
        )}

        {/* Targets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Metas ({targets.length})
              {totalWeight > 0 && <span className="ml-2 font-normal">{totalWeight}% peso total</span>}
            </p>
            <button onClick={onAddTarget}
              className="text-xs bg-slate-900 text-white px-2.5 py-1 rounded-lg hover:bg-slate-800 transition-colors">
              + Meta
            </button>
          </div>

          {targets.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Sin metas definidas</p>
          ) : (
            <div className="space-y-2">
              {targets.map(t => {
                const tp = pct(t.current_value, t.target_value)
                return (
                  <div key={t.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 group">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                        {t.metric_key && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {t.current_value} / {t.target_value} {t.metric_unit ?? ''} · Peso {t.weight}%
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEditTarget(t)}
                          className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
                          Editar
                        </button>
                        <button onClick={() => onDeleteTarget(t.id)}
                          className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50">
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={tp} color={tp >= 75 ? 'bg-emerald-500' : tp >= 40 ? 'bg-blue-500' : 'bg-amber-500'} />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">{tp}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {goal.notes && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Notas</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#0d1117] rounded-xl p-3">{goal.notes}</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-3 flex justify-between items-center">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Eliminar objetivo</button>
        <p className="text-xs text-slate-400">Creado {new Date(goal.created_at).toLocaleDateString('es-MX')}</p>
      </div>
    </div>
  )
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#161b27] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onCancel, onSave, saving, label }: {
  onCancel: () => void; onSave: () => void; saving: boolean; label: string
}) {
  return (
    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
      <button onClick={onCancel} className="text-sm text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 transition-colors">Cancelar</button>
      <button onClick={onSave} disabled={saving}
        className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
        {saving ? 'Guardando...' : label}
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 w-28">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>{children}</div>
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700" />
  )
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 bg-white">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

