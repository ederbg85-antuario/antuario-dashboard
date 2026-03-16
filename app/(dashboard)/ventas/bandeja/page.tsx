import { createServerClient } from '@supabase/ssr'
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

  // La mensajería está configurada si las env vars están presentes (sin tocar la DB)
  const isConfigured = !!(
    process.env.CHATWOOT_BASE_URL &&
    process.env.CHATWOOT_ACCOUNT_ID &&
    process.env.CHATWOOT_API_TOKEN
  )

  return (
    <BandejaClient
      orgId={membership.organization_id}
      userRole={membership.role}
      isConfigured={isConfigured}
      chatwootBaseUrl={process.env.CHATWOOT_BASE_URL ?? null}
    />
  )
}
