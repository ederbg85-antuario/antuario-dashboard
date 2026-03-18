// app/(dashboard)/ventas/leads-relevantes/page.tsx
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LeadsRelevantesClient from '@/components/ventas/LeadsRelevantesClient'

export default async function LeadsRelevantesPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
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

  // Only leads relevantes
  const { data: leads } = await supabase
    .from('contacts')
    .select('id, full_name, email, phone, company, status, source, source_campaign, assigned_to, whatsapp, created_at, updated_at')
    .eq('organization_id', orgId)
    .eq('contact_type', 'lead_relevant')
    .order('created_at', { ascending: false })

  const leadIds = (leads ?? []).map(l => l.id)

  const [{ data: proposals }, { data: notes }, { data: profiles }] = await Promise.all([
    leadIds.length > 0
      ? supabase
          .from('proposals')
          .select('id, contact_id, status, total, title, created_at')
          .in('contact_id', leadIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),

    leadIds.length > 0
      ? supabase
          .from('contact_notes')
          .select('id, contact_id, content, created_at')
          .in('contact_id', leadIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),

    supabase.from('profiles').select('id, full_name, email'),
  ])

  return (
    <LeadsRelevantesClient
      orgId={orgId}
      initialLeads={leads ?? []}
      initialProposals={proposals ?? []}
      initialNotes={notes ?? []}
      profiles={profiles ?? []}
    />
  )
}
