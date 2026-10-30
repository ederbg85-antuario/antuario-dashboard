'use client'
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { AccountBundle } from '@/lib/client-accounts-types'
import type {
  accountMetrics,
  AccountsRange
} from '@/lib/client-accounts-metrics'
import { useChartAnimation } from '@/components/workspace/ChartPanel'
import {
  accountColors,
  axis,
  ChartTip,
  Empty,
  number,
  shortDate,
  Surface
} from './AccountPrimitives'
export type AccountAnalysis = ReturnType<typeof accountMetrics>
const colors = [
  accountColors.lilac,
  accountColors.mint,
  accountColors.peach,
  accountColors.blue
]
export { KpiGrid } from './AccountKpiGrid'
import { KpiGrid } from './AccountKpiGrid'
export function TrafficChart({ analysis }: { analysis: AccountAnalysis }) {
  const animate = useChartAnimation(),
    hasData = analysis.trends.some(
      (row) => row.sessions != null || row.leads != null
    )
  return (
    <Surface
      title="Sesiones y leads"
      description="Evolución diaria · escalas independientes"
      source={`GA4 · ${shortDate(analysis.range.from)}–${shortDate(analysis.range.to)} · días sin observación se conservan como vacíos.`}
    >
      {hasData ? (
        <>
          <div className="account-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <ComposedChart
                data={analysis.trends}
                margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
                accessibilityLayer
              >
                <defs>
                  <linearGradient
                    id="account-sessions-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={accountColors.lilac}
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="100%"
                      stopColor={accountColors.lilac}
                      stopOpacity={0.015}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  {...axis}
                  tickFormatter={shortDate}
                  minTickGap={36}
                />
                <YAxis yAxisId="sessions" {...axis} width={45} />
                <YAxis
                  yAxisId="leads"
                  orientation="right"
                  {...axis}
                  width={30}
                />
                <Tooltip
                  content={<ChartTip />}
                  labelFormatter={(value) => shortDate(String(value))}
                />
                <Area
                  yAxisId="sessions"
                  type="monotone"
                  dataKey="sessions"
                  name="Sesiones"
                  stroke={accountColors.lilac}
                  strokeWidth={2.4}
                  fill="url(#account-sessions-fill)"
                  connectNulls={false}
                  isAnimationActive={animate}
                  animationDuration={500}
                />
                <Line
                  yAxisId="leads"
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke={accountColors.mint}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={animate}
                  animationDuration={500}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="account-chart-legend">
            <span>
              <i style={{ background: accountColors.lilac }} />
              Sesiones · izquierda
            </span>
            <span>
              <i style={{ background: accountColors.mint }} />
              Leads · derecha
            </span>
          </div>
        </>
      ) : (
        <Empty
          title="Aún sin medición de tráfico"
          description="Óscar o Memo pueden registrar snapshots de GA4 con fecha y evidencia."
        />
      )}
    </Surface>
  )
}
export function ChannelsChart({
  analysis,
  onChannel,
  paidAds = true
}: {
  analysis: AccountAnalysis
  onChannel?: (channel: string) => void
  paidAds?: boolean
}) {
  const animate = useChartAnimation(),
    keys = [
      ['organic', 'Orgánico'],
      ['paid', 'Pagado'],
      ['direct', 'Directo'],
      ['referral', 'Referido']
    ].filter(([key]) => paidAds || key !== 'paid'),
    hasData = analysis.channels.some((row) =>
      keys.some(([key]) => row[key as keyof typeof row] != null)
    )
  return (
    <Surface
      title="Leads por canal"
      description={
        onChannel
          ? 'Selecciona una barra para profundizar'
          : 'Distribución diaria'
      }
      source="GA4 · eventos de lead con canal identificado. Un lead no equivale a una venta."
    >
      {hasData ? (
        <>
          <div className="account-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <BarChart
                data={analysis.channels}
                margin={{ top: 10, right: 0, left: -24, bottom: 0 }}
                accessibilityLayer
              >
                <XAxis
                  dataKey="date"
                  {...axis}
                  tickFormatter={shortDate}
                  minTickGap={36}
                />
                <YAxis {...axis} allowDecimals={false} width={45} />
                <Tooltip
                  content={<ChartTip />}
                  labelFormatter={(value) => shortDate(String(value))}
                  cursor={{ fill: 'var(--card-2)' }}
                />
                {keys.map(([key, label], i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={label}
                    stackId="leads"
                    fill={colors[i]}
                    radius={i === 3 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    isAnimationActive={animate}
                    animationDuration={500}
                    onClick={() => onChannel?.(key)}
                    cursor={onChannel ? 'pointer' : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="account-chart-legend">
            {keys.map(([key, label], i) => (
              <button
                type="button"
                key={key}
                className="account-text-button"
                onClick={() => onChannel?.(key)}
              >
                <i style={{ background: colors[i] }} />
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <Empty
          title="Falta el desglose por canal"
          description="Se mostrarán orgánico, pagado, directo y referido cuando lleguen snapshots con esa dimensión."
        />
      )}
    </Surface>
  )
}
export function FunnelChart({ analysis }: { analysis: AccountAnalysis }) {
  const hasData = analysis.funnel.some((row) => row.value != null),
    max = Math.max(1, ...analysis.funnel.map((row) => row.value ?? 0))
  return (
    <Surface
      title="De exposición a oportunidad"
      description="Embudo del mismo origen"
      source="Google Ads · cada etapa conserva su definición. Sin dato se muestra —; no se cruza con impresiones SEO."
    >
      {hasData ? (
        <div className="account-funnel">
          {analysis.funnel.map((row) => (
            <div
              className="account-funnel-item"
              key={row.name}
              style={{ width: '100%', flexWrap: 'wrap' }}
            >
              <span>{row.name}</span>
              <strong>{number(row.value)}</strong>
              <div
                className="account-progress"
                style={{
                  flexBasis: '100%',
                  background: 'var(--card)',
                  height: 5
                }}
                aria-label={`${row.name}: ${number(row.value)}`}
              >
                <span
                  style={{
                    width: `${row.value == null ? 0 : (row.value / max) * 100}%`,
                    background: accountColors.lilac
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Embudo por completar"
          description="Faltan snapshots compatibles de impresiones, clics, leads y cotizaciones."
        />
      )}
    </Surface>
  )
}
export function SpendMixChart({
  analysis,
  onCampaign
}: {
  analysis: AccountAnalysis
  onCampaign?: (id: string) => void
}) {
  const animate = useChartAnimation(),
    total = analysis.campaignSpend.reduce((sum, row) => sum + row.value, 0)
  return (
    <Surface financial
      title="Distribución del gasto"
      description="Por campaña · misma moneda"
      source={`Google Ads · ${analysis.currency}. Selecciona una campaña para ver su detalle.`}
    >
      {total > 0 ? (
        <>
          <div className="account-chart is-small">
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <PieChart accessibilityLayer>
                <Tooltip content={<ChartTip />} />
                <Pie
                  data={analysis.campaignSpend}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={5}
                  stroke="none"
                  isAnimationActive={animate}
                  animationDuration={550}
                  onClick={(_, index) =>
                    onCampaign?.(analysis.campaignSpend[index]?.id ?? '')
                  }
                >
                  {analysis.campaignSpend.map((row, i) => (
                    <Cell
                      key={row.id}
                      fill={colors[i % colors.length]}
                      cursor="pointer"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="account-chart-legend">
            {analysis.campaignSpend.map((row, i) => (
              <button
                className="account-text-button"
                key={row.id}
                onClick={() => onCampaign?.(row.id)}
              >
                <i style={{ background: colors[i % colors.length] }} />
                {row.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <Empty
          title="Sin gasto por campaña"
          description="Los snapshots de gasto deben incluir la campaña para mostrar su distribución."
        />
      )}
    </Surface>
  )
}
export { BudgetCard, CampaignTable } from './AccountBudget'
import { BudgetCard, CampaignTable } from './AccountBudget'
export function AdsHistoryChart({
  bundle,
  analysis
}: {
  bundle: AccountBundle
  analysis: AccountAnalysis
}) {
  const animate = useChartAnimation(),
    series = analysis.byKey.adSpend.series,
    markers = useMemo(
      () =>
        bundle.changes
          .filter(
            (c) =>
              c.date.slice(0, 10) >= analysis.range.from &&
              c.date.slice(0, 10) <= analysis.range.to &&
              c.platform === 'google_ads'
          )
          .map((c) => ({
            ...c,
            x: c.date.slice(0, 10),
            y: series.find((p) => p.date === c.date.slice(0, 10))?.value ?? null
          })),
      [bundle.changes, analysis.range.from, analysis.range.to, series]
    )
  return (
    <Surface financial
      title="Gasto y cambios"
      description="Marcadores de decisiones sobre el gasto diario"
      source="Google Ads · un cambio registrado no demuestra que causó una variación de rendimiento."
    >
      {series.some((row) => row.value != null) ? (
        <div className="account-chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={1}>
            <AreaChart
              data={series}
              margin={{ top: 20, right: 8, left: -10, bottom: 0 }}
              accessibilityLayer
            >
              <XAxis
                dataKey="date"
                {...axis}
                tickFormatter={shortDate}
                minTickGap={36}
              />
              <YAxis {...axis} width={46} />
              <Tooltip
                content={<ChartTip />}
                labelFormatter={(value) => shortDate(String(value))}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={`Gasto ${analysis.currency}`}
                stroke={accountColors.mint}
                strokeWidth={2.2}
                fill={accountColors.mint}
                fillOpacity={0.1}
                connectNulls={false}
                isAnimationActive={animate}
                animationDuration={500}
              />
              {markers
                .filter((m) => m.y != null)
                .map((marker) => (
                  <ReferenceDot
                    key={marker.id}
                    x={marker.x}
                    y={marker.y!}
                    r={5}
                    fill={accountColors.peach}
                    stroke="none"
                    label={{
                      value: '•',
                      position: 'top',
                      fill: accountColors.peach
                    }}
                  />
                ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty
          title="Todavía sin gasto observado"
          description="La bitácora conserva los cambios aunque aún no haya snapshots diarios."
        />
      )}
    </Surface>
  )
}
export function BillingChart({ analysis }: { analysis: AccountAnalysis }) {
  const animate = useChartAnimation()
  return (
    <Surface financial
      title="Facturado y cobrado"
      description="Por fecha de emisión y de pago"
      source={`Registros de la cuenta · ${analysis.currency}. ${analysis.billingSummary.hasInvoices ? '' : 'Facturación por verificar. '}${analysis.billingSummary.hasPayments ? '' : 'Cobros por verificar. '}Las oportunidades no forman parte de estos importes.`}
    >
      {analysis.billing.some(
        (row) => (row.invoiced ?? 0) > 0 || (row.collected ?? 0) > 0
      ) ? (
        <>
          <div className="account-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <BarChart
                data={analysis.billing.map((row) => ({
                  ...row,
                  invoiced: analysis.billingSummary.hasInvoices
                    ? row.invoiced
                    : null,
                  collected: analysis.billingSummary.hasPayments
                    ? row.collected
                    : null
                }))}
                margin={{ top: 12, right: 0, left: -12, bottom: 0 }}
                accessibilityLayer
              >
                <XAxis
                  dataKey="month"
                  {...axis}
                  tickFormatter={(value) =>
                    new Intl.DateTimeFormat('es-MX', {
                      month: 'short',
                      year: '2-digit',
                      timeZone: 'UTC'
                    }).format(new Date(`${value}-15T12:00:00Z`))
                  }
                />
                <YAxis
                  {...axis}
                  width={55}
                  tickFormatter={(value) =>
                    number(Number(value) / 1000, 1) + 'k'
                  }
                />
                <Tooltip content={<ChartTip />} />
                <Bar
                  dataKey="invoiced"
                  name="Facturado"
                  fill={accountColors.lilac}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={35}
                  isAnimationActive={animate}
                  animationDuration={500}
                />
                <Bar
                  dataKey="collected"
                  name="Cobrado"
                  fill={accountColors.mint}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={35}
                  isAnimationActive={animate}
                  animationDuration={500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="account-chart-legend">
            <span>
              <i style={{ background: accountColors.lilac }} />
              Facturado
            </span>
            <span>
              <i style={{ background: accountColors.mint }} />
              Cobrado
            </span>
          </div>
        </>
      ) : (
        <Empty
          title="Sin facturas o pagos en el periodo"
          description="Los importes se mostrarán solo después de registrar documentos y cobros con evidencia."
        />
      )}
    </Surface>
  )
}
export function PerformancePanel({
  bundle,
  analysis,
  paidAds,
  onCampaign,
  onChannel
}: {
  bundle: AccountBundle
  range: AccountsRange
  analysis: AccountAnalysis
  paidAds: boolean
  onCampaign: (id: string) => void
  onChannel: (channel: string) => void
}) {
  return (
    <>
      <KpiGrid analysis={analysis} paidAds={paidAds} />
      <div className="account-grid">
        <TrafficChart analysis={analysis} />
        <ChannelsChart
          analysis={analysis}
          onChannel={onChannel}
          paidAds={paidAds}
        />
        {paidAds ? (
          <>
            <FunnelChart analysis={analysis} />
            <SpendMixChart analysis={analysis} onCampaign={onCampaign} />
            <BudgetCard analysis={analysis} />
            <AdsHistoryChart bundle={bundle} analysis={analysis} />
          </>
        ) : (
          <SeoTrendChart analysis={analysis} />
        )}
      </div>
      {paidAds && <CampaignTable analysis={analysis} onCampaign={onCampaign} />}
    </>
  )
}

export { SeoTrendChart } from './AccountSeoTrend'
import { SeoTrendChart } from './AccountSeoTrend'
export function SeoTrendPlot({ analysis }: { analysis: AccountAnalysis }) {
  const animate = useChartAnimation(),
    points = analysis.byKey.seoClicks.series.map((point, index) => ({
      date: point.date,
      clicks: point.value,
      impressions: analysis.byKey.seoImpressions.series[index]?.value ?? null
    }))
  return (
    <>
      {points.some(
        (point) => point.clicks != null || point.impressions != null
      ) ? (
        <>
          <div className="account-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <ComposedChart
                data={points}
                margin={{ top: 10, right: 5, left: -15, bottom: 0 }}
                accessibilityLayer
              >
                <XAxis
                  dataKey="date"
                  {...axis}
                  tickFormatter={shortDate}
                  minTickGap={36}
                />
                <YAxis yAxisId="clicks" {...axis} width={45} />
                <YAxis
                  yAxisId="impressions"
                  orientation="right"
                  {...axis}
                  width={45}
                />
                <Tooltip
                  content={<ChartTip />}
                  labelFormatter={(value) => shortDate(String(value))}
                />
                <Line
                  yAxisId="clicks"
                  dataKey="clicks"
                  name="Clics SEO"
                  stroke={accountColors.mint}
                  strokeWidth={2.4}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={animate}
                />
                <Line
                  yAxisId="impressions"
                  dataKey="impressions"
                  name="Impresiones SEO"
                  stroke={accountColors.lilac}
                  strokeWidth={2.2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={animate}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="account-chart-legend">
            <span>
              <i style={{ background: accountColors.mint }} />
              Clics · izquierda
            </span>
            <span>
              <i style={{ background: accountColors.lilac }} />
              Impresiones · derecha
            </span>
          </div>
        </>
      ) : (
        <Empty
          title="Medición orgánica por verificar"
          description="No hay snapshots de Search Console en este rango. No se sustituyen con datos publicitarios."
        />
      )}
    </>
  )
}
