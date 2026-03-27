/**
 * POST /api/internal/schedule-meeting
 *
 * Endpoint para que el Agente IA agende reuniones en Google Calendar
 * con enlace automático de Google Meet.
 *
 * Autenticación: Header  x-internal-secret: <N8N_INTERNAL_SECRET>
 *
 * Body esperado:
 * {
 *   summary:          string   — Título de la reunión
 *   description?:     string   — Descripción de la reunión
 *   start_time:       string   — ISO 8601 datetime (ej: "2026-03-28T10:00:00-06:00")
 *   end_time:         string   — ISO 8601 datetime
 *   attendees:        string[] — Array de emails de los asistentes
 *   contact_id?:      string   — UUID del contacto en Antuario (para registrar la reunión)
 *   conversation_id?: number   — ID de conversación en Chatwoot (para enviar la liga)
 * }
 *
 * NOTA: Requiere que exista un token de Google Calendar (OAuth) almacenado.
 *       El scope necesario es: https://www.googleapis.com/auth/calendar
 *       Este endpoint usa el refresh token almacenado en marketing_connections
 *       con source = 'google_calendar' para obtener un access token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORG_ID = 1

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getCalendarAccessToken(admin: ReturnType<typeof adminClient>): Promise<string | null> {
  // Buscar conexión de Google Calendar en marketing_connections
  const { data: conn } = await admin
    .from('marketing_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('organization_id', ORG_ID)
    .eq('source', 'google_calendar')
    .limit(1)
    .maybeSingle()

  if (!conn) return null

  // Verificar si el token ha expirado
  const now = new Date()
  const expiresAt = conn.expires_at ? new Date(conn.expires_at) : new Date(0)

  if (now < expiresAt && conn.access_token) {
    return conn.access_token
  }

  // Refrescar el token
  if (!conn.refresh_token) return null

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!tokenRes.ok) return null

  const tokenData = await tokenRes.json()
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()

  // Guardar el nuevo access token
  await admin
    .from('marketing_connections')
    .update({
      access_token: tokenData.access_token,
      expires_at:   newExpiresAt,
    })
    .eq('organization_id', ORG_ID)
    .eq('source', 'google_calendar')

  return tokenData.access_token
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar secret
    const secret = req.headers.get('x-internal-secret')
    if (!secret || secret !== process.env.N8N_INTERNAL_SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 2. Parsear body
    const body = await req.json()
    const {
      summary,
      description,
      start_time,
      end_time,
      attendees = [],
      contact_id,
      conversation_id,
    } = body

    if (!summary?.trim()) {
      return NextResponse.json({ error: 'El campo "summary" es requerido' }, { status: 400 })
    }
    if (!start_time || !end_time) {
      return NextResponse.json({ error: 'start_time y end_time son requeridos' }, { status: 400 })
    }

    const admin = adminClient()

    // 3. Obtener access token de Google Calendar
    const accessToken = await getCalendarAccessToken(admin)

    if (!accessToken) {
      return NextResponse.json({
        error: 'Google Calendar no está conectado. Se requiere conectar Google Calendar con scope de calendario en Configuración → Integraciones.',
        setup_required: true,
      }, { status: 424 })
    }

    // 4. Crear evento en Google Calendar con Google Meet
    const event = {
      summary:     summary.trim(),
      description: description?.trim() ?? `Reunión agendada por Agente IA de Antuario`,
      start: { dateTime: start_time, timeZone: 'America/Mexico_City' },
      end:   { dateTime: end_time,   timeZone: 'America/Mexico_City' },
      attendees: attendees.map((email: string) => ({ email: email.trim() })),
      conferenceData: {
        createRequest: {
          requestId: `antuario-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email',  minutes: 60 },
          { method: 'popup',  minutes: 15 },
        ],
      },
    }

    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    )

    if (!calRes.ok) {
      const err = await calRes.json().catch(() => ({}))
      return NextResponse.json({
        error: `Error de Google Calendar: ${err?.error?.message ?? calRes.statusText}`,
      }, { status: calRes.status })
    }

    const calEvent = await calRes.json()
    const meetLink = calEvent.hangoutLink ?? calEvent.conferenceData?.entryPoints?.[0]?.uri ?? null

    // 5. Registrar la nota en el contacto si se proporcionó contact_id
    if (contact_id) {
      const noteContent = [
        `📅 Reunión agendada: ${summary}`,
        `Fecha: ${new Date(start_time).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`,
        meetLink ? `Google Meet: ${meetLink}` : '',
        attendees.length ? `Asistentes: ${attendees.join(', ')}` : '',
      ].filter(Boolean).join('\n')

      await admin
        .from('contact_notes')
        .insert({
          contact_id,
          organization_id: ORG_ID,
          content:         noteContent,
          note_type:       'ai_action',
          created_by:      null,
        })
    }

    // 6. Enviar enlace por Chatwoot si se proporcionó conversation_id
    if (conversation_id && meetLink) {
      const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
      const accountId = process.env.CHATWOOT_ACCOUNT_ID
      const token     = process.env.CHATWOOT_API_TOKEN

      if (baseUrl && accountId && token) {
        try {
          await fetch(
            `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation_id}/messages`,
            {
              method:  'POST',
              headers: { api_access_token: token, 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                content:      `¡Listo! Tu reunión ha sido agendada. Aquí tienes el enlace de Google Meet: ${meetLink}`,
                message_type: 'outgoing',
              }),
            }
          )
        } catch {
          // No crítico — la reunión ya se creó
        }
      }
    }

    return NextResponse.json({
      ok:       true,
      event_id:  calEvent.id,
      meet_link: meetLink,
      html_link: calEvent.htmlLink,
      start:     start_time,
      end:       end_time,
      summary,
    }, { status: 201 })

  } catch (e) {
    console.error('[internal/schedule-meeting]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
