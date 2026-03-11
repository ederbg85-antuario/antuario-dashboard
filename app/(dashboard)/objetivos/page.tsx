import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ObjetivosClient from '@/components/objetivos/ObjetivosClient'

export default async function ObjetivosPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const [{ data: goals }, { data: targets }, { data: profiles }] = await Promise.all([
    supabase
      .from('goals')
      .select('id, organization_id, title, description, category, metric_key, metric_unit, target_value, current_value, baseline_value, period, start_date, end_date, status, priority, owner_id, notes, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('goal_targets')
      .select('id, goal_id, organization_id, title, description, metric_key, metric_unit, target_value, current_value, baseline_value, weight, status, owner_id, sort_order, notes, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true }),

    supabase.from('profiles').select('id, full_name, email'),
  ])

  return (
    <ObjetivosClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialGoals={goals ?? []}
      initialTargets={targets ?? []}
      profiles={profiles ?? []}
    />
  )
}
