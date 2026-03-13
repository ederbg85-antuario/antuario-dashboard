// ============================================================
// app/(dashboard)/marketing/gmb/page.tsx
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import GMBClient from '@/components/marketing/GMBClient'

export default async function GMBPage() {
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
    .from('memberships').select('organization_id')
    .eq('user_id', user.id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  if (!membership) redirect('/crear-organizacion')
  const orgId = membership.organization_id

  const today = new Date()
  const d30   = new Date(today); d30.setDate(d30.getDate() - 30)
  const d60   = new Date(today); d60.setDate(d60.getDate() - 60)
  const d6m   = new Date(today); d6m.setMonth(d6m.getMonth() - 6)
  const fmt   = (d: Date) => d.toISOString().split('T')[0]

  const [
    { data: connection },
    { data: globalMetrics },
    { data: prevMetrics },
    { data: trendData },
  ] = await Promise.all([
    supabase.from('marketing_connections')
      .select('id, status, external_name, last_sync_at')
      .eq('organization_id', orgId).eq('source', 'google_business_profile')
      .maybeSingle(),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value, date')
      .eq('organization_id', orgId).eq('source', 'google_business_profile')
      .eq('dimension_type', 'global')
      .gte('date', fmt(d30)).lte('date', fmt(today)),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value')
      .eq('organization_id', orgId).eq('source', 'google_business_profile')
      .eq('dimension_type', 'global')
      .gte('date', fmt(d60)).lt('date', fmt(d30)),

    supabase.from('marketing_daily_summary')
      .select('date, metric_key, daily_total')
      .eq('organization_id', orgId).eq('source', 'google_business_profile')
      .gte('date', fmt(d6m))
      .order('date', { ascending: true }),
  ])

  return (
    <GMBClient
      connection={connection}
      globalMetrics={globalMetrics ?? []}
      prevMetrics={prevMetrics ?? []}
      trendData={trendData ?? []}
    />
  )
}
