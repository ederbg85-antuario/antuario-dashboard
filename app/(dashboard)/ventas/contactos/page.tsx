import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ContactosClient from '@/components/ventas/ContactosClient'
import { getDateFilterFromCookie } from '@/lib/date-filter'

export default async function ContactosPage() {
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

  // ── Filtro de fechas global ────────────────────────────────
  const dateFilter = await getDateFilterFromCookie()
  const { from, to } = dateFilter

  // Fetch contacts filtrados por período
  const { data: contacts } = await supabase
    .from('contacts')
    .select(`
      id,
      full_name,
      email,
      phone,
      company,
      pipeline_stage,
      status,
      contact_type,
      source,
      source_campaign,
      source_medium,
      whatsapp,
      linkedin,
      primary_channel,
      notes,
      assigned_to,
      created_at,
      updated_at,
      created_by
    `)
    .eq('organization_id', orgId)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })

  // Fetch profiles for assigned_to display
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')

  // Fetch contact notes
  const contactIds = (contacts ?? []).map(c => c.id)
  const { data: notes } = contactIds.length > 0
    ? await supabase
        .from('contact_notes')
        .select('id, contact_id, content, created_at, created_by')
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Fetch contact channels
  const { data: channels } = contactIds.length > 0
    ? await supabase
        .from('contact_channels')
        .select('id, contact_id, channel_type, value, is_primary')
        .in('contact_id', contactIds)
    : { data: [] }

  // Fetch proposals count per contact
  const { data: proposals } = contactIds.length > 0
    ? await supabase
        .from('proposals')
        .select('id, contact_id, status, total, title, created_at')
        .in('contact_id', contactIds)
    : { data: [] }

  // Fetch orders count per contact
  const { data: orders } = contactIds.length > 0
    ? await supabase
        .from('orders')
        .select('id, contact_id, status, total, amount_paid, title, created_at')
        .in('contact_id', contactIds)
    : { data: [] }

  // Fetch contact files
  const { data: contactFiles } = contactIds.length > 0
    ? await supabase
        .from('contact_files')
        .select('id, contact_id, organization_id, file_name, file_path, file_size, file_type, uploaded_by, created_at')
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <ContactosClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialContacts={contacts ?? []}
      profiles={profiles ?? []}
      initialNotes={notes ?? []}
      initialChannels={channels ?? []}
      initialProposals={proposals ?? []}
      initialOrders={orders ?? []}
      contactFiles={contactFiles ?? []}
    />
  )
}
