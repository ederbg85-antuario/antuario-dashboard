/**
 * POST /api/internal/upsert-lead
 *
 * Endpoint exclusivo para el Agente IA de N8N/Chatwoot.
 * Crea o actualiza un contacto en el CRM de Antuario Dashboard
 * y sincroniza la etiqueta en Chatwoot.
 *
 * Autenticación: Header  x-internal-secret: <N8N_INTERNAL_SECRET>
 *
 * Body esperado:
 * {
 *   name:             string   — Nombre completo del lead
 *   phone?:           string   — Teléfono (con o sin código de país)
 *   email?:           string   — Correo electrónico
 *   company?:         string   — Nombre de la empresa
 *   company_id?:      string   — UUID de empresa ya existente en Antuario
 *   position?:        string   — Puesto del contacto en la empresa
 *   decision_level?:  string   — Nivel de toma de decisión (decision_maker | influencer | user | unknown)
 *   ai_profile?:      string   — Perfil generado por IA (oportunidad, personalidad, contexto)
 *   lead_status:      "qualified" | "warm" | "new" | "cold"
 *   lead_score:       number
 *   notes?:           string   — Resumen del agente sobre el lead
 *   conversation_id:  number   — ID de conversación en Chatwoot
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Constantes de la cuenta de Eder (org 1) ──────────────────────────────────
const ORG_ID      = 1
const ASSIGNED_TO = '684871ef-15a1-4c22-a7fa-af6c2dcbe726' // Eder Basilio

// ── Mapeo lead_status del agente → contact_type del CRM ──────────────────────
const STATUS_TO_CONTACT_TYPE: Record<string, string> = {
  qualified: 'lead_relevant',
  warm:      'lead_relevant',
  new:       'lead_potential',
  cold:      'lead_irrelevant',
}

// ── Mapeo contact_type → etiqueta Chatwoot ────────────────────────────────────
const CONTACT_TYPE_TO_LABEL: Record<string, string> = {
  lead_irrelevant: 'lead-irrelevante',
  lead_potential:  'lead-potencial',
  lead_relevant:   'lead-relevante',
  proposal:        'propuesta',
  active_proposal: 'propuesta-activa',
  client:          'cliente',
}

const CONTACT_FIELDS = 'id, full_name, email, phone, whatsapp, company, company_id, position, decision_level, ai_profile, contact_type, status, notes, assigned_to'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── POST ─────────────────────────────────────────────────────────────────────
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
      name,
      phone,
      email,
      company,
      company_id,
      position,
      decision_level,
      ai_profile,
      lead_status = 'new',
      lead_score  = 0,
      notes,
      conversation_id,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El campo "name" es requerido' }, { status: 400 })
    }
    if (!phone && !email) {
      return NextResponse.json({ error: 'Se requiere al menos phone o email' }, { status: 400 })
    }

    const admin = adminClient()
    const contactType = STATUS_TO_CONTACT_TYPE[lead_status] ?? 'lead_potential'

    // 3. Normalizar teléfono: últimos 10 dígitos
    const digits  = (phone ?? '').replace(/\D/g, '')
    const phone10 = digits.length >= 10 ? digits.slice(-10) : digits

    // 4. Buscar contacto existente por teléfono o email
    let existingContact: { id: string } | null = null

    if (phone10) {
      const { data } = await admin
        .from('contacts')
        .select('id')
        .eq('organization_id', ORG_ID)
        .or(`phone.ilike.%${phone10},whatsapp.ilike.%${phone10}`)
        .limit(1)
        .maybeSingle()
      existingContact = data
    }

    if (!existingContact && email) {
      const { data } = await admin
        .from('contacts')
        .select('id')
        .eq('organization_id', ORG_ID)
        .ilike('email', email.toLowerCase().trim())
        .limit(1)
        .maybeSingle()
      existingContact = data
    }

    let contact
    let isNew = false

    if (existingContact) {
      // 5a. ACTUALIZAR contacto existente
      const updateData: Record<string, unknown> = {
        contact_type: contactType,
        updated_at:   new Date().toISOString(),
      }
      if (company)        updateData.company        = company.trim()
      if (company_id)     updateData.company_id      = company_id
      if (position)       updateData.position        = position.trim()
      if (decision_level) updateData.decision_level  = decision_level.trim()
      if (ai_profile)     updateData.ai_profile      = ai_profile.trim()
      if (notes)          updateData.notes           = notes.trim()
      if (email)          updateData.email           = email.toLowerCase().trim()
      // Solo actualiza nombre si el existente es genérico (ej: número de teléfono)
      if (name && !name.match(/^\+?\d+$/)) updateData.full_name = name.trim()

      const { data, error } = await admin
        .from('contacts')
        .update(updateData)
        .eq('id', existingContact.id)
        .select(CONTACT_FIELDS)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      contact = data
    } else {
      // 5b. CREAR nuevo contacto
      isNew = true
      const insertData: Record<string, unknown> = {
        organization_id: ORG_ID,
        full_name:       name.trim(),
        contact_type:    contactType,
        status:          'active',
        source:          'mensajeria',
        primary_channel: phone ? 'whatsapp' : 'email',
        assigned_to:     ASSIGNED_TO,
        created_by:      ASSIGNED_TO,
      }
      if (phone)          { insertData.phone = phone; insertData.whatsapp = phone }
      if (email)          insertData.email          = email.toLowerCase().trim()
      if (company)        insertData.company        = company.trim()
      if (company_id)     insertData.company_id     = company_id
      if (position)       insertData.position       = position.trim()
      if (decision_level) insertData.decision_level = decision_level.trim()
      if (ai_profile)     insertData.ai_profile     = ai_profile.trim()
      if (notes)          insertData.notes          = notes.trim()

      const { data, error } = await admin
        .from('contacts')
        .insert(insertData)
        .select(CONTACT_FIELDS)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      contact = data
    }

    // 6. Sincronizar etiqueta en Chatwoot (no crítico si falla)
    if (conversation_id) {
      const newLabel  = CONTACT_TYPE_TO_LABEL[contactType]
      const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
      const accountId = process.env.CHATWOOT_ACCOUNT_ID
      const token     = process.env.CHATWOOT_API_TOKEN

      if (newLabel && baseUrl && accountId && token) {
        try {
          const convRes = await fetch(
            `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation_id}`,
            { headers: { api_access_token: token }, cache: 'no-store' }
          )
          if (convRes.ok) {
            const convData       = await convRes.json()
            const existingLabels: string[] = convData.labels ?? []
            // Conservar etiquetas que no son de tipo-contacto
            const otherLabels = existingLabels.filter(l => !CONTACT_TYPE_TO_LABEL[
              Object.entries(CONTACT_TYPE_TO_LABEL).find(([, v]) => v === l)?.[0] ?? ''
            ])
            await fetch(
              `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation_id}/labels`,
              {
                method:  'POST',
                headers: { api_access_token: token, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ labels: [...otherLabels, newLabel] }),
              }
            )
          }
        } catch {
          // Fallo silencioso — el contacto ya fue guardado en el CRM
        }
      }
    }

    return NextResponse.json({
      ok:      true,
      isNew,
      contact,
      lead_status,
      lead_score,
      contact_type: contactType,
    }, { status: isNew ? 201 : 200 })

  } catch (e) {
    console.error('[internal/upsert-lead]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
