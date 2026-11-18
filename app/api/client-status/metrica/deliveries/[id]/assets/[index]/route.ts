import { createAdminClient } from '@/lib/supabase/server'
import { bridgeAuthorized, clientDeliveryArtifact, METRICA_CLIENT_ID, METRICA_ORG_ID } from '@/lib/metrica-operations'
import { deliveryArtifactSchema, deliveryFilename, DELIVERY_BUCKET } from '@/lib/task-deliveries'
import { storedFileMatches } from '@/lib/client-accounts-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const error = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  if (!process.env.METRICA_OPERATIONS_BRIDGE_KEY) return error(503)
  if (!bridgeAuthorized(process.env.METRICA_OPERATIONS_BRIDGE_KEY, request.headers.get('authorization'))) return error(401)
  const { id, index } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !/^[0-7]$/.test(index)) return error(404)
  const query = new URL(request.url).searchParams
  if ([...query.keys()].some(k => k !== 'download') || (query.has('download') && query.get('download') !== '1')) return error(400)
  try {
    const db = createAdminClient()
    const d = await db.from('task_deliveries').select('task_id,artifacts').eq('organization_id', METRICA_ORG_ID).eq('id', id).maybeSingle()
    if (d.error) return error(503)
    if (!d.data) return error(404)
    const task = await db.from('tasks').select('id,project_id').eq('organization_id', METRICA_ORG_ID).eq('id', d.data.task_id).maybeSingle()
    if (task.error) return error(503)
    if (!task.data) return error(404)
    const project = await db.from('projects').select('id').eq('organization_id', METRICA_ORG_ID).eq('client_id', METRICA_CLIENT_ID).eq('id', task.data.project_id).maybeSingle()
    if (project.error) return error(503)
    if (!project.data) return error(404)
    const parsed = deliveryArtifactSchema.safeParse(d.data.artifacts?.[Number(index)])
    if (!parsed.success || !clientDeliveryArtifact(parsed.data) || parsed.data.kind === 'link') return error(404)
    const a = parsed.data
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `${query.get('download') === '1' ? 'attachment' : 'inline'}; filename="${deliveryFilename(a.name)}"; filename*=UTF-8''${encodeURIComponent(a.name)}` }
    if (a.kind === 'document') return new Response(a.text, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
    if (!a.path.startsWith(`${METRICA_ORG_ID}/${task.data.id}/`)) return error(404)
    const file = await db.storage.from(DELIVERY_BUCKET).download(a.path)
    if (file.error || !file.data || file.data.size > 4 * 1024 * 1024 || !(await storedFileMatches(file.data, { sha256: a.sha256, size: a.size, mime_type: a.mime }))) return error(503)
    return new Response(await file.data.arrayBuffer(), { headers: { ...headers, 'Content-Type': a.mime } })
  } catch { return error(503) }
}
