import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { redirect }           from 'next/navigation'
import BandejaClient          from '@/components/ventas/BandejaClient'
import { isDemoUser }         from '@/lib/demo-data'

export default async function BandejaPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  // Demo user: always enable the inbox with simulated data
  const isDemo = isDemoUser(user.id)

  // La mensajería está activa si las env vars del sistema están presentes
  const chatwootEnabled = isDemo || !!(
    process.env.CHATWOOT_BASE_URL &&
    process.env.CHATWOOT_ACCOUNT_ID &&
    process.env.CHATWOOT_API_TOKEN
  )

  // Verificar si esta organización tiene su inbox asignado (multi-tenant)
  let inboxConfigured = isDemo
  if (!isDemo && chatwootEnabled) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: orgData } = await admin
      .from('organizations')
      .select('chatwoot_inbox_id')
      .eq('id', membership.organization_id)
      .maybeSingle()
    inboxConfigured = !!orgData?.chatwoot_inbox_id
  }

  return (
    <BandejaClient
      orgId={membership.organization_id}
      userRole={membership.role}
      chatwootEnabled={chatwootEnabled}
      inboxConfigured={inboxConfigured}
      chatwootBaseUrl={process.env.CHATWOOT_BASE_URL ?? null}
    />
  )
}
