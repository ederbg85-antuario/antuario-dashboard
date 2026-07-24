import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CrmClient from '@/components/ventas/CrmClient'

// El CRM cambia con cada toque/etapa: siempre fresco.
export const dynamic = 'force-dynamic'

export default async function CrmPage() {
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

  const [{ data: prospects }, { data: contacts }, { data: proposals }, { data: profiles }] = await Promise.all([
    supabase
      .from('prospects')
      .select('id, full_name, company, title, email, phone, icp_segment, stage, deal_path, assigned_to, touches, next_action_at, next_action, contact_id, updated_at, created_at')
      .eq('organization_id', orgId),
    supabase
      .from('contacts')
      .select('id, full_name, company, position, email, phone, contact_type, source, assigned_to, meeting_at, updated_at, created_at')
      .eq('organization_id', orgId),
    supabase
      .from('proposals')
      .select('id, title, stage, total, amount, contact_id')
      .eq('organization_id', orgId),
    supabase.from('profiles').select('id, full_name, email'),
  ])

  return (
    <CrmClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      prospects={prospects ?? []}
      contacts={contacts ?? []}
      proposals={proposals ?? []}
      profiles={profiles ?? []}
    />
  )
}
