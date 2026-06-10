import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import FormulariosClient from '@/components/ventas/FormulariosClient'

export default async function FormulariosPage() {
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

  // Todos los leads provenientes del formulario web (sin filtro de fecha, para
  // que nunca se "escondan" envíos recientes o antiguos).
  const { data: formularios } = await supabase
    .from('contacts')
    .select(`
      id,
      full_name,
      email,
      phone,
      whatsapp,
      company,
      contact_type,
      source,
      notes,
      created_at,
      assigned_to
    `)
    .eq('organization_id', orgId)
    .eq('source', 'formulario-web')
    .order('created_at', { ascending: false })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')

  return (
    <FormulariosClient
      formularios={formularios ?? []}
      profiles={profiles ?? []}
    />
  )
}
