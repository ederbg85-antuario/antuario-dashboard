import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import EmpresasClient from '@/components/ventas/EmpresasClient'

export default async function EmpresasPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
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
    { data: companies },
    { data: contacts },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id, organization_id, name, industry, website, phone, email, city, country, notes, assigned_to, created_by, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('name', { ascending: true }),

    supabase
      .from('contacts')
      .select('id, full_name, email, phone, company_id, position, contact_type, status')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true }),

    supabase
      .from('profiles')
      .select('id, full_name, email'),
  ])

  return (
    <EmpresasClient
      orgId={orgId}
      currentUserId={user.id}
      currentUserRole={membership.role}
      initialCompanies={companies ?? []}
      contacts={contacts ?? []}
      profiles={profiles ?? []}
    />
  )
}
