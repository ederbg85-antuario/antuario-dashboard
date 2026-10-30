import { z } from 'zod'
import { ACCOUNT_RECORD_KINDS } from './client-accounts-types'

const short = z.string().trim().min(1).max(240),
  note = z.string().trim().max(4000),
  nullable = z.string().trim().max(1000).nullable(),
  uuid = z.uuid().nullable(),
  money = z.number().finite().min(0).max(999999999),
  currency = z.enum(['MXN', 'USD'])
const date = z.iso.date(),
  health = z.enum(['healthy', 'attention', 'blocked', 'unknown'])
const sourceKey = z.string().trim().min(1).max(160)
const safeUrl = z
  .url()
  .refine(
    (v) => v.startsWith('https://') || v.startsWith('http://localhost'),
    'Usa HTTPS.'
  )
  .nullable()
const period = { period_from: date, period_to: date }
export const accountDataSchemas = {
  contacts: z
    .object({
      name: short,
      role: short,
      email: z.email().nullable(),
      access_location: nullable
    })
    .strict(),
  fronts: z
    .object({
      key: z.string().regex(/^[a-z0-9_-]{1,80}$/),
      title: short,
      health,
      status: short,
      next_action: note,
      owner_member_id: uuid
    })
    .strict(),
  milestones: z
    .object({
      date,
      title: short,
      description: note,
      kind: z.enum(['milestone', 'decision', 'delivery'])
    })
    .strict(),
  snapshots: z
    .object({
      date,
      period_to: date,
      source: z.enum(['ga4', 'search_console', 'google_ads', 'manual']),
      metric: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
      value: money,
      unit: z.enum(['count', 'MXN', 'USD', 'percent', 'position', 'seconds']),
      grain: z.enum(['daily', 'period']),
      channel: z.string().max(80).nullable(),
      campaign_id: uuid,
      evidence: note.min(1)
    })
    .strict()
    .superRefine((v, c) => {
      if (v.period_to < v.date)
        c.addIssue({
          code: 'custom',
          message: 'El periodo termina antes de iniciar.'
        })
      if (v.grain === 'daily' && v.period_to !== v.date)
        c.addIssue({
          code: 'custom',
          message: 'Una medición diaria cubre un solo día.'
        })
      if (v.unit === 'percent' && v.value > 100)
        c.addIssue({
          code: 'custom',
          message: 'Un porcentaje debe estar entre0y100.'
        })
    }),
  campaigns: z
    .object({
      name: short,
      platform: z.enum(['google_ads', 'meta', 'other']),
      status: z.enum(['active', 'paused', 'ended', 'draft']),
      daily_budget: money.nullable(),
      period_budget: money.nullable(),
      balance: money.nullable(),
      currency,
      ...period,
      evidence: note
    })
    .strict()
    .refine((v) => v.period_to >= v.period_from, 'Revisa las fechas.'),
  changes: z
    .object({
      date: z.iso.datetime({ offset: true }),
      platform: short,
      campaign_id: uuid,
      action: short,
      before: note,
      after: note,
      authorized_by: short,
      reason: note.min(1),
      evidence: note.min(1)
    })
    .strict(),
  templates: z
    .object({
      title: short,
      frequency: z.enum(['weekly', 'monthly', 'quarterly']),
      day: z.number().int().min(1).max(31),
      assignee_member_id: uuid,
      deliverable_kind: z.enum([
        'report',
        'invoice',
        'payment_receipt',
        'review',
        'support'
      ]),
      enabled: z.boolean()
    })
    .strict()
    .refine(
      (v) => v.frequency !== 'weekly' || v.day <= 7,
      'El día semanal va de1a7 (lunes a domingo).'
    ),
  instances: z
    .object({
      template_id: uuid,
      title: short,
      due_date: date,
      assignee_member_id: uuid,
      status: z.enum([
        'pending',
        'in_progress',
        'review',
        'delivered',
        'blocked'
      ]),
      evidence: note,
      blocked_reason: note,
      period_from: date.nullable(),
      period_to: date.nullable()
    })
    .strict()
    .superRefine((v, c) => {
      if (['review', 'delivered'].includes(v.status) && !v.evidence)
        c.addIssue({
          code: 'custom',
          message: 'Agrega evidencia para revisar o entregar.'
        })
      if (v.status === 'blocked' && !v.blocked_reason)
        c.addIssue({ code: 'custom', message: 'Indica el bloqueo.' })
      if (v.status !== 'blocked' && v.blocked_reason)
        c.addIssue({
          code: 'custom',
          message: 'Resuelve o conserva el estado bloqueado.'
        })
      if (v.period_from && v.period_to && v.period_to < v.period_from)
        c.addIssue({ code: 'custom', message: 'Revisa el periodo.' })
    }),
  attachments: z
    .object({
      name: short,
      mime_type: z.enum([
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp'
      ]),
      size: z
        .number()
        .int()
        .positive()
        .max(4 * 1024 * 1024),
      storage_path: z.string().min(1).max(600),
      instance_id: uuid,
      work_id: uuid,
      stage: z.enum(['draft', 'final']),
      version: z.number().int().min(1).max(9999),
      upload_status: z.enum(['pending', 'ready']).optional(),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional()
    })
    .strict(),
  invoices: z
    .object({
      title: short,
      uuid: z.uuid().nullable(),
      issued_date: date,
      due_date: date.nullable(),
      ...period,
      subtotal: money,
      vat: money,
      retention: money,
      total: money,
      currency,
      status: z.enum(['draft', 'issued', 'cancelled']),
      evidence: note
    })
    .strict()
    .superRefine((v, c) => {
      if (v.period_to < v.period_from)
        c.addIssue({ code: 'custom', message: 'Revisa el periodo.' })
      if (Math.abs(v.subtotal + v.vat - v.retention - v.total) > 0.02)
        c.addIssue({
          code: 'custom',
          message: 'El total no coincide con subtotal + IVA − retenciones.'
        })
      if (v.status !== 'draft' && !v.evidence)
        c.addIssue({
          code: 'custom',
          message: 'Agrega evidencia del documento.'
        })
    }),
  payments: z
    .object({
      invoice_id: uuid,
      date,
      amount: money.positive(),
      currency,
      receipt_status: z.enum(['not_required', 'pending', 'issued']),
      evidence: note.min(1)
    })
    .strict(),
  opportunities: z
    .object({
      title: short,
      stage: z.enum(['discovery', 'proposal', 'negotiation', 'won', 'lost']),
      development_estimate: money.nullable(),
      monthly_estimate: money.nullable(),
      currency,
      tax_basis: z.enum(['plus_vat', 'included', 'unconfirmed']),
      next_action: note,
      evidence: note
    })
    .strict()
}
export const accountProfileSchema = z
  .object({
    logo_url: safeUrl.optional(),
    services: z.array(short).max(30).optional(),
    monthly_fee: money.nullable().optional(),
    currency: currency.optional(),
    billing_cadence: z.enum(['monthly', 'weekly']).optional(),
    fee_basis: nullable.optional(),
    health: health.optional(),
    summary: note.optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No hay cambios.')
export const accountWriteSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save'),
      kind: z.enum(ACCOUNT_RECORD_KINDS),
      data: z.record(z.string(), z.unknown()),
      source_key: sourceKey,
      id: z.uuid().optional(),
      expected_updated_at: z.iso.datetime({ offset: true }).optional()
    })
    .strict()
    .refine(
      (v) => !v.id || !!v.expected_updated_at,
      'Actualiza la versión del registro.'
    ),
  z
    .object({
      action: z.literal('profile'),
      data: accountProfileSchema,
      expected_updated_at: z.iso.datetime({ offset: true })
    })
    .strict(),
  z
    .object({
      action: z.literal('snapshots'),
      items: z
        .array(
          accountDataSchemas.snapshots.safeExtend({ source_key: sourceKey })
        )
        .min(1)
        .max(200)
    })
    .strict(),
  z
    .object({
      action: z.literal('materialize'),
      period_from: date,
      period_to: date,
      template_id: z.uuid().optional()
    })
    .strict()
    .refine(
      (v) =>
        v.period_to >= v.period_from &&
        Date.parse(v.period_to) - Date.parse(v.period_from) <= 366 * 86400000,
      'Máximo un año de instancias.'
    )
])

