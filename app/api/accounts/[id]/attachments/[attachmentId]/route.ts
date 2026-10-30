import { NextResponse } from 'next/server'
import { z } from 'zod'
import { workspace } from '@/lib/workspace'
import { ACCOUNT_BUCKET, accountReadAccess } from '@/lib/client-accounts-access'

type Context = { params: Promise<{ id: string; attachmentId: string }> }
export async function GET(_request: Request, context: Context) {
  const { id, attachmentId } = await context.params
  if (
    !z.uuid().safeParse(id).success ||
    !z.uuid().safeParse(attachmentId).success
  )
    return NextResponse.json(
      { error: 'Adjunto no disponible.' },
      { status: 404 }
    )
  const c = await workspace()
  if (!c) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 })
  if (!accountReadAccess(c, id))
    return NextResponse.json(
      { error: 'Adjunto no disponible.' },
      { status: 404 }
    )
  const { data: row, error } = await c.db
    .from('client_account_records')
    .select('data')
    .eq('organization_id', c.orgId)
    .eq('account_id', id)
    .eq('kind', 'attachments')
    .eq('id', attachmentId)
    .maybeSingle()
  if (error || !row || row.data.upload_status !== 'ready')
    return NextResponse.json(
      { error: 'Adjunto no disponible.' },
      { status: 404 }
    )
  const signed = await c.db.storage
    .from(ACCOUNT_BUCKET)
    .createSignedUrl(row.data.storage_path, 60)
  if (signed.error || !signed.data?.signedUrl)
    return NextResponse.json(
      { error: 'No se pudo abrir el archivo privado.' },
      { status: 503 }
    )
  return NextResponse.json(
    {
      url: signed.data.signedUrl,
      expires_in: 60,
      name: row.data.name,
      mime_type: row.data.mime_type
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
