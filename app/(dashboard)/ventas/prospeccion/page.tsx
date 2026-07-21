import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ProspeccionClient from '@/components/ventas/ProspeccionClient'

// Datos siempre frescos: la cartera de prospección cambia con cada toque.
export const dynamic = 'force-dynamic'

export default async function ProspeccionPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
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

  const { data: prospects } = await supabase
    .from('prospects')
    .select(`
      id, full_name, title, seniority, email, email_status, phone, linkedin_url,
      company, company_domain, industry, employees_range, company_city,
      icp_segment, fit_score, stage, assigned_seller, channel, touches,
      last_contacted_at, next_action_at, next_action, notes, contact_id,
      source, created_at, updated_at
    `)
    .eq('organization_id', orgId)
    .order('fit_score', { ascending: false })
    .order('created_at', { ascending: false })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')

  return (
    <ProspeccionClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialProspects={prospects ?? []}
      profiles={profiles ?? []}
    />
  )
}
