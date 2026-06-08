/**
 * POST /api/internal/reschedule-meeting
 *
 * Reagenda (edita) la reunión EXISTENTE de un contacto en Google Calendar,
 * en lugar de crear una nueva. Mantiene el mismo enlace de Google Meet.
 *
 * Autenticación: Header x-internal-secret: <N8N_INTERNAL_SECRET>
 *
 * Body:
 * {
 *   contact_id?:      string   — UUID del contacto (o usa phone)
 *   phone?:           string   — Teléfono para resolver el contacto
 *   start_time:       string   — Nuevo inicio ISO 8601 (CDMX -06:00)
 *   end_time:         string   — Nuevo fin ISO 8601
 *   conversation_id?: number   — (opcional) no se usa para enviar mensaje; el flujo lo hace
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCalendarAccessToken } from '@/lib/google-calendar'

const ORG_ID = 1

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (!secret || secret !== process.env.N8N_INTERNAL_SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { contact_id, phone, start_time, end_time } = body

    if (!start_time || !end_time) {
      return NextResponse.json({ error: 'start_time y end_time son requeridos' }, { status: 400 })
    }

    const admin = adminClient()

    // 1. Resolver contacto + su reunión existente
    type ContactRow = { id: string; meeting_event_id: string | null; full_name: string | null }
    let contact: ContactRow | null = null

    if (contact_id) {
      const { data } = await admin
        .from('contacts')
        .select('id, meeting_event_id, full_name')
        .eq('id', contact_id)
        .eq('organization_id', ORG_ID)
        .maybeSingle()
      contact = data as unknown as ContactRow | null
    }
    if (!contact && phone) {
      const digits  = String(phone).replace(/\D/g, '')
      const phone10 = digits.length >= 10 ? digits.slice(-10) : digits
      if (phone10) {
        const { data } = await admin
          .from('contacts')
          .select('id, meeting_event_id, full_name')
          .eq('organization_id', ORG_ID)
          .or(`phone.ilike.%${phone10},whatsapp.ilike.%${phone10}`)
          .limit(1)
          .maybeSingle()
        contact = data as unknown as ContactRow | null
      }
    }

    if (!contact)               return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
    if (!contact.meeting_event_id)
      return NextResponse.json({ error: 'El contacto no tiene una reunión para reagendar' }, { status: 404 })

    // 2. Access token de Google Calendar
    const accessToken = await getCalendarAccessToken(ORG_ID)
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Calendar no está conectado', setup_required: true }, { status: 424 })
    }

    // 3. PATCH del evento (solo cambia fecha/hora; el Meet se conserva)
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${contact.meeting_event_id}?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { dateTime: start_time, timeZone: 'America/Mexico_City' },
          end:   { dateTime: end_time,   timeZone: 'America/Mexico_City' },
        }),
      }
    )

    if (!calRes.ok) {
      const err = await calRes.json().catch(() => ({}))
      return NextResponse.json({ error: `Error de Google Calendar: ${err?.error?.message ?? calRes.statusText}` }, { status: calRes.status })
    }

    const calEvent = await calRes.json()
    const meetLink = calEvent.hangoutLink ?? calEvent.conferenceData?.entryPoints?.[0]?.uri ?? null

    // 4. Actualizar contacto + nota
    await admin
      .from('contacts')
      .update({ meeting_at: start_time, meeting_status: 'rescheduled', updated_at: new Date().toISOString() })
      .eq('id', contact.id)

    await admin.from('contact_notes').insert({
      contact_id:      contact.id,
      organization_id: ORG_ID,
      content:         `🔁 Reunión REAGENDADA a: ${new Date(start_time).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}${meetLink ? `\nGoogle Meet: ${meetLink}` : ''}`,
      note_type:       'ai_action',
      created_by:      null,
    })

    return NextResponse.json({
      ok: true,
      event_id:  contact.meeting_event_id,
      meet_link: meetLink,
      start:     start_time,
      end:       end_time,
    }, { status: 200 })

  } catch (e) {
    console.error('[internal/reschedule-meeting]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
