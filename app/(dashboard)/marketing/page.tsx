import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import VisionMarketingClient from '@/components/marketing/VisionMarketingClient'

export default async function MarketingPage() {
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

  // Rango: últimos 30 días vs 30 días anteriores
  const today    = new Date()
  const d30      = new Date(today); d30.setDate(d30.getDate() - 30)
  const d60      = new Date(today); d60.setDate(d60.getDate() - 60)
  const d6m      = new Date(today); d6m.setMonth(d6m.getMonth() - 6)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  const [
    { data: connections },
    { data: currentMetrics },
    { data: previousMetrics },
    { data: trendData },
  ] = await Promise.all([
    supabase
      .from('marketing_connections')
      .select('id, source, status, external_name, last_sync_at')
      .eq('organization_id', orgId),

    // Métricas del período actual (últimos 30 días)
    supabase
      .from('marketing_metrics_values')
      .select('source, metric_key, value, date')
      .eq('organization_id', orgId)
      .eq('dimension_type', 'global')
      .gte('date', fmt(d30))
      .lte('date', fmt(today))
      .in('metric_key', ['conversions', 'clicks', 'cost', 'profile_views', 'phone_calls', 'website_clicks', 'direction_requests', 'sessions']),

    // Métricas del período anterior (para comparación)
    supabase
      .from('marketing_metrics_values')
      .select('source, metric_key, value')
      .eq('organization_id', orgId)
      .eq('dimension_type', 'global')
      .gte('date', fmt(d60))
      .lt('date', fmt(d30))
      .in('metric_key', ['conversions', 'clicks', 'cost', 'sessions']),

    // Tendencia 6 meses para gráfica
    supabase
      .from('marketing_daily_summary')
      .select('source, date, metric_key, daily_total')
      .eq('organization_id', orgId)
      .gte('date', fmt(d6m))
      .in('metric_key', ['conversions', 'clicks', 'cost', 'sessions'])
      .order('date', { ascending: true }),
  ])

  return (
    <VisionMarketingClient
      orgId={orgId}
      connections={connections ?? []}
      currentMetrics={currentMetrics ?? []}
      previousMetrics={previousMetrics ?? []}
      trendData={trendData ?? []}
    />
  )
}
