// ============================================================
// app/(dashboard)/marketing/seo/page.tsx
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SEOClient from '@/components/marketing/SEOClient'
import { getDateFilterFromCookie } from '@/lib/date-filter'

export default async function SEOPage() {
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
    { data: topKeywords },
    { data: topPages },
    { data: opportunityKeywords },
  ] = await Promise.all([
    supabase.from('marketing_connections')
      .select('id, status, external_name, last_sync_at')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('status', 'active').order('created_at', { ascending: false }).limit(1)
      .maybeSingle(),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value, date')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'global')
      .gte('date', from).lte('date', to),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'global')
      .gte('date', pFrom).lte('date', pTo),

    supabase.from('marketing_daily_summary')
      .select('date, metric_key, daily_total')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .gte('date', from).lte('date', to)
      .in('metric_key', ['clicks', 'impressions'])
      .order('date', { ascending: true }),

    // Top keywords del período seleccionado
    supabase.from('marketing_metrics_values')
      .select('dimension_value, value, metric_key')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'keyword')
      .gte('date', from).lte('date', to)
      .order('value', { ascending: false }).limit(100),

    // Top páginas del período seleccionado
    supabase.from('marketing_metrics_values')
      .select('dimension_value, value, metric_key')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'page')
      .gte('date', from).lte('date', to)
      .order('value', { ascending: false }).limit(100),

    // Keywords oportunidad del período seleccionado
    supabase.from('marketing_metrics_values')
      .select('dimension_value, value, metric_key')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'keyword')
      .eq('metric_key', 'impressions')
      .gte('value', 200)
      .gte('date', from).lte('date', to)
      .order('value', { ascending: false }).limit(50),
  ])

  return (
    <SEOClient
      connection={connection}
      globalMetrics={globalMetrics ?? []}
      prevMetrics={prevMetrics ?? []}
      trendData={trendData ?? []}
      topKeywords={topKeywords ?? []}
      topPages={topPages ?? []}
      opportunityKeywords={opportunityKeywords ?? []}
      dateFilter={dateFilter}
    />
  )
}
