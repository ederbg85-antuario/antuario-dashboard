// ============================================================
// app/(dashboard)/marketing/web/page.tsx
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import WebAnalyticsClient from '@/components/marketing/WebAnalyticsClient'
import { getDateFilterFromCookie } from '@/lib/date-filter'

export default async function WebPage() {
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
    .from('memberships').select('organization_id')
    .eq('user_id', user.id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  if (!membership) redirect('/crear-organizacion')
  const orgId = membership.organization_id

  // ── Filtro de fechas global ────────────────────────────────
  const dateFilter = await getDateFilterFromCookie()
  const { from, to } = dateFilter
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  const days = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)))
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days)
  const pFrom = fmt(prevFrom), pTo = fmt(prevTo)

  const [
    { data: connection },
    { data: globalMetrics },
    { data: prevMetrics },
    { data: trendData },
    { data: topPages },
    { data: channelData },
  ] = await Promise.all([
    supabase.from('marketing_connections')
      .select('id, status, external_name, last_sync_at')
      .eq('organization_id', orgId).eq('source', 'ga4')
      .eq('status', 'active').order('created_at', { ascending: false }).limit(1)
      .maybeSingle(),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value')
      .eq('organization_id', orgId).eq('source', 'ga4')
      .eq('dimension_type', 'global')
      .gte('date', from).lte('date', to),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value')
      .eq('organization_id', orgId).eq('source', 'ga4')
      .eq('dimension_type', 'global')
      .gte('date', pFrom).lte('date', pTo),

    supabase.from('marketing_daily_summary')
      .select('date, metric_key, daily_total')
      .eq('organization_id', orgId).eq('source', 'ga4')
      .gte('date', from).lte('date', to)
      .in('metric_key', ['sessions', 'conversions'])
      .order('date', { ascending: true }),

    supabase.from('marketing_metrics_values')
      .select('dimension_value, metric_key, value')
      .eq('organization_id', orgId).eq('source', 'ga4')
      .eq('dimension_type', 'page')
      .gte('date', from).lte('date', to)
      .order('value', { ascending: false }).limit(100),

    supabase.from('marketing_metrics_values')
      .select('dimension_value, metric_key, value')
      .eq('organization_id', orgId).eq('source', 'ga4')
      .eq('dimension_type', 'channel')
      .gte('date', from).lte('date', to),
  ])

  return (
    <WebAnalyticsClient
      connection={connection}
      globalMetrics={globalMetrics ?? []}
      prevMetrics={prevMetrics ?? []}
      trendData={trendData ?? []}
      topPages={topPages ?? []}
      channelData={channelData ?? []}
      dateFilter={dateFilter}
    />
  )
}


// ============================================================
// components/marketing/WebAnalyticsClient.tsx
// ============================================================
// (Se genera en archivo separado por Cowork)
