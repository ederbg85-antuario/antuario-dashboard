/**
 * POST /api/internal/add-note
 *
 * Endpoint para que el Agente IA cree notas en el perfil de un contacto.
 * Puede crear notas de tipo: 'note', 'ai_summary', 'ai_action'
 *
 * Autenticación: Header  x-internal-secret: <N8N_INTERNAL_SECRET>
 *
 * Body esperado:
 * {
 *   contact_id:      string   — UUID del contacto
 *   phone?:          string   — Teléfono para buscar contacto (alternativa a contact_id)
 *   content:         string   — Contenido de la nota
 *   note_type?:      string   — Tipo: 'note' | 'ai_summary' | 'ai_action' (default: 'ai_summary')
 * }
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
      contact_id,
      phone,
      content,
      note_type = 'ai_summary',
    } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: 'El campo "content" es requerido' }, { status: 400 })
    }

    const admin = adminClient()

    // 3. Resolver contact_id — puede venir directo o por teléfono
    let resolvedContactId = contact_id

    if (!resolvedContactId && phone) {
      const digits  = phone.replace(/\D/g, '')
      const phone10 = digits.length >= 10 ? digits.slice(-10) : digits

      if (phone10) {
        const { data } = await admin
          .from('contacts')
          .select('id')
          .eq('organization_id', ORG_ID)
          .or(`phone.ilike.%${phone10},whatsapp.ilike.%${phone10}`)
          .limit(1)
          .maybeSingle()
        resolvedContactId = data?.id
      }
    }

    if (!resolvedContactId) {
      return NextResponse.json({ error: 'No se encontró el contacto. Proporciona contact_id o phone válido.' }, { status: 404 })
    }

    // 4. Verificar que el contacto existe y pertenece a la org
    const { data: existing } = await admin
      .from('contacts')
      .select('id')
      .eq('id', resolvedContactId)
      .eq('organization_id', ORG_ID)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Contacto no encontrado en esta organización' }, { status: 404 })
    }

    // 5. Crear la nota
    const { data: note, error } = await admin
      .from('contact_notes')
      .insert({
        contact_id:      resolvedContactId,
        organization_id: ORG_ID,
        content:         content.trim(),
        note_type:       note_type,
        created_by:      null, // null = creado por el agente IA
      })
      .select('id, contact_id, content, note_type, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, note }, { status: 201 })

  } catch (e) {
    console.error('[internal/add-note]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
