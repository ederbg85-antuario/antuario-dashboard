import { createClient } from '@supabase/supabase-js'

/**
 * Devuelve un access token válido de Google Calendar para la organización,
 * refrescándolo con el refresh_token si está por expirar.
 * La conexión vive en marketing_connections (source='google_calendar').
 */
export async function getCalendarAccessToken(orgId: number): Promise<string | null> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: conn } = await admin
    .from('marketing_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('organization_id', orgId)
    .eq('source', 'google_calendar')
    .limit(1)
    .maybeSingle()

  if (!conn) return null

  const now = new Date(Date.now() + 60_000) // margen de 60s
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string) : new Date(0)

  if (now < expiresAt && conn.access_token) {
    return conn.access_token as string
  }

  if (!conn.refresh_token) return null

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token as string,
      grant_type:    'refresh_token',
    }),
  })

  if (!tokenRes.ok) return null

  const tokenData = await tokenRes.json()
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()

  await admin
    .from('marketing_connections')
    .update({ access_token: tokenData.access_token, token_expires_at: newExpiresAt })
    .eq('organization_id', orgId)
    .eq('source', 'google_calendar')

  return tokenData.access_token as string
}
