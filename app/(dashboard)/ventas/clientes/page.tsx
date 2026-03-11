import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ClientesClient from '@/components/ventas/ClientesClient'

export default async function ClientesPage() {
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

  const [
    { data: clients },
    { data: contacts },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select(`
        id, name, organization_id,
        contact_id, assigned_to, created_by,
        total_revenue, total_purchases, average_ticket,
        last_purchase_at, contracted_services,
        created_at, updated_at
      `)
      .eq('organization_id', orgId)
      .order('total_revenue', { ascending: false }),

    supabase
      .from('contacts')
      .select('id, full_name, email, company, phone, whatsapp')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true }),

    supabase
      .from('profiles')
      .select('id, full_name, email'),
  ])

  // Fetch orders and proposals linked to these clients
  const clientIds = (clients ?? []).map(c => c.id)

  const [{ data: orders }, { data: proposals }] = await Promise.all([
    clientIds.length > 0
      ? supabase
          .from('orders')
          .select('id, client_id, contact_id, title, status, total, amount_paid, created_at')
          .in('client_id', clientIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),

    clientIds.length > 0
      ? supabase
          .from('proposals')
          .select('id, client_id, contact_id, title, status, total, created_at')
          .in('client_id', clientIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <ClientesClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialClients={clients ?? []}
      contacts={contacts ?? []}
      profiles={profiles ?? []}
      initialOrders={orders ?? []}
      initialProposals={proposals ?? []}
    />
  )
}
