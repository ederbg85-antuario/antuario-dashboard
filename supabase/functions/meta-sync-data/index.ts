// ================================================================
// supabase/functions/meta-sync-data/index.ts
//
// Edge Function para sincronizar datos de Meta Graph API
// hacia las tablas de marketing de Supabase.
//
// Fuentes soportadas: meta_ads | facebook | instagram
//
// Body esperado:
//   { connection_id, source, date_from, date_to, manual? }
//
// Variables de entorno requeridas (Supabase Vault / Secrets):
//   SUPABASE_URL              — automática en Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY — automática en Edge Functions
//   META_APP_ID               — agregar en Supabase Dashboard > Vault
//   META_APP_SECRET           — agregar en Supabase Dashboard > Vault
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GRAPH = 'https://graph.facebook.com/v21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Tipos ────────────────────────────────────────────────────────────────────

type SyncBody = {
  connection_id: string
  source: 'meta_ads' | 'facebook' | 'instagram'
  date_from: string   // YYYY-MM-DD
  date_to: string     // YYYY-MM-DD
  manual?: boolean
}

type MetricInsert = {
  organization_id: number
  connection_id: string
  source: string
  date: string
  metric_key: string
  value: number
  dimension_type: string
  dimension_value: string | null
}

// ── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let _connId: string | undefined
  try {
    const body = (await req.json()) as SyncBody
    const { connection_id, source, date_from, date_to } = body
    _connId = connection_id

    if (!connection_id || !source) {
      return jsonError('connection_id y source son requeridos', 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Leer la conexión activa
    const { data: conn, error: connErr } = await supabase
      .from('marketing_connections')
      .select('id, organization_id, source, access_token, external_id, external_name')
      .eq('id', connection_id)
      .eq('status', 'active')
      .maybeSingle()

    if (connErr || !conn) {
      return jsonError('Conexión no encontrada o inactiva', 404)
    }

    const orgId: number = conn.organization_id
    const token: string = conn.access_token
    const externalId: string = conn.external_id

    if (!token || !externalId) {
      await markError(supabase, connection_id, 'Conexión sin access_token o external_id')
      return jsonError('Conexión sin token o external_id', 422)
    }

    // Fechas por defecto: últimos 30 días
    const dateFrom = date_from ?? offsetDate(-30)
    const dateTo   = date_to   ?? offsetDate(0)

    let rows: MetricInsert[] = []

    // ── Sincronizar según fuente ────────────────────────────────────────────
    if (source === 'meta_ads') {
      rows = await syncMetaAds(token, externalId, orgId, connection_id, dateFrom, dateTo)
    } else if (source === 'facebook') {
      rows = await syncFacebook(token, externalId, orgId, connection_id, dateFrom, dateTo)
    } else if (source === 'instagram') {
      rows = await syncInstagram(token, externalId, orgId, connection_id, dateFrom, dateTo)
    } else {
      return jsonError(`Fuente no soportada: ${source}`, 400)
    }

    // ── Upsert via RPC (handles COALESCE functional index correctly) ─────
    if (rows.length > 0) {
      const { data: upsertResult, error: upsertErr } = await supabase
        .rpc('upsert_marketing_metrics', { p_metrics: rows })

      if (upsertErr) {
        console.error('[meta-sync] Upsert RPC error:', upsertErr)
        await markError(supabase, connection_id, `Upsert error: ${upsertErr.message}`)
        return jsonError(`Error al guardar métricas: ${upsertErr.message}`, 500)
      }
    }

    // ── Actualizar last_sync_at ────────────────────────────────────────────
    await supabase
      .from('marketing_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
        status: 'active',
      })
      .eq('id', connection_id)

    return jsonOk({ rows_synced: rows.length, source, date_from: dateFrom, date_to: dateTo })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[meta-sync] Fatal error:', msg)
    // Save error to connection for debugging
    if (_connId) {
      try {
        const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        await sb.from('marketing_connections').update({ last_error: `sync error: ${msg}` }).eq('id', _connId)
      } catch { /* ignore */ }
    }
    return jsonError(msg, 500)
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// SYNC META ADS
// ══════════════════════════════════════════════════════════════════════════════

async function syncMetaAds(
  token: string,
  adAccountId: string,
  orgId: number,
  connId: string,
  dateFrom: string,
  dateTo: string
): Promise<MetricInsert[]> {
  const rows: MetricInsert[] = []

  // Asegurarse de que el ad account tiene el prefijo act_
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

  // Campos de insights a solicitar
  const fields = [
    'spend',
    'impressions',
    'clicks',
    'reach',
    'frequency',
    'cpc',
    'cpm',
    'ctr',
    'actions',        // contiene conversiones por tipo
    'action_values',  // contiene roas/valor de conversiones
    'campaign_name',
  ].join(',')

  const timeRange = JSON.stringify({ since: dateFrom, until: dateTo })

  // Level campaign con desglose diario (time_increment=1)
  const url =
    `${GRAPH}/${accountId}/insights` +
    `?fields=${encodeURIComponent(fields)}` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&level=campaign` +
    `&time_increment=1` +
    `&limit=500` +
    `&access_token=${token}`

  const res = await fetchMeta(url)
  const data = res.data as MetaInsightRow[]

  // También obtener el resumen global (sin level=campaign, con level=account)
  const urlAccount =
    `${GRAPH}/${accountId}/insights` +
    `?fields=${encodeURIComponent(fields)}` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&level=account` +
    `&time_increment=1` +
    `&limit=500` +
    `&access_token=${token}`

  const resAccount = await fetchMeta(urlAccount)
  const accountData = resAccount.data as MetaInsightRow[]

  // ── Rows globales (level=account, daily) ──────────────────────────────────
  for (const row of accountData) {
    const date = row.date_start ?? dateFrom
    const spend = parseFloat(row.spend ?? '0')
    const impressions = parseInt(row.impressions ?? '0', 10)
    const clicks = parseInt(row.clicks ?? '0', 10)
    const reach = parseInt(row.reach ?? '0', 10)
    const conversions = extractConversions(row.actions)
    const roas = extractRoas(row.action_values)

    const globalMetrics: [string, number][] = [
      ['spend',       spend],
      ['impressions', impressions],
      ['clicks',      clicks],
      ['reach',       reach],
      ['conversions', conversions],
      ['roas',        roas],
    ]

    for (const [key, val] of globalMetrics) {
      rows.push({
        organization_id: orgId,
        connection_id: connId,
        source: 'meta_ads',
        date,
        metric_key: key,
        value: val,
        dimension_type: 'global',
        dimension_value: null,
      })
    }
  }

  // ── Rows por campaña (level=campaign, daily) ──────────────────────────────
  for (const row of data) {
    const date = row.date_start ?? dateFrom
    const campaignName = row.campaign_name ?? 'Sin campaña'
    const spend = parseFloat(row.spend ?? '0')
    const impressions = parseInt(row.impressions ?? '0', 10)
    const clicks = parseInt(row.clicks ?? '0', 10)
    const conversions = extractConversions(row.actions)

    const campaignMetrics: [string, number][] = [
      ['spend',       spend],
      ['impressions', impressions],
      ['clicks',      clicks],
      ['conversions', conversions],
    ]

    for (const [key, val] of campaignMetrics) {
      rows.push({
        organization_id: orgId,
        connection_id: connId,
        source: 'meta_ads',
        date,
        metric_key: key,
        value: val,
        dimension_type: 'campaign',
        dimension_value: campaignName,
      })
    }
  }

  return rows
}

// ══════════════════════════════════════════════════════════════════════════════
// SYNC FACEBOOK PAGE
// ══════════════════════════════════════════════════════════════════════════════

async function syncFacebook(
  token: string,
  pageId: string,
  orgId: number,
  connId: string,
  dateFrom: string,
  dateTo: string
): Promise<MetricInsert[]> {
  const rows: MetricInsert[] = []
  const today = offsetDate(0)

  // 1. Obtener page access token + fan_count (snapshot)
  const pageRes = await fetchMeta(
    `${GRAPH}/${pageId}?fields=access_token,fan_count,name&access_token=${token}`
  )
  const pageToken: string = pageRes.access_token ?? token
  const fanCount: number  = pageRes.fan_count ?? 0

  // Followers y page_likes → snapshot con la fecha de hoy
  rows.push(makeRow(orgId, connId, 'facebook', today, 'followers',  fanCount, 'global'))
  rows.push(makeRow(orgId, connId, 'facebook', today, 'page_likes', fanCount, 'global'))

  // 2. Insights diarios de la página — fetch each metric separately for robustness
  //    (some metrics may be deprecated in newer API versions)
  const pageMetrics: Array<{ apiName: string; key: string }> = [
    { apiName: 'page_impressions',       key: 'impressions' },
    { apiName: 'page_post_engagements',  key: 'post_engagements' },
  ]

  const sinceTs = Math.floor(new Date(dateFrom).getTime() / 1000)
  const untilTs = Math.floor(new Date(dateTo).getTime()   / 1000) + 86400 // +1 día para incluir dateTo

  for (const { apiName, key } of pageMetrics) {
    try {
      const insightsRes = await fetchMeta(
        `${GRAPH}/${pageId}/insights` +
        `?metric=${apiName}` +
        `&period=day` +
        `&since=${sinceTs}` +
        `&until=${untilTs}` +
        `&access_token=${pageToken}`
      )

      for (const insight of insightsRes.data ?? []) {
        for (const point of insight.values ?? []) {
          const date = (point.end_time as string).split('T')[0]
          const val  = typeof point.value === 'number' ? point.value : 0
          rows.push(makeRow(orgId, connId, 'facebook', date, key, val, 'global'))
        }
      }
    } catch (err) {
      // Log but continue with other metrics — some may be deprecated
      console.warn(`[meta-sync] Facebook insight '${apiName}' failed:`, err instanceof Error ? err.message : err)
    }
  }

  return rows
}

// ══════════════════════════════════════════════════════════════════════════════
// SYNC INSTAGRAM BUSINESS
// ══════════════════════════════════════════════════════════════════════════════

async function syncInstagram(
  token: string,
  igUserId: string,
  orgId: number,
  connId: string,
  dateFrom: string,
  dateTo: string
): Promise<MetricInsert[]> {
  const rows: MetricInsert[] = []
  const today = offsetDate(0)

  // 1. Snapshot: followers_count + media_count
  const profileRes = await fetchMeta(
    `${GRAPH}/${igUserId}?fields=followers_count,media_count,name&access_token=${token}`
  )
  const followers  = profileRes.followers_count ?? 0
  const mediaCount = profileRes.media_count ?? 0

  rows.push(makeRow(orgId, connId, 'instagram', today, 'followers',   followers,  'global'))
  rows.push(makeRow(orgId, connId, 'instagram', today, 'media_count', mediaCount, 'global'))

  // 2. Insights diarios — fetch each metric separately for robustness
  //    (some metrics may not be available for all account types)
  const insightMetrics = ['reach', 'impressions', 'profile_views']

  const sinceTs = Math.floor(new Date(dateFrom).getTime() / 1000)
  const untilTs = Math.floor(new Date(dateTo).getTime()   / 1000) + 86400

  for (const metric of insightMetrics) {
    try {
      const insightsRes = await fetchMeta(
        `${GRAPH}/${igUserId}/insights` +
        `?metric=${metric}` +
        `&period=day` +
        `&since=${sinceTs}` +
        `&until=${untilTs}` +
        `&access_token=${token}`
      )

      for (const insight of insightsRes.data ?? []) {
        const metricKey = insight.name as string
        for (const point of insight.values ?? []) {
          const date = (point.end_time as string).split('T')[0]
          const val  = typeof point.value === 'number' ? point.value : 0
          rows.push(makeRow(orgId, connId, 'instagram', date, metricKey, val, 'global'))
        }
      }
    } catch (err) {
      // Log but continue with other metrics — some may not be available
      console.warn(`[meta-sync] Instagram insight '${metric}' failed:`, err instanceof Error ? err.message : err)
    }
  }

  // 3. Engagement de media (likes + comments) — últimos 25 posts
  try {
    const mediaRes = await fetchMeta(
      `${GRAPH}/${igUserId}/media` +
      `?fields=like_count,comments_count,timestamp` +
      `&limit=25` +
      `&access_token=${token}`
    )

    let totalLikes    = 0
    let totalComments = 0

    for (const media of mediaRes.data ?? []) {
      const postDate = (media.timestamp as string)?.split('T')[0]
      if (postDate && postDate >= dateFrom && postDate <= dateTo) {
        totalLikes    += media.like_count    ?? 0
        totalComments += media.comments_count ?? 0
      }
    }

    // Guardar totales del período como snapshot
    if (totalLikes > 0 || totalComments > 0) {
      rows.push(makeRow(orgId, connId, 'instagram', today, 'likes',    totalLikes,    'global'))
      rows.push(makeRow(orgId, connId, 'instagram', today, 'comments', totalComments, 'global'))
    }
  } catch {
    // No crítico — continuar sin engagement de media
    console.warn('[meta-sync] No se pudo obtener engagement de media de Instagram')
  }

  return rows
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

type MetaInsightRow = {
  date_start?: string
  spend?: string
  impressions?: string
  clicks?: string
  reach?: string
  frequency?: string
  cpc?: string
  cpm?: string
  ctr?: string
  campaign_name?: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
}

/** Extrae conversiones totales (purchase + lead + complete_registration) */
function extractConversions(actions?: MetaInsightRow['actions']): number {
  if (!actions) return 0
  const conversionTypes = new Set([
    'purchase',
    'lead',
    'complete_registration',
    'offsite_conversion.fb_pixel_purchase',
    'offsite_conversion.fb_pixel_lead',
  ])
  return actions
    .filter(a => conversionTypes.has(a.action_type))
    .reduce((sum, a) => sum + parseFloat(a.value ?? '0'), 0)
}

/** Extrae ROAS a partir de action_values (purchase value / spend) */
function extractRoas(actionValues?: MetaInsightRow['action_values']): number {
  if (!actionValues) return 0
  const purchaseTypes = new Set([
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
  ])
  return actionValues
    .filter(a => purchaseTypes.has(a.action_type))
    .reduce((sum, a) => sum + parseFloat(a.value ?? '0'), 0)
}

function makeRow(
  orgId: number,
  connId: string,
  source: string,
  date: string,
  metric_key: string,
  value: number,
  dimension_type: string,
  dimension_value: string | null = null
): MetricInsert {
  return { organization_id: orgId, connection_id: connId, source, date, metric_key, value, dimension_type, dimension_value }
}

/** Llama a la Meta Graph API y lanza error si hay OAuthException (#190) */
async function fetchMeta(url: string): Promise<Record<string, unknown>> {
  const res  = await fetch(url)
  const json = await res.json() as Record<string, unknown>

  if (json.error) {
    const err = json.error as { code?: number; message?: string; type?: string }
    const msg = `Meta API error ${err.code}: ${err.message}`
    // #190 = OAuthException (token inválido/expirado)
    if (err.code === 190 || err.type === 'OAuthException') {
      throw Object.assign(new Error(msg), { isOAuthError: true })
    }
    throw new Error(msg)
  }

  return json
}

async function markError(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  message: string
) {
  await supabase
    .from('marketing_connections')
    .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
    .eq('id', connectionId)
}

/** Fecha relativa a hoy en formato YYYY-MM-DD (offset en días) */
function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...data as object }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
