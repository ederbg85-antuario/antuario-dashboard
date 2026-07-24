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

  const [
    { data: prospects },
    { data: contacts },
    { data: proposals },
    { data: profiles },
    { data: activities },
    { data: templates },
  ] = await Promise.all([
    supabase
      .from('prospects')
      .select(`
        id, full_name, first_name, title, email, phone, linkedin_url, company, industry,
        company_city, company_phone, company_generic_email, icp_segment, fit_score, stage,
        deal_path, assigned_to, assigned_seller, channel, touches, last_contacted_at,
        next_action_at, next_action, need_note, disqualified_reason, recycle_at, notes,
        contact_id, updated_at, created_at
      `)
      .eq('organization_id', orgId)
      .order('fit_score', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('contacts')
      .select('id, full_name, company, position, email, phone, whatsapp, contact_type, source, assigned_to, meeting_at, meeting_link, notes, updated_at, created_at')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('proposals')
      .select('id, title, stage, total, amount, contact_id')
      .eq('organization_id', orgId),
    supabase.from('profiles').select('id, full_name, email'),
    supabase
      .from('prospect_activities')
      .select('id, prospect_id, type, channel, direction, outcome, body, created_by, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('message_templates')
      .select('id, name, channel, segment, step, subject, body, is_active, sort_order')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
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
      initialActivities={activities ?? []}
      templates={templates ?? []}
    />
  )
}
