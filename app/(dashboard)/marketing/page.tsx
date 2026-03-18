import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import VisionMarketingClient from '@/components/marketing/VisionMarketingClient'
import { getDateFilterFromCookie } from '@/lib/date-filter'

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

  // ── Filtro de fechas global ────────────────────────────────
  const dateFilter = await getDateFilterFromCookie()
  const { from, to } = dateFilter
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Período de comparación (mismo núm. de días, período anterior)
  const days = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)))
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days)
  const pFrom = fmt(prevFrom), pTo = fmt(prevTo)

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

    // Métricas del período seleccionado
    supabase
      .from('marketing_metrics_values')
      .select('source, metric_key, value, date')
      .eq('organization_id', orgId)
      .eq('dimension_type', 'global')
      .gte('date', from)
      .lte('date', to)
      .in('metric_key', ['conversions', 'clicks', 'cost', 'profile_views', 'phone_calls', 'website_clicks', 'direction_requests', 'sessions']),

    // Métricas del período anterior (para comparación)
    supabase
      .from('marketing_metrics_values')
      .select('source, metric_key, value')
      .eq('organization_id', orgId)
      .eq('dimension_type', 'global')
      .gte('date', pFrom)
      .lte('date', pTo)
      .in('metric_key', ['conversions', 'clicks', 'cost', 'sessions']),

    // Tendencia del período seleccionado para gráfica
    supabase
      .from('marketing_daily_summary')
      .select('source, date, metric_key, daily_total')
      .eq('organization_id', orgId)
      .gte('date', from)
      .lte('date', to)
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
      dateFilter={dateFilter}
    />
  )
}
