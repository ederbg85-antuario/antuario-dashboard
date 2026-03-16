import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import IntegracionesClient from '@/components/configuracion/IntegracionesClient'

export default async function IntegracionesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/crear-organizacion')
  const orgId = membership.organization_id

  const { data: connections } = await supabase
    .from('marketing_connections')
    .select('id, source, status, external_name, external_id, last_sync_at, last_error, connected_by, created_at, token_expires_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  const { data: syncJobs } = await supabase
    .from('marketing_sync_jobs')
    .select('id, source, status, date_from, date_to, records_inserted, started_at, completed_at, error_message')
    .eq('organization_id', orgId)
    .order('started_at', { ascending: false })
    .limit(20)

  // ── Chatwoot connection (service_role para leer sin exponer token) ──────────
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: chatwootConn } = await admin
    .from('chatwoot_connections')
    .select('id, base_url, account_id, connected_at')
    .eq('organization_id', orgId)
    .maybeSingle()

  return (
    <IntegracionesClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialConnections={connections ?? []}
      syncJobs={syncJobs ?? []}
      chatwootConnection={chatwootConn ?? null}
    />
  )
}
