import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ProyectosClient from '@/components/proyectos/ProyectosClient'

export default async function ProyectosPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organization_id, role')
    .eq('user_id', user.id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  if (!membership) redirect('/crear-organizacion')
  const orgId = membership.organization_id

  const [
    { data: projects },
    { data: goals },
    { data: tasks },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, organization_id, goal_id, title, description, color, status, priority, impact_level, metric_key, metric_unit, expected_impact, start_date, due_date, completed_at, tasks_total, tasks_completed, owner_id, notes, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('goals')
      .select('id, title, category, status')
      .eq('organization_id', orgId)
      .eq('status', 'active'),

    supabase
      .from('tasks')
      .select('id, project_id, title, status, priority, due_date, assigned_to, completed_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

    supabase.from('profiles').select('id, full_name, email'),
  ])

  return (
    <ProyectosClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialProjects={projects ?? []}
      goals={goals ?? []}
      initialTasks={tasks ?? []}
      profiles={profiles ?? []}
    />
  )
}
