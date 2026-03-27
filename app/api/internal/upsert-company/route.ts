/**
 * POST /api/internal/upsert-company
 *
 * Endpoint para que el Agente IA cree o actualice empresas en el CRM
 * y vincule contactos a ellas.
 *
 * Autenticación: Header  x-internal-secret: <N8N_INTERNAL_SECRET>
 *
 * Body esperado:
 * {
 *   name:          string   — Nombre de la empresa (requerido)
 *   website?:      string   — Sitio web
 *   industry?:     string   — Industria
 *   description?:  string   — Perfil/descripción generada por IA
 *   phone?:        string   — Teléfono de la empresa
 *   email?:        string   — Email de la empresa
 *   city?:         string   — Ciudad
 *   country?:      string   — País (default: Mexico)
 *   notes?:        string   — Notas adicionales
 *   contact_id?:   string   — UUID del contacto a vincular
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORG_ID      = 1
const ASSIGNED_TO = '684871ef-15a1-4c22-a7fa-af6c2dcbe726'

const COMPANY_FIELDS = 'id, name, website, industry, description, phone, email, city, country, notes, assigned_to, created_at'

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
      name,
      website,
      industry,
      description,
      phone,
      email,
      city,
      country,
      notes,
      contact_id,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El campo "name" es requerido' }, { status: 400 })
    }

    const admin = adminClient()

    // 3. Buscar empresa existente por nombre (fuzzy match)
    const { data: existingCompany } = await admin
      .from('companies')
      .select('id')
      .eq('organization_id', ORG_ID)
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle()

    let company
    let isNew = false

    if (existingCompany) {
      // 4a. ACTUALIZAR empresa existente
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (website)     updateData.website     = website.trim()
      if (industry)    updateData.industry    = industry.trim()
      if (description) updateData.description = description.trim()
      if (phone)       updateData.phone       = phone.trim()
      if (email)       updateData.email       = email.toLowerCase().trim()
      if (city)        updateData.city        = city.trim()
      if (country)     updateData.country     = country.trim()
      if (notes)       updateData.notes       = notes.trim()

      const { data, error } = await admin
        .from('companies')
        .update(updateData)
        .eq('id', existingCompany.id)
        .select(COMPANY_FIELDS)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      company = data
    } else {
      // 4b. CREAR nueva empresa
      isNew = true
      const insertData: Record<string, unknown> = {
        organization_id: ORG_ID,
        name:            name.trim(),
        assigned_to:     ASSIGNED_TO,
        created_by:      ASSIGNED_TO,
      }
      if (website)     insertData.website     = website.trim()
      if (industry)    insertData.industry    = industry.trim()
      if (description) insertData.description = description.trim()
      if (phone)       insertData.phone       = phone.trim()
      if (email)       insertData.email       = email.toLowerCase().trim()
      if (city)        insertData.city        = city.trim()
      if (country)     insertData.country     = country.trim()
      if (notes)       insertData.notes       = notes.trim()

      const { data, error } = await admin
        .from('companies')
        .insert(insertData)
        .select(COMPANY_FIELDS)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      company = data
    }

    // 5. Vincular contacto a la empresa (si se proporcionó contact_id)
    if (contact_id && company) {
      await admin
        .from('contacts')
        .update({ company_id: company.id, company: company.name, updated_at: new Date().toISOString() })
        .eq('id', contact_id)
        .eq('organization_id', ORG_ID)
    }

    return NextResponse.json({
      ok:    true,
      isNew,
      company,
    }, { status: isNew ? 201 : 200 })

  } catch (e) {
    console.error('[internal/upsert-company]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
