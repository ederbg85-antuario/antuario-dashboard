import { workspace } from '@/lib/workspace'
import { isSameOrigin } from '@/lib/request-origin'
import { z } from 'zod'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function GET(req: Request) {
  const ctx = await workspace()
  if (!ctx?.can('sales')) return response({ error: 'Sin acceso' }, 403)
  const p = new URL(req.url).searchParams
  const id = p.get('id'),
    seller = p.get('seller'),
    week = p.get('week')
  if (
    (id && !z.uuid().safeParse(id).success) ||
    (seller && !z.uuid().safeParse(seller).success) ||
    (week && !z.iso.date().safeParse(week).success)
  )
    return response({ error: 'Filtro inválido' }, 400)
  if (p.get('view') === 'metrics') {
    const { data, error } = await ctx.db.rpc('outbound_metrics', { week_of: week, seller })
    return error
      ? response({ error: 'Indicadores no disponibles' }, error.code === '42501' ? 403 : 500)
      : response(data)
  }
  const { data, error } = await ctx.db.rpc('outbound_workspace', { b: id })
  if (error) return response({ error: 'Cartera no disponible' }, 500)
  if (id && !data.deals.length) return response({ error: 'Ficha no disponible' }, 404)
  return response(data)
}
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return response({ error: 'Origen inválido' }, 403)
  const ctx = await workspace()
  if (!ctx?.can('sales', true)) return response({ error: 'Sin permiso para gestionar' }, 403)
  const cmd = await req.json().catch(() => null)
  if (
    !cmd ||
    typeof cmd !== 'object' ||
    !z.uuid().safeParse(cmd.request).success ||
    typeof cmd.op !== 'string' ||
    JSON.stringify(cmd).length > 18000
  )
    return response({ error: 'Solicitud inválida' }, 400)
  const { data, error } = await ctx.db.rpc('outbound_command', { cmd })
  if (error)
    return response(
      {
        error: ['42501', 'P0001'].includes(error.code)
          ? error.message
          : 'Revisa los datos del formulario.',
      },
      error.code === '42501' ? 403 : 409,
    )
  return response({ id: data })
}
