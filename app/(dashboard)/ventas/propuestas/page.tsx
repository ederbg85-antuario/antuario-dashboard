import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PropuestasClient from '@/components/ventas/PropuestasClient'

export default async function PropuestasPage() {
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

  // Las propuestas no se filtran por fecha: el pipeline de propuestas pendientes
  // debe verse completo sin importar cuándo se creó cada ficha.
  const [
    { data: proposals },
    { data: changes },
    { data: contacts },
    { data: profiles },
    { data: organization },
  ] = await Promise.all([
    supabase
      .from('proposals')
      .select('id, contact_id, client_id, assigned_to, title, stage, status, client_need, proposed_solution, objective, scope, amount, currency, notes, terms_and_conditions, pdf_url, presented_at, decided_at, source_channel, created_by, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false }),

    supabase
      .from('proposal_changes')
      .select('id, proposal_id, description, resolved, created_by, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('contacts')
      .select('id, full_name, email, phone, company')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true }),

    supabase
      .from('profiles')
      .select('id, full_name, email'),

    supabase
      .from('organizations')
      .select('name, logo_url')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  // Signed URL del logo de la organización (mismo patrón que layout.tsx)
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
      initialChanges={changes ?? []}
      contacts={contacts ?? []}
      profiles={profiles ?? []}
      orgBranding={{ name: organization?.name ?? null, logo_url: logoSignedUrl }}
    />
  )
}
