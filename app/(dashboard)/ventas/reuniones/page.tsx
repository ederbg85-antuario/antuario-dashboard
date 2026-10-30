import {ANTUARIO_ORG_ID} from '@/lib/internal-platform'
import {createServerClient} from '@supabase/ssr'
import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import AgendaClient from '@/components/ventas/AgendaClient'
import type {Meeting} from '@/lib/commercial-calendar'
export const dynamic='force-dynamic'

export default async function ReunionesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    .from('memberships').select('organization_id').eq('user_id', user.id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).eq('organization_id', ANTUARIO_ORG_ID).maybeSingle()
  if (!membership) redirect('/sin-acceso')

  const { data,error } = await supabase
    .from('contacts')
    .select('id, full_name, company, email, whatsapp, phone, meeting_at, meeting_link, meeting_status, client_role, lead_archetype, end_brand, opportunity')
    .eq('organization_id', membership.organization_id)
    .not('meeting_at', 'is', null)
    .order('meeting_at', { ascending: true })

  return <AgendaClient meetings={(data??[]) as Meeting[]} asOf={new Date().toISOString()} error={!!error}/>
}
