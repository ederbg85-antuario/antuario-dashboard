// submit-lead — recibe los formularios de la web de Antuario (antuario.mx).
//
// 1) SIEMPRE registra el envío en la bitácora `web_form_submissions` (para que
//    NUNCA se pierda un lead, aunque la persona ya exista en el CRM), con la
//    atribución completa (source, form_id, UTMs, ref, prospect_id).
// 2) Inserta/actualiza el contacto en `contacts` (dedup por email/tel) para
//    alimentar el pipeline de ventas sin crear duplicados.
// 3) Si el envío trae `pid` (un prospecto de venta en frío que abrió su link
//    personal de la landing), lo PUENTEA: liga el contacto, avanza la etapa a
//    "interesado" (nunca la retrocede) y registra la respuesta en su bitácora.
//
// Desplegado con verify_jwt = false (endpoint público de formulario).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ORG_ID = 1
const ASSIGNED_TO = '684871ef-15a1-4c22-a7fa-af6c2dcbe726' // Eder Basilio

const INTEREST_LABELS: Record<string, string> = {
  marketing: 'Marketing digital integral',
  seo: 'SEO',
  performance: 'Performance Ads',
  web: 'Desarrollo web',
  redes: 'Redes sociales',
  branding: 'Branding y diseño',
  software: 'Software a la medida',
  ia: 'Inteligencia Artificial',
  plan_crecimiento: 'Plan de Crecimiento (venta en frío)',
  otro: 'Otro / no estoy seguro',
}

// Orden del pipeline de venta en frío (para no retroceder etapas).
const STAGE_ORDER = ['por_investigar', 'por_contactar', 'contactado', 'siguiendo', 'interesado', 'reunion_agendada', 'convertido']

