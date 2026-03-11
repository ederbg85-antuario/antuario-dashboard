import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MarketingSubNav from '@/components/marketing/MarketingSubNav'

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/crear-organizacion')

  // Qué fuentes tiene conectadas esta org
  const { data: connections } = await supabase
    .from('marketing_connections')
    .select('source, status, last_sync_at, external_name')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')

  const connectedSources = (connections ?? []).map(c => c.source)

  return (
    <div className="flex flex-col h-full min-h-screen bg-slate-50">
      <MarketingSubNav connectedSources={connectedSources} />
      <div className="flex-1 pt-12">
        {children}
      </div>
    </div>
  )
}
