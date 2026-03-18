import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import VisionVentasClient from '@/components/ventas/VisionVentasClient'

export default async function VisionVentasPage() {
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
    { data: contacts },
    { data: proposals },
    { data: orders },
    { data: clients },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, contact_type, status, source, created_at')
      .eq('organization_id', orgId),

    supabase
      .from('proposals')
      .select('id, status, total, contact_id, created_at')
      .eq('organization_id', orgId),

    supabase
      .from('orders')
      .select('id, status, total, amount_paid, contact_id, created_at')
      .eq('organization_id', orgId),

    supabase
      .from('clients')
      .select('id, name, total_revenue, created_at')
      .eq('organization_id', orgId),

    supabase
      .from('order_payments')
      .select('id, amount, payment_date, created_at')
      .eq('organization_id', orgId),
  ])

  return (
    <VisionVentasClient
      contacts={contacts ?? []}
      proposals={proposals ?? []}
      orders={orders ?? []}
      clients={clients ?? []}
      payments={payments ?? []}
    />
  )
}
