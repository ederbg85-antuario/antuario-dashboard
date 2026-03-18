'use client'

import { useState, useMemo, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string; organization_id: number; goal_id: string | null
  title: string; description: string | null; color: string | null
  status: string; priority: string; impact_level: string | null
  metric_key: string | null; metric_unit: string | null; expected_impact: number | null
  start_date: string | null; due_date: string | null; completed_at: string | null
  tasks_total: number; tasks_completed: number
  owner_id: string | null; notes: string | null
  created_at: string; updated_at: string
}

type Goal = { id: string; title: string; category: string; status: string }

type Task = {
  id: string; project_id: string | null; title: string
  status: string; priority: string | null; due_date: string | null
  assigned_to: string | null; completed_at: string | null
}

type Profile = { id: string; full_name: string | null; email: string | null }

type Props = {
  orgId: number; currentUserId: string; currentUserRole: string
  initialProjects: Project[]; goals: Goal[]
  initialTasks: Task[]; profiles: Profile[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_STATUSES = [
  { value: 'planning',   label: 'Planeación', color: 'bg-slate-100 dark:bg-[#1a2030] text-slate-600 dark:text-slate-300',   dot: 'bg-slate-400' },
  { value: 'active',     label: 'Activo',     color: 'bg-emerald-100 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { value: 'paused',     label: 'En pausa',   color: 'bg-amber-100 text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500' },
  { value: 'completed',  label: 'Completado', color: 'bg-blue-100 text-blue-700 dark:text-blue-400',     dot: 'bg-blue-500' },
  { value: 'cancelled',  label: 'Cancelado',  color: 'bg-red-100 text-red-500',       dot: 'bg-red-400' },
]

const PRIORITIES = [
  { value: 'baja',    label: 'Baja',    color: 'text-slate-500' },
  { value: 'media',   label: 'Media',   color: 'text-blue-600' },
  { value: 'alta',    label: 'Alta',    color: 'text-amber-600' },
  { value: 'urgente', label: 'Urgente', color: 'text-red-600' },
]

const IMPACTS = [
  { value: 'bajo',    label: 'Bajo' },
  { value: 'medio',   label: 'Medio' },
  { value: 'alto',    label: 'Alto' },
  { value: 'critico', label: 'Crítico' },
]

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done']
const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'Por hacer', in_progress: 'En proceso', review: 'Revisión', done: 'Hecho',
}

const PROJECT_COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316',
]

const EMPTY_PROJECT = {
  title: '', description: '', color: '#6366f1', status: 'planning',
  priority: 'media', impact_level: 'medio', goal_id: '', metric_key: '',
  metric_unit: '', expected_impact: '', start_date: '', due_date: '', notes: '', owner_id: '',
}

const EMPTY_TASK = {
  title: '', status: 'todo', priority: '', due_date: '', assigned_to: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progress(p: Project) {
  if (!p.tasks_total) return 0
  return Math.round((p.tasks_completed / p.tasks_total) * 100)
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date()
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function statusInfo(v: string) { return PROJECT_STATUSES.find(s => s.value === v) ?? PROJECT_STATUSES[0] }
function prioInfo(v: string)   { return PRIORITIES.find(p => p.value === v) ?? PRIORITIES[1] }

function getSB() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-slate-100 dark:bg-[#1a2030] rounded-full overflow-hidden">
      <div className="h-1.5 rounded-full transition-all duration-700"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProyectosClient({
  orgId, currentUserId, initialProjects, goals, initialTasks, profiles,
}: Props) {
  const [projects,  setProjects]  = useState<Project[]>(initialProjects)
  const [tasks,     setTasks]     = useState<Task[]>(initialTasks)
  const [selected,  setSelected]  = useState<Project | null>(null)
  const [view,      setView]      = useState<'board' | 'list'>('board')
  const [filterSt,  setFilterSt]  = useState('all')

  // Project modal
  const [showPModal, setShowPModal] = useState(false)
  const [editingP,   setEditingP]   = useState<Project | null>(null)
  const [pForm,      setPForm]      = useState(EMPTY_PROJECT)
  const [pSaving,    setPSaving]    = useState(false)
  const [pError,     setPError]     = useState('')

  // Task modal
  const [showTModal, setShowTModal] = useState(false)
  const [editingT,   setEditingT]   = useState<Task | null>(null)
  const [tForm,      setTForm]      = useState(EMPTY_TASK)
  const [tSaving,    setTSaving]    = useState(false)
  const [tError,     setTError]     = useState('')

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (filterSt === 'all') return projects
    return projects.filter(p => p.status === filterSt)
  }, [projects, filterSt])

  const byStatus = useMemo(() => {
    const map: Record<string, Project[]> = {}
    PROJECT_STATUSES.forEach(s => { map[s.value] = [] })
    filtered.forEach(p => { if (map[p.status]) map[p.status].push(p) })
    return map
  }, [filtered])

  const selectedTasks = useMemo(() =>
    selected ? tasks.filter(t => t.project_id === selected.id) : [],
    [selected, tasks]
  )

  const kpis = useMemo(() => {
    const active    = projects.filter(p => p.status === 'active').length
    const completed = projects.filter(p => p.status === 'completed').length
    const overdue   = projects.filter(p => isOverdue(p.due_date) && p.status !== 'completed' && p.status !== 'cancelled').length
    return { total: projects.length, active, completed, overdue }
  }, [projects])

  // ── Project CRUD ───────────────────────────────────────────────────────────

  const openCreateProject = useCallback(() => {
    setPForm(EMPTY_PROJECT); setPError(''); setEditingP(null); setShowPModal(true)
  }, [])

  const openEditProject = useCallback((p: Project) => {
    setPForm({
      title: p.title, description: p.description ?? '', color: p.color ?? '#6366f1',
      status: p.status, priority: p.priority, impact_level: p.impact_level ?? 'medio',
      goal_id: p.goal_id ?? '', metric_key: p.metric_key ?? '', metric_unit: p.metric_unit ?? '',
      expected_impact: String(p.expected_impact ?? ''), start_date: p.start_date ?? '',
      due_date: p.due_date ?? '', notes: p.notes ?? '', owner_id: p.owner_id ?? '',
    })
    setPError(''); setEditingP(p); setShowPModal(true)
  }, [])

  const handleSaveProject = useCallback(async () => {
    if (!pForm.title.trim()) { setPError('El título es obligatorio'); return }
    setPSaving(true); setPError('')
    const client  = getSB()
    const payload = {
      organization_id: orgId,
      title:           pForm.title.trim(),
      description:     pForm.description    || null,
      color:           pForm.color,
      status:          pForm.status,
      priority:        pForm.priority,
      impact_level:    pForm.impact_level   || null,
      goal_id:         pForm.goal_id        || null,
      metric_key:      pForm.metric_key     || null,
      metric_unit:     pForm.metric_unit    || null,
      expected_impact: pForm.expected_impact ? Number(pForm.expected_impact) : null,
      start_date:      pForm.start_date     || null,
      due_date:        pForm.due_date       || null,
      notes:           pForm.notes          || null,
      owner_id:        pForm.owner_id       || null,
    }

    if (editingP) {
      const { data, error: e } = await client.from('projects')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingP.id).select().single()
      if (e) { setPError(e.message); setPSaving(false); return }
      setProjects(p => p.map(x => x.id === editingP.id ? data : x))
      if (selected?.id === editingP.id) setSelected(data)
    } else {
      const { data, error: e } = await client.from('projects')
        .insert({ ...payload, created_by: currentUserId }).select().single()
      if (e) { setPError(e.message); setPSaving(false); return }
      setProjects(p => [data, ...p])
    }
    setPSaving(false); setShowPModal(false)
  }, [pForm, editingP, orgId, currentUserId, selected])

  const handleDeleteProject = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este proyecto? Las tareas asociadas quedarán sin proyecto.')) return
    await getSB().from('projects').delete().eq('id', id)
    setProjects(p => p.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }, [selected])

  // ── Task CRUD ──────────────────────────────────────────────────────────────

  const openCreateTask = useCallback(() => {
    setTForm(EMPTY_TASK); setTError(''); setEditingT(null); setShowTModal(true)
  }, [])

  const openEditTask = useCallback((t: Task) => {
    setTForm({
      title: t.title, status: t.status, priority: t.priority ?? '',
      due_date: t.due_date ?? '', assigned_to: t.assigned_to ?? '',
    })
    setTError(''); setEditingT(t); setShowTModal(true)
  }, [])

  const handleSaveTask = useCallback(async () => {
    if (!tForm.title.trim()) { setTError('El título es obligatorio'); return }
    if (!selected) return
    setTSaving(true); setTError('')
    const client  = getSB()
    const payload = {
      project_id:      selected.id,
      organization_id: orgId,
      title:           tForm.title.trim(),
      status:          tForm.status,
      priority:        tForm.priority  || null,
      due_date:        tForm.due_date  || null,
      assigned_to:     tForm.assigned_to || null,
      completed_at:    tForm.status === 'done' ? new Date().toISOString() : null,
    }

    if (editingT) {
      const { data, error: e } = await client.from('tasks')
        .update(payload).eq('id', editingT.id).select().single()
      if (e) { setTError(e.message); setTSaving(false); return }
      setTasks(p => p.map(t => t.id === editingT.id ? data : t))
    } else {
      const { data, error: e } = await client.from('tasks')
        .insert({ ...payload, created_by: currentUserId }).select().single()
      if (e) { setTError(e.message); setTSaving(false); return }
      setTasks(p => [data, ...p])
    }
    setTSaving(false); setShowTModal(false)
  }, [tForm, editingT, selected, orgId, currentUserId])

  const handleDeleteTask = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return
    await getSB().from('tasks').delete().eq('id', id)
    setTasks(p => p.filter(t => t.id !== id))
  }, [])

  const quickStatusTask = useCallback(async (task: Task, newStatus: string) => {
    const client = getSB()
    const update: Partial<Task> & { completed_at?: string | null } = {
      status: newStatus,
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
    }
    await client.from('tasks').update(update).eq('id', task.id)
    setTasks(p => p.map(t => t.id === task.id ? { ...t, ...update } : t))
  }, [])

  const setP = (k: string, v: string) => setPForm(p => ({ ...p, [k]: v }))
  const setT = (k: string, v: string) => setTForm(p => ({ ...p, [k]: v }))

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-slate-50 dark:bg-[#1a2030] flex-col md:flex-row">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-full md:w-64 md:shrink-0 bg-white dark:bg-[#1e2535] border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/[0.08] flex flex-col order-2 md:order-1">
        <div className="p-3 md:p-5 border-b border-slate-100 dark:border-white/[0.05]">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 md:mb-4">Proyectos</h2>
          <div className="grid grid-cols-2 gap-2 mb-2 md:mb-3">
            <Kpi label="Total"    value={kpis.total}    color="bg-slate-50 dark:bg-[#1a2030]" textColor="text-slate-900 dark:text-slate-50" />
            <Kpi label="Activos"  value={kpis.active}   color="bg-emerald-50 dark:bg-emerald-900/20" textColor="text-emerald-700 dark:text-emerald-400" labelColor="text-emerald-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Listos"   value={kpis.completed} color="bg-blue-50 dark:bg-blue-900/20" textColor="text-blue-700 dark:text-blue-400" labelColor="text-blue-500" />
            <Kpi label="Vencidos" value={kpis.overdue}   color={kpis.overdue ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-[#1a2030]'} textColor={kpis.overdue ? 'text-red-700 dark:text-red-400' : 'text-slate-400'} labelColor={kpis.overdue ? 'text-red-400' : 'text-slate-400'} />
          </div>
        </div>

        {/* Status filters */}
        <div className="p-3 md:p-4 border-b border-slate-100 dark:border-white/[0.05]">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Filtrar</p>
          <div className="space-y-1">
            <button onClick={() => setFilterSt('all')}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filterSt === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 dark:bg-[#1a2030]'}`}>
              Todos
            </button>
            {PROJECT_STATUSES.map(s => (
              <button key={s.value} onClick={() => setFilterSt(s.value)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${filterSt === s.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 dark:bg-[#1a2030]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${filterSt === s.value ? 'bg-white dark:bg-[#1e2535]' : s.dot}`} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-3 md:p-4 border-t border-slate-100 dark:border-white/[0.05] space-y-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 dark:border-white/[0.08] overflow-hidden">
            <button onClick={() => setView('board')}
              className={`flex-1 text-xs py-1.5 transition-colors font-medium ${view === 'board' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 dark:bg-[#1a2030]'}`}>
              Tablero
            </button>
            <button onClick={() => setView('list')}
              className={`flex-1 text-xs py-1.5 transition-colors font-medium ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 dark:bg-[#1a2030]'}`}>
              Lista
            </button>
          </div>
          <button onClick={openCreateProject}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs md:text-sm font-medium py-2 md:py-2.5 rounded-lg transition-colors">
            + Nuevo proyecto
          </button>
        </div>
      </aside>

      {/* ── Center ────────────────────────────────────────────────────────── */}
      <main className={`flex flex-col overflow-hidden transition-all ${selected ? 'md:w-[480px] md:shrink-0' : 'flex-1'} order-1 md:order-2`}>
        {view === 'board' ? (
          // ── Kanban Board ──────────────────────────────────────────────────
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 md:gap-4 p-2 md:p-4 h-full min-h-full">
              {PROJECT_STATUSES.map(col => (
                <div key={col.value} className="w-64 md:w-72 shrink-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 dark:text-slate-300 uppercase tracking-wider">{col.label}</span>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#1a2030] rounded-full px-2 py-0.5">
                      {byStatus[col.value]?.length ?? 0}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {(byStatus[col.value] ?? []).map(p => (
                      <ProjectCard
                        key={p.id} project={p} goals={goals} profiles={profiles}
                        isActive={selected?.id === p.id}
                        onClick={() => setSelected(selected?.id === p.id ? null : p)}
                      />
                    ))}
                    {(byStatus[col.value] ?? []).length === 0 && (
                      <div className="border-2 border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl py-6 text-center text-xs text-slate-300">
                        Sin proyectos
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // ── List view ─────────────────────────────────────────────────────
          <div className="flex-1 overflow-y-auto">
            <div className="bg-white dark:bg-[#1e2535] border-b border-slate-200 dark:border-white/[0.08] px-3 md:px-5 py-3">
              <p className="text-xs md:text-sm text-slate-500">{filtered.length} proyectos</p>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map(p => {
                const prog = progress(p)
                const st   = statusInfo(p.status)
                const prio = prioInfo(p.priority)
                const isActive = selected?.id === p.id
                return (
                  <button key={p.id} onClick={() => setSelected(isActive ? null : p)}
                    className={`w-full text-left px-3 md:px-5 py-3 md:py-4 hover:bg-slate-50 dark:bg-[#1a2030] transition-colors ${isActive ? 'bg-slate-50 dark:bg-[#1a2030] border-l-2 border-slate-800' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color ?? '#6366f1' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100 truncate">{p.title}</p>
                          <span className={`text-xs shrink-0 ${prio.color}`}>{prio.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <ProgressBar value={prog} color={p.color ?? '#6366f1'} />
                          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{prog}%</span>
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── Right: project detail ─────────────────────────────────────────── */}
      {selected && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#1e2535] border-t md:border-t-0 md:border-l border-slate-200 dark:border-white/[0.08] order-3">
          <ProjectDetail
            project={selected}
            tasks={selectedTasks}
            goals={goals}
            profiles={profiles}
            onEdit={() => openEditProject(selected)}
            onDelete={() => handleDeleteProject(selected.id)}
            onClose={() => setSelected(null)}
            onAddTask={openCreateTask}
            onEditTask={openEditTask}
            onDeleteTask={handleDeleteTask}
            onQuickStatus={quickStatusTask}
          />
        </div>
      )}

      {/* ── Project Modal ─────────────────────────────────────────────────── */}
      {showPModal && (
        <Modal title={editingP ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={() => setShowPModal(false)}>
          <div className="space-y-4">
            <Field label="Título *">
              <Input value={pForm.title} onChange={v => setP('title', v)} placeholder="Landing pages de materiales" />
            </Field>
            <Field label="Descripción">
              <Textarea value={pForm.description} onChange={v => setP('description', v)} placeholder="Contexto del proyecto..." />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Estado">
                <Select value={pForm.status} onChange={v => setP('status', v)}
                  options={PROJECT_STATUSES.map(s => ({ value: s.value, label: s.label }))} />
              </Field>
              <Field label="Prioridad">
                <Select value={pForm.priority} onChange={v => setP('priority', v)}
                  options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Impacto">
                <Select value={pForm.impact_level} onChange={v => setP('impact_level', v)}
                  options={IMPACTS.map(i => ({ value: i.value, label: i.label }))} />
              </Field>
              <Field label="Objetivo vinculado">
                <Select value={pForm.goal_id} onChange={v => setP('goal_id', v)}
                  options={[{ value: '', label: 'Sin objetivo' }, ...goals.map(g => ({ value: g.id, label: g.title }))]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Métrica clave">
                <Input value={pForm.metric_key} onChange={v => setP('metric_key', v)} placeholder="trafico_seo" />
              </Field>
              <Field label="Impacto esperado">
                <Input value={pForm.expected_impact} onChange={v => setP('expected_impact', v)} placeholder="200" type="number" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Fecha inicio">
                <Input value={pForm.start_date} onChange={v => setP('start_date', v)} type="date" />
              </Field>
              <Field label="Fecha límite">
                <Input value={pForm.due_date} onChange={v => setP('due_date', v)} type="date" />
              </Field>
            </div>

            <Field label="Responsable">
              <Select value={pForm.owner_id} onChange={v => setP('owner_id', v)}
                options={[{ value: '', label: 'Sin asignar' }, ...profiles.map(p => ({ value: p.id, label: p.full_name ?? p.email ?? '' }))]} />
            </Field>

            {/* Color picker */}
            <Field label="Color del proyecto">
              <div className="flex gap-2 flex-wrap">
                {PROJECT_COLORS.map(c => (
                  <button key={c} onClick={() => setP('color', c)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${pForm.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </Field>

            <Field label="Notas">
              <Textarea value={pForm.notes} onChange={v => setP('notes', v)} placeholder="Notas del proyecto..." />
            </Field>
            {pError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{pError}</p>}
          </div>
          <ModalFooter onCancel={() => setShowPModal(false)} onSave={handleSaveProject}
            saving={pSaving} label={editingP ? 'Guardar cambios' : 'Crear proyecto'} />
        </Modal>
      )}

      {/* ── Task Modal ────────────────────────────────────────────────────── */}
      {showTModal && (
        <Modal title={editingT ? 'Editar tarea' : 'Nueva tarea'} onClose={() => setShowTModal(false)}>
          <div className="space-y-4">
            <Field label="Título *">
              <Input value={tForm.title} onChange={v => setT('title', v)} placeholder="Descripción de la tarea" />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Estado">
                <Select value={tForm.status} onChange={v => setT('status', v)}
                  options={TASK_STATUSES.map(s => ({ value: s, label: TASK_STATUS_LABELS[s] }))} />
              </Field>
              <Field label="Prioridad">
                <Select value={tForm.priority} onChange={v => setT('priority', v)}
                  options={[{ value: '', label: 'Sin prioridad' }, ...PRIORITIES.map(p => ({ value: p.value, label: p.label }))]} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Fecha límite">
                <Input value={tForm.due_date} onChange={v => setT('due_date', v)} type="date" />
              </Field>
              <Field label="Asignado a">
                <Select value={tForm.assigned_to} onChange={v => setT('assigned_to', v)}
                  options={[{ value: '', label: 'Sin asignar' }, ...profiles.map(p => ({ value: p.id, label: p.full_name ?? p.email ?? '' }))]} />
              </Field>
            </div>
            {tError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{tError}</p>}
          </div>
          <ModalFooter onCancel={() => setShowTModal(false)} onSave={handleSaveTask}
            saving={tSaving} label={editingT ? 'Guardar tarea' : 'Crear tarea'} />
        </Modal>
      )}
    </div>
  )
}

// ─── Project Card (kanban) ────────────────────────────────────────────────────

function ProjectCard({ project: p, goals, profiles, isActive, onClick }: {
  project: Project; goals: Goal[]; profiles: Profile[]
  isActive: boolean; onClick: () => void
}) {
  const prog  = progress(p)
  const st    = statusInfo(p.status)
  const prio  = prioInfo(p.priority)
  const goal  = goals.find(g => g.id === p.goal_id)
  const owner = profiles.find(x => x.id === p.owner_id)

  return (
    <div onClick={onClick}
      className={`bg-white dark:bg-[#1e2535] rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${isActive ? 'border-slate-800 shadow-md' : 'border-slate-200 dark:border-white/[0.08]'}`}>
      <div className="flex items-start gap-2 mb-3">
        <div className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: p.color ?? '#6366f1' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-100 leading-snug">{p.title}</p>
          {goal && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">↗ {goal.title}</p>}
        </div>
      </div>

      <ProgressBar value={prog} color={p.color ?? '#6366f1'} />

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-xs text-slate-400">{prog}% · {p.tasks_completed}/{p.tasks_total} tareas</span>
        {p.due_date && (
          <span className={`text-xs ${isOverdue(p.due_date) && p.status !== 'completed' ? 'text-red-500' : 'text-slate-400'}`}>
            {fmtDate(p.due_date)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs font-medium ${prio.color}`}>{prio.label}</span>
        {owner && (
          <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
            {(owner.full_name || owner.email || 'U')[0].toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Project Detail Panel ─────────────────────────────────────────────────────

function ProjectDetail({
  project: p, tasks, goals, profiles,
  onEdit, onDelete, onClose, onAddTask, onEditTask, onDeleteTask, onQuickStatus,
}: {
  project: Project; tasks: Task[]; goals: Goal[]; profiles: Profile[]
  onEdit: () => void; onDelete: () => void; onClose: () => void
  onAddTask: () => void
  onEditTask: (t: Task) => void
  onDeleteTask: (id: string) => void
  onQuickStatus: (t: Task, s: string) => void
}) {
  const prog  = progress(p)
  const st    = statusInfo(p.status)
  const prio  = prioInfo(p.priority)
  const goal  = goals.find(g => g.id === p.goal_id)
  const owner = profiles.find(x => x.id === p.owner_id)

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {}
    TASK_STATUSES.forEach(s => { map[s] = [] })
    tasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [tasks])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.05]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: p.color ?? '#6366f1' }} />
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-slate-50 dark:text-white text-lg leading-tight truncate">{p.title}</h3>
              {goal && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">↗ {goal.title}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="text-xs border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 dark:text-slate-300 hover:bg-slate-50 dark:bg-[#1a2030]">Editar</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress + badges */}
        <div className="bg-slate-50 dark:bg-[#1a2030] rounded-xl p-4">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Progreso</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">{prog}%</p>
            </div>
            <p className="text-sm text-slate-500">{p.tasks_completed} / {p.tasks_total} tareas</p>
          </div>
          <div className="w-full h-2.5 bg-slate-200 dark:bg-[#2a3448] rounded-full overflow-hidden">
            <div className="h-2.5 rounded-full transition-all duration-700"
              style={{ width: `${prog}%`, backgroundColor: p.color ?? '#6366f1' }} />
          </div>
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
          <span className={`text-xs font-medium ${prio.color}`}>{prio.label}</span>
          {p.due_date && (
            <span className={`text-xs px-2.5 py-1 rounded-full ${isOverdue(p.due_date) && p.status !== 'completed' ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-slate-100 dark:bg-[#1a2030] text-slate-500'}`}>
              Vence {fmtDate(p.due_date)}
            </span>
          )}
          {owner && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1a2030] text-slate-500">
              {owner.full_name ?? owner.email}
            </span>
          )}
        </div>
      </div>

      {/* Tasks section */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tareas</p>
          <button onClick={onAddTask}
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            + Tarea
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Sin tareas</p>
            <p className="text-xs text-slate-400">Agrega la primera tarea del proyecto</p>
          </div>
        ) : (
          <div className="space-y-4">
            {TASK_STATUSES.map(status => {
              const list = tasksByStatus[status] ?? []
              if (list.length === 0) return null
              return (
                <div key={status}>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    {TASK_STATUS_LABELS[status]} ({list.length})
                  </p>
                  <div className="space-y-1.5">
                    {list.map(task => {
                      const assignee = profiles.find(x => x.id === task.assigned_to)
                      const isDone   = task.status === 'done'
                      return (
                        <div key={task.id}
                          className="flex items-center gap-3 p-3 border border-slate-100 dark:border-white/[0.05] rounded-xl hover:border-slate-200 dark:border-white/[0.08] transition-colors group">
                          {/* Checkbox */}
                          <button onClick={() => onQuickStatus(task, isDone ? 'todo' : 'done')}
                            className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors flex items-center justify-center ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-white/[0.1] hover:border-emerald-400'}`}>
                            {isDone && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${isDone ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                              {task.title}
                            </p>
                            {task.due_date && (
                              <p className={`text-xs mt-0.5 ${isOverdue(task.due_date) && !isDone ? 'text-red-500' : 'text-slate-400'}`}>
                                {fmtDate(task.due_date)}
                              </p>
                            )}
                          </div>

                          {assignee && (
                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {(assignee.full_name || assignee.email || 'U')[0].toUpperCase()}
                            </div>
                          )}

                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEditTask(task)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:bg-[#1a2030]">Editar</button>
                            <button onClick={() => onDeleteTask(task.id)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 dark:bg-red-900/20">×</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Meta info */}
        {(p.description || p.notes) && (
          <div className="mt-6 space-y-4">
            {p.description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Descripción</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-300 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] rounded-xl p-3">{p.description}</p>
              </div>
            )}
            {p.notes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Notas</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-300 bg-slate-50 dark:bg-[#1a2030] dark:bg-[#0d1117] rounded-xl p-3">{p.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-white/[0.05] px-6 py-3 flex justify-between items-center">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Eliminar proyecto</button>
        <p className="text-xs text-slate-400">Creado {fmtDate(p.created_at)}</p>
      </div>
    </div>
  )
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Kpi({ label, value, color, textColor, labelColor = 'text-slate-400' }: {
  label: string; value: number; color: string; textColor: string; labelColor?: string
}) {
  return (
    <div className={`${color} rounded-xl p-3`}>
      <p className={`text-xs ${labelColor}`}>{label}</p>
      <p className={`text-xl font-bold ${textColor}`}>{value}</p>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-slate-50">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300">
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
    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/[0.05] mt-4">
      <button onClick={onCancel} className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-300 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:bg-[#1a2030]">Cancelar</button>
      <button onClick={onSave} disabled={saving}
        className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
        {saving ? 'Guardando...' : label}
      </button>
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
      className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700" />
  )
}
function Textarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder}
      className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 resize-none" />
  )
}
function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 bg-white dark:bg-[#1e2535]">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

