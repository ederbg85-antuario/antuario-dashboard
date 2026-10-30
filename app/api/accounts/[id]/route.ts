import { NextResponse } from 'next/server'
import { z } from 'zod'
import { workspace } from '@/lib/workspace'
import { isSameOrigin } from '@/lib/request-origin'
import {
  accountDataSchemas,
  accountWriteSchema,
  recurringDates,
  recurringCoverage
} from '@/lib/client-accounts-schema'
import {
  accountReadAccess,
  loadClientAccount
} from '@/lib/client-accounts-access'
import type {
  AccountRecordKind,
  AccountTemplate
} from '@/lib/client-accounts-types'

type Context = { params: Promise<{ id: string }> }
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status })
const resultError = (code: string | undefined) =>
  code === '23505' || code === '40001'
    ? fail(
        'La referencia ya existe con otro contenido o la versión cambió.',
        409
      )
    : fail(
        'No se pudo guardar. Revisa tus permisos, referencias y evidencia.',
        400
      )

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params
  if (!z.uuid().safeParse(id).success) return fail('Cuenta no disponible.', 404)
  const c = await workspace()
  if (!c) return fail('Inicia sesión.', 401)
  if (!accountReadAccess(c, id)) return fail('Cuenta no disponible.', 404)
  const bundle = await loadClientAccount(c, id)
  if (!bundle) return fail('Cuenta no disponible o migración pendiente.', 404)
  return NextResponse.json(bundle, {
    status: bundle.schema_ready && bundle.errors.length ? 503 : 200,
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

export async function POST(request: Request, context: Context) {
  if (!isSameOrigin(request)) return fail('Origen no permitido.', 403)
  const { id } = await context.params
  if (!z.uuid().safeParse(id).success) return fail('Cuenta no disponible.', 404)
  const c = await workspace()
  if (!c) return fail('Inicia sesión.', 401)
  if (!accountReadAccess(c, id)) return fail('Cuenta no disponible.', 404)
  if (Number(request.headers.get('content-length') ?? 0) > 256000)
    return fail('Máximo256KB por lote.', 413)
  let raw: string, input: unknown
  try {
    raw = await request.text()
    if (new TextEncoder().encode(raw).length > 256000)
      return fail('Máximo256KB por lote.', 413)
    input = JSON.parse(raw)
  } catch {
    return fail('Solicitud inválida.')
  }
  const parsed = accountWriteSchema.safeParse(input)
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Revisa los campos.')
  const body = parsed.data
  const [
    { data: account, error: accountError },
    { data: cap, error: capError }
  ] = await Promise.all([
    c.db
      .from('client_account_profiles')
      .select('*')
      .eq('organization_id', c.orgId)
      .eq('id', id)
      .maybeSingle(),
    c.db.rpc('account_capabilities', { account: id })
  ])
  if (accountError || !account)
    return fail('Cuenta no disponible o migración pendiente.', 404)
  if (capError || !cap) return fail('No se pudo comprobar el permiso.', 503)
  if (cap.archived) return fail('La cuenta archivada es de solo lectura.', 403)
  if (body.action === 'profile') {
    if (!cap.manage)
      return fail(
        'Solo dirección de cuenta o coordinación edita la ficha.',
        403
      )
    const { data, error } = await c.db
      .from('client_account_profiles')
      .update(body.data)
      .eq('organization_id', c.orgId)
      .eq('id', id)
      .eq('updated_at', body.expected_updated_at)
      .select('*')
      .maybeSingle()
    if (error) return resultError(error.code)
    return data
      ? NextResponse.json({ account: data })
      : fail('La ficha cambió. Actualiza antes de guardar.', 409)
  }
  if (body.action === 'materialize') {
    if (!cap.manage)
      return fail(
        'Solo dirección de cuenta o coordinación genera encargos.',
        403
      )
    let query = c.db
      .from('client_account_records')
      .select('id,data')
      .eq('organization_id', c.orgId)
      .eq('account_id', id)
      .eq('kind', 'templates')
      .eq('data->>enabled', 'true')
      .limit(100)
    if (body.template_id) query = query.eq('id', body.template_id)
    const { data: templates, error } = await query
    if (error) return fail('No se pudieron leer las plantillas.', 503)
    const records = (templates ?? []).flatMap((row) => {
      const template = { ...row.data, id: row.id } as AccountTemplate
      return recurringDates(
        template.frequency,
        template.day,
        body.period_from,
        body.period_to
      ).map((date) => ({
        source_key: `recurrence:${template.id}:${date}`,
        data: {
          template_id: template.id,
          title: template.title,
          due_date: date,
          assignee_member_id: template.assignee_member_id,
          status: 'pending',
          evidence: '',
          blocked_reason: '',
          ...recurringCoverage(
            template.frequency,
            template.deliverable_kind,
            date
          )
        }
      }))
    })
    if (records.length > 250)
      return fail('Genera como máximo250encargos por solicitud.')
    if (!records.length)
      return NextResponse.json({ items: [], created: 0, reused: 0 })
    const { data: existing, error: existingError } = await c.db
      .from('client_account_records')
      .select('id,source_key,updated_at')
      .eq('organization_id', c.orgId)
      .eq('account_id', id)
      .eq('kind', 'instances')
      .in(
        'source_key',
        records.map((row) => row.source_key)
      )
    if (existingError)
      return fail('No se pudieron comprobar las instancias existentes.', 503)
    const known = new Set((existing ?? []).map((row) => row.source_key))
    const pending = records.filter((row) => !known.has(row.source_key))
    const reused = (existing ?? []).map((row) => ({
      id: row.id,
      updated_at: row.updated_at,
      reused: true
    }))
    if (!pending.length)
      return NextResponse.json({
        items: reused,
        created: 0,
        reused: reused.length
      })
    const { data: created, error: saveError } = await c.db.rpc(
      'save_account_records',
      { account: id, record_kind: 'instances', records: pending }
    )
    if (saveError) return resultError(saveError.code)
    const items = [...created, ...reused]
    return NextResponse.json(
      {
        items,
        created: items.filter((item: { reused: boolean }) => !item.reused)
          .length,
        reused: items.filter((item: { reused: boolean }) => item.reused).length
      },
      { status: 201 }
    )
  }
  let kind: AccountRecordKind,
    records: { source_key: string; data: Record<string, unknown> }[]
  if (body.action === 'snapshots') {
    if (!cap.manage)
      return fail(
        'Solo dirección de cuenta o coordinación envía métricas.',
        403
      )
    kind = 'snapshots'
    records = body.items.map(({ source_key, ...data }) => ({
      source_key,
      data
    }))
  } else {
    kind = body.kind
    if (kind === 'attachments')
      return fail('Usa el endpoint privado de adjuntos.')
    if (kind === 'invoices' || kind === 'payments') {
      if (!cap.manage_billing)
        return fail(
          'Necesitas permiso vigente de Finanzas o Contabilidad.',
          403
        )
    } else if (
      !cap.manage &&
      !(kind === 'instances' && cap.write_own_instances && body.id)
    )
      return fail(
        'Solo puedes actualizar el avance de tus propios encargos.',
        403
      )
    const valid = accountDataSchemas[kind].safeParse(body.data)
    if (!valid.success)
      return fail(valid.error.issues[0]?.message ?? 'Revisa los campos.')
    if (body.id) {
      const { data: existing } = await c.db
        .from('client_account_records')
        .select('id,data,source_key')
        .eq('organization_id', c.orgId)
        .eq('account_id', id)
        .eq('kind', kind)
        .eq('id', body.id)
        .maybeSingle()
      if (!existing) return fail('Registro no disponible.', 404)
      if (existing.source_key !== body.source_key)
        return fail('La referencia del registro es inmutable.', 409)
      if (
        kind === 'instances' &&
        !cap.manage &&
        existing.data.assignee_member_id !== c.seat?.id
      )
        return fail('Solo puedes actualizar tus propios encargos.', 403)
      const { data, error } = await c.db
        .from('client_account_records')
        .update({ data: valid.data })
        .eq('organization_id', c.orgId)
        .eq('account_id', id)
        .eq('id', body.id)
        .eq('updated_at', body.expected_updated_at!)
        .select('*')
        .maybeSingle()
      if (error) return resultError(error.code)
      return data
        ? NextResponse.json({
            id: data.id,
            updated_at: data.updated_at,
            reused: false
          })
        : fail('El registro cambió. Actualiza antes de guardar.', 409)
    }
    records = [{ source_key: body.source_key, data: valid.data }]
  }
  const { data, error } = await c.db.rpc('save_account_records', {
    account: id,
    record_kind: kind,
    records
  })
  if (error) return resultError(error.code)
  return NextResponse.json(
    body.action === 'snapshots' ? { items: data } : data[0],
    { status: 201 }
  )
}
