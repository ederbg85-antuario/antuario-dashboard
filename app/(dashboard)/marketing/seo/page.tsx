// ============================================================
// app/(dashboard)/marketing/seo/page.tsx
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SEOClient from '@/components/marketing/SEOClient'

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
    { data: topKeywords },
    { data: topPages },
    { data: opportunityKeywords },
  ] = await Promise.all([
    supabase.from('marketing_connections')
      .select('id, status, external_name, last_sync_at')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .maybeSingle(),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value, date')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'global')
      .gte('date', fmt(d30)).lte('date', fmt(today)),

    supabase.from('marketing_metrics_values')
      .select('metric_key, value')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'global')
      .gte('date', fmt(d60)).lt('date', fmt(d30)),

    supabase.from('marketing_daily_summary')
      .select('date, metric_key, daily_total')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .gte('date', fmt(d6m))
      .in('metric_key', ['clicks', 'impressions'])
      .order('date', { ascending: true }),

    // Top 20 keywords por clics
    supabase.from('marketing_metrics_values')
      .select('dimension_value, value, metric_key')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'keyword')
      .gte('date', fmt(d30)).lte('date', fmt(today))
      .order('value', { ascending: false }).limit(100),

    // Top páginas
    supabase.from('marketing_metrics_values')
      .select('dimension_value, value, metric_key')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'page')
      .gte('date', fmt(d30)).lte('date', fmt(today))
      .order('value', { ascending: false }).limit(100),

    // Keywords con muchas impresiones y CTR bajo (oportunidades)
    supabase.from('marketing_metrics_values')
      .select('dimension_value, value, metric_key')
      .eq('organization_id', orgId).eq('source', 'search_console')
      .eq('dimension_type', 'keyword')
      .eq('metric_key', 'impressions')
      .gte('value', 200)
      .gte('date', fmt(d30)).lte('date', fmt(today))
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
    />
  )
}
