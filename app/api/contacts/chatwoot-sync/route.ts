// GET  /api/contacts/chatwoot-sync?phone=xxx&email=yyy  — buscar contacto por teléfono o email
// POST /api/contacts/chatwoot-sync                      — crear contacto desde datos del chat
// PATCH /api/contacts/chatwoot-sync                     — actualizar contact_type + sincronizar etiqueta

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { cookies }                   from 'next/headers'

// ── Mapeo etiquetas Chatwoot ↔ contact_type Antuario ─────────────────────────
export const CONTACT_TYPE_TO_LABEL: Record<string, string> = {
  lead_irrelevant: 'lead-irrelevante',
  lead_potential:  'lead-potencial',
  lead_relevant:   'lead-relevante',
  proposal:        'propuesta',
  active_proposal: 'propuesta-activa',
}

export const LABEL_TO_CONTACT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CONTACT_TYPE_TO_LABEL).map(([k, v]) => [v, k])
)

// ── Auth helper ──────────────────────────────────────────────────────────────
async function getAuthContext() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()  { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null
  return { user, orgId: membership.organization_id as number, role: membership.role as string }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CONTACT_FIELDS = 'id, full_name, email, phone, whatsapp, company, contact_type, status, source, primary_channel, notes, assigned_to'

// ── GET: buscar contacto por teléfono o email ────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const rawPhone = searchParams.get('phone') ?? ''
    const email    = searchParams.get('email')?.toLowerCase().trim() ?? ''

    // Normalizar: tomar los últimos 10 dígitos del teléfono
    const digits  = rawPhone.replace(/\D/g, '')
    const phone10 = digits.length >= 10 ? digits.slice(-10) : digits

    if (!phone10 && !email) {
      return NextResponse.json({ error: 'Se requiere phone o email' }, { status: 400 })
    }

    const admin = adminClient()
    let contact = null

    // Buscar primero por teléfono (más confiable en WhatsApp)
    if (phone10) {
      const { data } = await admin
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('organization_id', ctx.orgId)
        .or(`phone.ilike.%${phone10},whatsapp.ilike.%${phone10}`)
        .limit(1)
        .maybeSingle()
      contact = data
    }

    // Si no encontró por teléfono, buscar por email
    if (!contact && email) {
      const { data } = await admin
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('organization_id', ctx.orgId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      contact = data
    }

    return NextResponse.json({ contact })
  } catch (e) {
    console.error('[contacts/chatwoot-sync GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── POST: crear contacto desde datos del chat ─────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json()
    const { name, phone, email, source = 'mensajeria' } = body

    if (!name?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    if (!phone && !email) return NextResponse.json({ error: 'Se requiere teléfono o email' }, { status: 400 })

    const admin = adminClient()

    const insertData: Record<string, unknown> = {
      organization_id: ctx.orgId,
      full_name:        name.trim(),
      source,
      status:          'active',
      primary_channel: phone ? 'whatsapp' : 'email',
    }
    if (phone) { insertData.phone = phone; insertData.whatsapp = phone }
    if (email) { insertData.email = email }

    const { data: contact, error } = await admin
      .from('contacts')
      .insert(insertData)
      .select(CONTACT_FIELDS)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ contact }, { status: 201 })
  } catch (e) {
    console.error('[contacts/chatwoot-sync POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PATCH: actualizar contact_type + sincronizar etiqueta en Chatwoot ─────────
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json()
    const { contact_id, contact_type, conversation_id } = body

    if (!contact_id)   return NextResponse.json({ error: 'contact_id requerido' }, { status: 400 })
    if (!contact_type) return NextResponse.json({ error: 'contact_type requerido' }, { status: 400 })

    const admin = adminClient()

    // Verificar que el contacto pertenece a la org
    const { data: existing } = await admin
      .from('contacts')
      .select('id')
      .eq('id', contact_id)
      .eq('organization_id', ctx.orgId)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })

    // Actualizar en Antuario
    const { data: contact, error } = await admin
      .from('contacts')
      .update({ contact_type })
      .eq('id', contact_id)
      .select(CONTACT_FIELDS)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sincronizar etiqueta en Chatwoot (no crítico si falla)
    if (conversation_id) {
      const newLabel  = CONTACT_TYPE_TO_LABEL[contact_type]
      const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
      const accountId = process.env.CHATWOOT_ACCOUNT_ID
      const token     = process.env.CHATWOOT_API_TOKEN

      if (newLabel && baseUrl && accountId && token) {
        try {
          // Obtener etiquetas actuales para no borrar las que no son de tipo de contacto
          const convRes = await fetch(
            `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation_id}`,
            { headers: { 'api_access_token': token }, cache: 'no-store' }
          )
          if (convRes.ok) {
            const convData   = await convRes.json()
            const existing: string[] = convData.labels ?? []
            const otherLabels = existing.filter(l => !LABEL_TO_CONTACT_TYPE[l])
            const newLabels   = [...otherLabels, newLabel]

            await fetch(
              `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation_id}/labels`,
              {
                method:  'POST',
                headers: { 'api_access_token': token, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ labels: newLabels }),
              }
            )
          }
        } catch {
          // Fallo silencioso: contacto ya fue actualizado, la etiqueta se puede reintentar
        }
      }
    }

    return NextResponse.json({ contact })
  } catch (e) {
    console.error('[contacts/chatwoot-sync PATCH]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
