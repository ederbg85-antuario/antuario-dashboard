/**
 * POST /api/internal/assign-conversation
 *
 * Endpoint para que el Agente IA asigne una conversación de Chatwoot
 * a un agente humano y se pause a sí mismo.
 *
 * Autenticación: Header  x-internal-secret: <N8N_INTERNAL_SECRET>
 *
 * Body esperado:
 * {
 *   conversation_id:   number   — ID de la conversación en Chatwoot
 *   assignee_id?:      number   — ID del agente humano en Chatwoot (opcional, si no se pasa se usa round-robin)
 *   pause_bot?:        boolean  — Si true, agrega label 'agente-ia-pausado' (default: true)
 *   team_id?:          number   — ID del equipo en Chatwoot para asignación por equipo
 * }
 */

import { NextRequest, NextResponse } from 'next/server'

const BOT_DISABLED_LABEL = 'agente-ia-pausado'

function chatwootConfig() {
  const baseUrl   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '')
  const accountId = process.env.CHATWOOT_ACCOUNT_ID
  const token     = process.env.CHATWOOT_API_TOKEN
  if (!baseUrl || !accountId || !token) return null
  return { baseUrl, accountId, token }
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
      conversation_id,
      assignee_id,
      pause_bot = true,
      team_id,
    } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id es requerido' }, { status: 400 })
    }

    const config = chatwootConfig()
    if (!config) {
      return NextResponse.json({ error: 'Chatwoot no configurado' }, { status: 500 })
    }

    const { baseUrl, accountId, token } = config
    const headers = { api_access_token: token, 'Content-Type': 'application/json' }
    const baseConvUrl = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation_id}`

    // 3. Asignar la conversación a un agente humano
    const assignPayload: Record<string, unknown> = {}
    if (assignee_id) assignPayload.assignee_id = assignee_id
    if (team_id)     assignPayload.team_id     = team_id

    // Si no se pasa ni assignee_id ni team_id, solo pausamos el bot
    if (assignee_id || team_id) {
      const assignRes = await fetch(`${baseConvUrl}/assignments`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(assignPayload),
      })

      if (!assignRes.ok) {
        const err = await assignRes.json().catch(() => ({}))
        return NextResponse.json({
          error: `Error al asignar conversación: ${err?.message ?? assignRes.statusText}`,
        }, { status: assignRes.status })
      }
    }

    // 4. Pausar el bot (agregar label agente-ia-pausado)
    let labelsSynced = false
    if (pause_bot) {
      try {
        const convRes = await fetch(baseConvUrl, {
          headers: { api_access_token: token },
          cache: 'no-store',
        })

        if (convRes.ok) {
          const convData = await convRes.json()
          const existingLabels: string[] = convData.labels ?? []

          if (!existingLabels.includes(BOT_DISABLED_LABEL)) {
            const newLabels = [...existingLabels, BOT_DISABLED_LABEL]
            await fetch(`${baseConvUrl}/labels`, {
              method:  'POST',
              headers,
              body:    JSON.stringify({ labels: newLabels }),
            })
          }
          labelsSynced = true
        }
      } catch {
        // No crítico — la asignación ya se hizo
      }
    }

    return NextResponse.json({
      ok: true,
      conversation_id,
      assigned_to: assignee_id ?? team_id ?? null,
      bot_paused: pause_bot && labelsSynced,
    })

  } catch (e) {
    console.error('[internal/assign-conversation]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
