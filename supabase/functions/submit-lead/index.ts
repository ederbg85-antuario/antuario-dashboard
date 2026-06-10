// submit-lead — recibe los formularios de la web de Antuario (antuario.mx/contacto)
// y los guarda en la tabla `contacts` del CRM. La llave de servicio vive dentro
// de Supabase (no se expone), por eso la web no necesita variables en Vercel.
//
// Desplegado con verify_jwt = false (endpoint público de formulario de contacto).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CRM de Antuario (organización de Eder) ───────────────────────────────────
const ORG_ID = 1
const ASSIGNED_TO = '684871ef-15a1-4c22-a7fa-af6c2dcbe726' // Eder Basilio

// Etiqueta legible del servicio de interés a partir del valor del formulario
const INTEREST_LABELS: Record<string, string> = {
  marketing: 'Marketing digital integral',
  seo: 'SEO',
  performance: 'Performance Ads',
  web: 'Desarrollo web',
  redes: 'Redes sociales',
  branding: 'Branding y diseño',
  software: 'Software a la medida',
  ia: 'Inteligencia Artificial',
  otro: 'Otro / no estoy seguro',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ success: false, message: 'Método no permitido' }, 405)

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return json({ success: false, message: 'JSON inválido' }, 400)

    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const company = String(body.company ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const interest = String(body.interest ?? '').trim()
    const message = String(body.message ?? '').trim()
    const sourceUrl = String(body.source_url ?? '').trim()

    // Validación mínima (mismo contrato que el formulario web)
    const errors: Record<string, string> = {}
    if (name.length < 2) errors.name = 'El nombre debe tener al menos 2 caracteres'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Correo electrónico inválido'
    if (!interest) errors.interest = 'Selecciona un servicio de interés'
    if (Object.keys(errors).length) return json({ success: false, errors }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const interesLabel = INTEREST_LABELS[interest] ?? interest
    const notes = [
      `Servicio de interés: ${interesLabel}`,
      message ? `\n\nMensaje:\n${message}` : '',
      sourceUrl ? `\n\nEnviado desde: ${sourceUrl}` : '',
    ].join('')

    // Normaliza el teléfono a sus últimos 10 dígitos para deduplicar
    const digits = phone.replace(/\D/g, '')
    const phone10 = digits.length >= 10 ? digits.slice(-10) : digits

    // ¿El contacto ya existe en la organización? (por correo o teléfono)
    let existing: { id: string; notes: string | null } | null = null
    {
      const { data } = await supabase
        .from('contacts')
        .select('id, notes')
        .eq('organization_id', ORG_ID)
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      existing = data
    }
    if (!existing && phone10) {
      const { data } = await supabase
        .from('contacts')
        .select('id, notes')
        .eq('organization_id', ORG_ID)
        .or(`phone.ilike.%${phone10},whatsapp.ilike.%${phone10}`)
        .limit(1)
        .maybeSingle()
      existing = data
    }

    if (existing) {
      // Contacto repetido: anexa el nuevo mensaje sin pisar las notas previas
      const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
      const merged = [existing.notes?.trim(), `— Nuevo mensaje web (${fecha}) —\n${notes}`]
        .filter(Boolean)
        .join('\n\n')
      const { error } = await supabase
        .from('contacts')
        .update({ notes: merged, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) {
        console.error('update error:', error)
        return json({ success: false, message: 'Error al procesar tu solicitud. Intenta de nuevo.' }, 500)
      }
      return json({ success: true })
    }

    const { error } = await supabase.from('contacts').insert({
      organization_id: ORG_ID,
      full_name: name,
      email,
      phone: phone || null,
      whatsapp: phone || null,
      company: company || null,
      contact_type: 'lead_nuevo',
      status: 'active',
      source: 'formulario-web',
      primary_channel: phone ? 'whatsapp' : 'email',
      assigned_to: ASSIGNED_TO,
      created_by: ASSIGNED_TO,
      notes,
    })
    if (error) {
      console.error('insert error:', error)
      return json({ success: false, message: 'Error al procesar tu solicitud. Intenta de nuevo.' }, 500)
    }
    return json({ success: true })
  } catch (e) {
    console.error('submit-lead error:', e)
    return json({ success: false, message: 'Error interno del servidor.' }, 500)
  }
})