/** Calendar dates are UTC-only arithmetic; the dates represent the Mexico City business calendar. */
export function recurringDates(
  frequency: 'weekly' | 'monthly' | 'quarterly',
  day: number,
  from: string,
  to: string
) {
  const out: string[] = [],
    start = new Date(from + 'T12:00:00Z'),
    end = new Date(to + 'T12:00:00Z')
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    day < 1 ||
    day > 31 ||
    (frequency === 'weekly' && day > 7)
  )
    return out
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const isoDay = d.getUTCDay() || 7,
      last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
      ).getUTCDate()
    const yes =
      frequency === 'weekly'
        ? isoDay === day
        : d.getUTCDate() === Math.min(day, last) &&
          (frequency === 'monthly' || d.getUTCMonth() % 3 === 0)
    if (yes) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Reports cover the previous complete cadence; invoices/support plan the current cadence. */
export function recurringCoverage(
  frequency: 'weekly' | 'monthly' | 'quarterly',
  kind: string,
  due: string
) {
  const d = new Date(due + 'T12:00:00Z'),
    previous = kind === 'report'
  let start: Date, end: Date
  if (frequency === 'weekly') {
    start = new Date(d)
    start.setUTCDate(
      start.getUTCDate() - ((start.getUTCDay() || 7) - 1) - (previous ? 7 : 0)
    )
    end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
  } else {
    const month =
        frequency === 'quarterly'
          ? Math.floor(d.getUTCMonth() / 3) * 3
          : d.getUTCMonth(),
      length = frequency === 'quarterly' ? 3 : 1
    start = new Date(
      Date.UTC(d.getUTCFullYear(), month - (previous ? length : 0), 1, 12)
    )
    end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + length, 0, 12)
    )
  }
  return {
    period_from: start.toISOString().slice(0, 10),
    period_to: end.toISOString().slice(0, 10)
  }
}
