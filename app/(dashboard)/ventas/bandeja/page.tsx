import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { redirect }           from 'next/navigation'
import BandejaClient          from '@/components/ventas/BandejaClient'

export default async function BandejaPage() {
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

  // Verificar si Chatwoot está configurado (sin exponer el token)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: chatwootConn } = await admin
    .from('chatwoot_connections')
    .select('id, base_url, account_id')
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  return (
    <BandejaClient
      orgId={membership.organization_id}
      userRole={membership.role}
      isConfigured={!!chatwootConn}
      chatwootBaseUrl={chatwootConn?.base_url ?? null}
    />
  )
}
