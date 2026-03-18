import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDateFilterFromCookie } from '@/lib/date-filter'
import VisionMaestraClient from '@/components/vision-maestra/VisionMaestraClient'

export default async function VisionMaestraPage() {
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
    .from('memberships').select('organization_id, role')
    .eq('user_id', user.id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  if (!membership) redirect('/crear-organizacion')
  const orgId = membership.organization_id

  // ── Leer filtro de fechas de la cookie ────────────────────────
  const dateFilter = await getDateFilterFromCookie()
  const { from, to } = dateFilter

  // ── Período de comparación (mismo número de días, período anterior) ──
  const days = Math.max(1,
    Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24))
  )
  const prevTo   = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const pFrom = fmt(prevFrom)
  const pTo   = fmt(prevTo)

  // ── Todas las queries en paralelo ─────────────────────────────
  const [
    // 1. Objetivos activos
    { data: goals },

    // 2. Marketing — métricas del período actual
    { data: mktMetrics },

    // 3. Marketing — métricas del período anterior (comparación)
    { data: mktMetricsPrev },

    // 4. CRM — contactos creados en el período
    { data: contacts },

    // 5. CRM — leads relevantes
    { data: leadsRelevantes },

    // 6. Propuestas en el período
    { data: proposals },

    // 7. Pedidos pagados (clientes + ingresos)
    { data: orders },

    // 8. Presupuestos del período (para CAC)
    { data: budgets },

    // 9. Tendencia diaria para gráficas (marketing)
    { data: trendData },

    // 10. Tendencia CRM diaria
    { data: crmTrend },
  ] = await Promise.all([

    // 1. Objetivos activos con sus metas
    supabase
      .from('goals')
      .select('id, title, category, progress_pct, status, priority, due_date, goal_targets(id, title, weight, current_value, target_value, unit)')
      .eq('organization_id', orgId)
      .eq('status', 'activo')
      .order('priority', { ascending: true }),

    // 2. Métricas de marketing actuales — global dimensions
    supabase
      .from('marketing_metrics_values')
      .select('source, metric_key, value')
      .eq('organization_id', orgId)
      .eq('dimension_type', 'global')
      .gte('date', from).lte('date', to)
      .in('metric_key', [
        'impressions', 'clicks', 'cost', 'conversions',
        'sessions', 'engaged_sessions', 'engagement_rate',
        'bounce_rate', 'conversion_rate',
        'profile_views', 'phone_calls', 'website_clicks', 'direction_requests',
      ]),

    // 3. Métricas período anterior
    supabase
      .from('marketing_metrics_values')
      .select('source, metric_key, value')
      .eq('organization_id', orgId)
      .eq('dimension_type', 'global')
      .gte('date', pFrom).lte('date', pTo)
      .in('metric_key', ['impressions', 'clicks', 'cost', 'conversions', 'sessions']),

    // 4. Contactos en el período
    supabase
      .from('contacts')
      .select('id, status, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`),

    // 5. Leads relevantes en el período
    supabase
      .from('contacts')
      .select('id, contact_type, created_at')
      .eq('organization_id', orgId)
      .eq('contact_type', 'lead_relevant')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`),

    // 6. Propuestas en el período
    supabase
      .from('proposals')
      .select('id, status, total, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`),

    // 7. Pedidos pagados en el período
    supabase
      .from('orders')
      .select('id, total, status, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`),

    // 8. Presupuestos aplicables al período
    supabase
      .from('budgets')
      .select('id, name, amount, type, category, recurrence, start_date, end_date, expense_date')
      .eq('organization_id', orgId)
      .or(
        // Gastos recurrentes activos en el período
        `and(type.eq.recurring,or(start_date.is.null,start_date.lte.${to}),or(end_date.is.null,end_date.gte.${from})),` +
        // Gastos puntuales en el período
        `and(type.eq.one_time,expense_date.gte.${from},expense_date.lte.${to})`
      ),

    // 9. Tendencia marketing diaria (para gráficas)
    supabase
      .from('marketing_daily_summary')
      .select('source, date, metric_key, daily_total')
      .eq('organization_id', orgId)
      .gte('date', from).lte('date', to)
      .in('metric_key', ['impressions', 'clicks', 'cost', 'conversions', 'sessions',
        'profile_views', 'phone_calls', 'direction_requests', 'website_clicks'])
      .order('date', { ascending: true }),

    // 10. Tendencia CRM diaria (contactos por día)
    supabase
      .from('contacts')
      .select('id, created_at, status')
      .eq('organization_id', orgId)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`),
  ])

  return (
    <VisionMaestraClient
      dateFilter={dateFilter}
      goals={goals ?? []}
      mktMetrics={mktMetrics ?? []}
      mktMetricsPrev={mktMetricsPrev ?? []}
      contacts={contacts ?? []}
      leadsRelevantes={leadsRelevantes ?? []}
      proposals={proposals ?? []}
      orders={orders ?? []}
      budgets={budgets ?? []}
      trendData={trendData ?? []}
      crmTrend={crmTrend ?? []}
    />
  )
}