// Fuentes de venta en frío permitidas como override (evita valores basura).
const ALLOWED_SOURCES = new Set([
  'formulario-web', 'landing-plan-crecimiento', 'tarjeta-qr', 'prospeccion-fria',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// UTM source → canal de la bitácora del prospecto.
function utmToChannel(utmSource: string): string | null {
  if (utmSource.startsWith('email')) return 'email'
  if (utmSource.startsWith('whatsapp')) return 'whatsapp'
  if (utmSource === 'tarjeta' || utmSource === 'visita') return 'visita'
  if (utmSource === 'linkedin') return 'linkedin'
  return null
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

const clean = (v: unknown) => String(v ?? '').trim()

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ success: false, message: 'Método no permitido' }, 405)

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return json({ success: false, message: 'JSON inválido' }, 400)

    const name = clean(body.name)
    const email = clean(body.email).toLowerCase()
    const company = clean(body.company)
    const phone = clean(body.phone)
    const interest = clean(body.interest)
    const message = clean(body.message)
    const sourceUrl = clean(body.source_url)

    // ── Atribución ──
    const source = ALLOWED_SOURCES.has(clean(body.source)) ? clean(body.source) : 'formulario-web'
    const formId = clean(body.form_id) || null
    const utmSource = clean(body.utm_source) || null
    const utmMedium = clean(body.utm_medium) || null
    const utmCampaign = clean(body.utm_campaign) || null
    const utmContent = clean(body.utm_content) || null
    const ref = clean(body.ref) || null
    const pidRaw = clean(body.pid)
    const pid = UUID_RE.test(pidRaw) ? pidRaw : null

    const errors: Record<string, string> = {}
    if (name.length < 2) errors.name = 'El nombre debe tener al menos 2 caracteres'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Correo electrónico inválido'
    if (!interest) errors.interest = 'Selecciona un servicio de interés'
    if (Object.keys(errors).length) return json({ success: false, errors }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const interesLabel = INTEREST_LABELS[interest] ?? interest
    const attribution = [utmSource, utmCampaign, ref].filter(Boolean).join(' · ')
    const notes = [
      `Servicio de interés: ${interesLabel}`,
      message ? `\n\nMensaje:\n${message}` : '',
      attribution ? `\n\nOrigen: ${attribution}` : '',
      sourceUrl ? `\n\nEnviado desde: ${sourceUrl}` : '',
    ].join('')

    const digits = phone.replace(/\D/g, '')
    const phone10 = digits.length >= 10 ? digits.slice(-10) : digits

    // ── 1) Upsert del contacto en el CRM (no crítico) ───────────────────────────
    let contactId: string | null = null
    try {
      let existing: { id: string; notes: string | null } | null = null
      {
        const { data } = await supabase
          .from('contacts').select('id, notes')
          .eq('organization_id', ORG_ID).ilike('email', email)
          .limit(1).maybeSingle()
        existing = data
      }
      if (!existing && phone10) {
        const { data } = await supabase
          .from('contacts').select('id, notes')
          .eq('organization_id', ORG_ID)
          .or(`phone.ilike.%${phone10},whatsapp.ilike.%${phone10}`)
          .limit(1).maybeSingle()
        existing = data
      }

      if (existing) {
        const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
        const merged = [existing.notes?.trim(), `— Nuevo mensaje web (${fecha}) —\n${notes}`]
          .filter(Boolean).join('\n\n')
        await supabase.from('contacts')
          .update({ notes: merged, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        contactId = existing.id
      } else {
        const { data } = await supabase.from('contacts').insert({
          organization_id: ORG_ID,
          full_name: name,
          email,
          phone: phone || null,
          whatsapp: phone || null,
          company: company || null,
          contact_type: 'lead_nuevo',
          status: 'active',
          source,
          primary_channel: phone ? 'whatsapp' : 'email',
          assigned_to: ASSIGNED_TO,
          created_by: ASSIGNED_TO,
          notes,
        }).select('id').single()
        contactId = data?.id ?? null
      }
    } catch (e) {
      console.error('contact upsert failed (continuamos con la bitácora):', e)
    }

    // ── 2) Puente con el prospecto de venta en frío (si vino ?pid=) ──────────────
    if (pid) {
      try {
        const { data: prospect } = await supabase
          .from('prospects').select('id, stage, contact_id')
          .eq('organization_id', ORG_ID).eq('id', pid)
          .maybeSingle()
        if (prospect) {
          const idx = STAGE_ORDER.indexOf(prospect.stage)
          const interesadoIdx = STAGE_ORDER.indexOf('interesado')
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (idx >= 0 && idx < interesadoIdx) patch.stage = 'interesado'
          if (!prospect.contact_id && contactId) patch.contact_id = contactId
          await supabase.from('prospects').update(patch).eq('id', pid)
          await supabase.from('prospect_activities').insert({
            organization_id: ORG_ID,
            prospect_id: pid,
            type: 'respuesta',
            channel: utmToChannel(utmSource ?? ''),
            direction: 'entrante',
            outcome: 'llenó la landing',
            body: `Plan de Crecimiento — ${company || name} solicitó reunión desde su link personal.`,
            created_by: ASSIGNED_TO,
          })
        }
      } catch (e) {
        console.error('prospect bridge failed (no crítico):', e)
      }
    }

    // ── 3) Bitácora: SIEMPRE registramos el envío ───────────────────────────────
    const { error: subErr } = await supabase.from('web_form_submissions').insert({
      organization_id: ORG_ID,
      contact_id: contactId,
      full_name: name,
      email,
      phone: phone || null,
      company: company || null,
      interest: interesLabel,
      message: message || null,
      source_url: sourceUrl || null,
      status: 'nuevo',
      source,
      form_id: formId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      ref,
      prospect_id: pid,
    })
    if (subErr) {
      console.error('submission insert error:', subErr)
      return json({ success: false, message: 'Error al procesar tu solicitud. Intenta de nuevo.' }, 500)
    }

    return json({ success: true })
  } catch (e) {
    console.error('submit-lead error:', e)
    return json({ success: false, message: 'Error interno del servidor.' }, 500)
  }
})
