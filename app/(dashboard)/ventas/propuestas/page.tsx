import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PropuestasClient from '@/components/ventas/PropuestasClient'

export default async function PropuestasPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Parallel queries
  const [
    { data: proposals },
    { data: proposalItems },
    { data: contacts },
    { data: clients },
    { data: profiles },
    { data: organization },
  ] = await Promise.all([
    supabase
      .from('proposals')
      .select('id, contact_id, client_id, assigned_to, title, status, module_label, subtotal, tax_rate, tax_amount, total, notes, terms_and_conditions, pdf_url, created_by, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('proposal_items')
      .select('id, proposal_id, concept, description, quantity, unit_price, total, sort_order')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('contacts')
      .select('id, full_name, email, company')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true }),

    supabase
      .from('clients')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true }),

    supabase
      .from('profiles')
      .select('id, full_name, email'),

    supabase
      .from('organizations')
      .select('name, logo_url')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  // Signed URL for org logo (same as layout.tsx)
  let logoSignedUrl: string | null = null
  if (organization?.logo_url) {
    const { data } = await supabase.storage
      .from('org-logos')
      .createSignedUrl(organization.logo_url.replace(/^.*org-logos\//, ''), 3600)
    logoSignedUrl = data?.signedUrl ?? null
  }

  return (
    <PropuestasClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialProposals={proposals ?? []}
      initialItems={proposalItems ?? []}
      contacts={contacts ?? []}
      clients={clients ?? []}
      profiles={profiles ?? []}
      orgBranding={{ name: organization?.name ?? null, logo_url: logoSignedUrl }}
    />
  )
}
