import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import FormulariosClient from '@/components/ventas/FormulariosClient'

// Siempre datos frescos: cada visita refleja los últimos formularios recibidos.
export const dynamic = 'force-dynamic'

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

  // Bitácora de TODOS los envíos del formulario web (incluye los de contactos
  // que ya existían). Sin filtro de fecha para no esconder nada.
  const { data: formularios } = await supabase
    .from('web_form_submissions')
    .select(`
      id,
      full_name,
      email,
      phone,
      company,
      interest,
      message,
      source_url,
      status,
      contact_id,
      created_at
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return (
    <FormulariosClient formularios={formularios ?? []} />
  )
}
