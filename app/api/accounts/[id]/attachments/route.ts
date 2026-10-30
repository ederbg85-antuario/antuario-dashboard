import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { workspace } from '@/lib/workspace'
import { isSameOrigin } from '@/lib/request-origin'
import {
  ACCOUNT_BUCKET,
  accountReadAccess,
  flattenAccountRecord,
  validFileHeader,
  storedFileMatches
} from '@/lib/client-accounts-access'
import { accountDataSchemas } from '@/lib/client-accounts-schema'

type Context = { params: Promise<{ id: string }> }
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status })
const optionalId = (form: FormData, key: string) => {
  const value = form.get(key)
  return typeof value === 'string' && value ? value : null
}
const uploadFields = z.object({
  source_key: z.string().trim().min(1).max(160),
  instance_id: z.uuid().nullable(),
  work_id: z.uuid().nullable(),
  stage: z.enum(['draft', 'final']),
  version: z.coerce.number().int().min(1).max(9999)
})

export async function POST(request: Request, context: Context) {
  if (!isSameOrigin(request)) return fail('Origen no permitido.', 403)
  const { id } = await context.params
  if (!z.uuid().safeParse(id).success) return fail('Cuenta no disponible.', 404)
  const c = await workspace()
  if (!c) return fail('Inicia sesión.', 401)
  if (!accountReadAccess(c, id)) return fail('Cuenta no disponible.', 404)
  if (
    Number(request.headers.get('content-length') ?? 0) >
    4 * 1024 * 1024 + 32768
  )
    return fail('Máximo4MB por archivo.', 413)
  const { data: cap, error: capError } = await c.db.rpc(
    'account_capabilities',
    { account: id }
  )
  if (capError) return fail('No se pudo comprobar el permiso.', 503)
  if (!cap?.upload || cap.archived)
    return fail('Sin permiso para subir a esta cuenta.', 403)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail('Formulario inválido.')
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size < 1 || file.size > 4 * 1024 * 1024)
    return fail('Sube un PDF o una imagen de hasta4MB.')
  const fields = uploadFields.safeParse({
    source_key: form.get('source_key'),
    instance_id: optionalId(form, 'instance_id'),
    work_id: optionalId(form, 'work_id'),
    stage: form.get('stage') ?? 'draft',
    version: form.get('version') ?? '1'
  })
  if (!fields.success)
    return fail('Revisa la referencia, la versión y el encargo.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!validFileHeader(file.type, bytes))
    return fail(
      'El contenido no corresponde a un PDF, PNG, JPEG o WebP permitido.'
    )
  const sha256 = createHash('sha256').update(bytes).digest('hex'),
    meta = fields.data
  const { data: previous } = await c.db
    .from('client_account_records')
    .select('*')
    .eq('organization_id', c.orgId)
    .eq('account_id', id)
    .eq('kind', 'attachments')
    .eq('source_key', meta.source_key)
    .maybeSingle()
  if (previous) {
    if (
      previous.created_by !== c.user.id ||
      previous.data.sha256 !== sha256 ||
      previous.data.name !== file.name ||
      previous.data.size !== file.size ||
      previous.data.mime_type !== file.type ||
      previous.data.stage !== meta.stage ||
      previous.data.version !== meta.version ||
      previous.data.instance_id !== meta.instance_id ||
      previous.data.work_id !== meta.work_id
    )
      return fail('La referencia ya pertenece a otro archivo.', 409)
    if (previous.data.upload_status === 'ready')
      return NextResponse.json({
        attachment: flattenAccountRecord(previous),
        reused: true
      })
  }
  const filename =
    file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-180)
      .replace(/^[.]+/, 'archivo_') || 'archivo'
  const storage_path =
    previous?.data.storage_path ??
    `${c.orgId}/${id}/${c.user.id}/${crypto.randomUUID()}/${filename}`
  const input = accountDataSchemas.attachments.safeParse({
    name: file.name,
    mime_type: file.type,
    size: file.size,
    storage_path,
    instance_id: meta.instance_id,
    work_id: meta.work_id,
    stage: meta.stage,
    version: meta.version,
    upload_status: 'pending',
    sha256
  })
  if (!input.success) return fail('Los datos del archivo no son válidos.')
  let attachmentId = previous?.id as string | undefined
  if (!attachmentId) {
    const { data: reserved, error } = await c.db.rpc('save_account_records', {
      account: id,
      record_kind: 'attachments',
      records: [{ source_key: meta.source_key, data: input.data }]
    })
    if (error)
      return fail(
        error.code === '23505'
          ? 'La referencia ya pertenece a otro archivo.'
          : 'No se pudo registrar el adjunto. Elige un encargo propio o solicita asignación.',
        error.code === '23505' ? 409 : 403
      )
    attachmentId = reserved[0].id
  }
  const { error: uploadError } = await c.db.storage
    .from(ACCOUNT_BUCKET)
    .upload(storage_path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: '0'
    })
  if (
    uploadError &&
    String((uploadError as { statusCode?: string }).statusCode) !== '409'
  )
    return fail(
      'El archivo sigue pendiente. Reintenta con la misma referencia para completar la subida.',
      503
    )
  const { data: stored, error: readError } = await c.db.storage
    .from(ACCOUNT_BUCKET)
    .download(storage_path)
  if (readError || !stored)
    return fail(
      'No se pudo verificar el archivo privado. Reintenta con la misma referencia.',
      503
    )
  if (
    !(await storedFileMatches(stored, {
      sha256,
      size: file.size,
      mime_type: file.type
    }))
  )
    return fail(
      'El objeto existente no coincide con el archivo de esta referencia. Conserva el registro pendiente y usa una referencia nueva.',
      409
    )
  const { data: saved, error: saveError } = await c.db
    .from('client_account_records')
    .update({ data: { ...input.data, upload_status: 'ready' } })
    .eq('organization_id', c.orgId)
    .eq('account_id', id)
    .eq('id', attachmentId!)
    .select('*')
    .single()
  if (saveError || !saved)
    return fail(
      'Archivo recibido; falta confirmar su registro. Reintenta con la misma referencia.',
      503
    )
  return NextResponse.json(
    { attachment: flattenAccountRecord(saved), reused: !!previous },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
}
