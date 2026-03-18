import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PedidosClient from '@/components/ventas/PedidosClient'

export default async function PedidosPage() {
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

  // Org branding (logo + name) for PDF remisiones
  const { data: organization } = await supabase
    .from('organizations')
    .select('name, logo_url')
    .eq('id', orgId)
    .maybeSingle()

  let logoSignedUrl: string | null = null
  if (organization?.logo_url) {
    const { data } = await supabase.storage
      .from('org-logos')
      .createSignedUrl(organization.logo_url.replace(/^.*org-logos\//, ''), 3600)
    logoSignedUrl = data?.signedUrl ?? null
  }

  const orgBranding = {
    name: organization?.name ?? null,
    logo_url: logoSignedUrl,
  }

  const [
    { data: orders },
    { data: contacts },
    { data: clients },
    { data: profiles },
    { data: proposals },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, contact_id, client_id, proposal_id, title, status, total, amount_paid, balance, payment_method, notes, created_by, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),

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
      .from('proposals')
      .select('id, title, total, status')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
  ])

  // Fetch payments for all orders
  const orderIds = (orders ?? []).map(o => o.id)
  const { data: payments } = orderIds.length > 0
    ? await supabase
        .from('order_payments')
        .select('id, order_id, amount, payment_method, payment_date, notes, created_by, created_at')
        .in('order_id', orderIds)
        .order('payment_date', { ascending: false })
    : { data: [] }

  return (
    <PedidosClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialOrders={orders ?? []}
      initialPayments={payments ?? []}
      contacts={contacts ?? []}
      clients={clients ?? []}
      profiles={profiles ?? []}
      proposals={proposals ?? []}
      orgBranding={orgBranding}
    />
  )
}
