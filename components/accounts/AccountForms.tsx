'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type {
  AccountBundle,
  AccountRecordKind
} from '@/lib/client-accounts-types'
import { AccountDialog } from './AccountPrimitives'
import {useFinancialPrivacy,FinancialPrivacyToggle} from '@/components/privacy/FinancialPrivacy'
export type FormField = {
  key: string
  label: string
  type?:
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'email'
    | 'url'
    | 'select'
    | 'checkbox'
  required?: boolean
  wide?: boolean
  options?: { value: string; label: string }[]
  hint?: string
  step?: string
  min?: number
}
export type AccountForm = {
  title: string
  kind: AccountRecordKind | 'profile'
  fields: FormField[]
  values?: Record<string, unknown>
  id?: string
  expected_updated_at?: string
  source_key?: string
  note?: string
}
export type AccountSave = (
  kind: AccountRecordKind | 'profile',
  data: Record<string, unknown>,
  id?: string,
  expectedUpdatedAt?: string,
  sourceKey?: string
) => Promise<boolean>
export function RecordForm({
  form,
  save,
  close
}: {
  form: AccountForm
  save: AccountSave
  close: () => void
}) {
  const {visible:financialVisible}=useFinancialPrivacy()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sourceKey] = useState(() => form.source_key ?? crypto.randomUUID())
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget),
      data: Record<string, unknown> =
        form.kind === 'fronts'
          ? { owner_member_id: form.values?.owner_member_id ?? null }
          : form.kind === 'instances'
            ? {
                template_id: form.values?.template_id ?? null,
                period_from: form.values?.period_from ?? null,
                period_to: form.values?.period_to ?? null
              }
            : {}
    const nullableFields = new Set([
      'email',
      'access_location',
      'logo_url',
      'fee_basis',
      'uuid',
      'due_date',
      'invoice_id',
      'assignee_member_id',
      'owner_member_id',
      'campaign_id'
    ])
    for (const field of form.fields) {
      const raw = String(f.get(field.key) ?? '').trim()
      data[field.key] =
        field.type === 'checkbox'
          ? f.has(field.key)
          : field.type === 'number'
            ? raw === ''
              ? null
              : Number(raw)
            : field.type === 'datetime-local'
              ? raw
                ? new Date(raw).toISOString()
                : null
              : raw === '' && nullableFields.has(field.key)
                ? null
                : raw
    }
    if (form.kind === 'profile' && typeof data.services === 'string')
      data.services = data.services
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    setBusy(true)
    setError('')
    try {
      if (
        await save(
          form.kind,
          data,
          form.id,
          form.expected_updated_at,
          sourceKey
        )
      )
        close()
      else setError('No se pudo guardar. Revisa los datos e intenta de nuevo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }
  const financialForm=form.fields.some(field=>/fee|budget|balance|amount|subtotal|total|vat|retention|estimate/.test(field.key))
  if(financialForm&&!financialVisible)return <AccountDialog title={form.title} close={close}><p className="account-form-note">Muestra los importes para consultar o editar este registro.</p><FinancialPrivacyToggle/></AccountDialog>
  return (
    <AccountDialog
      title={form.title}
      locked={busy}
      close={() => {
        if (!busy) close()
      }}
    >
      {form.note && <p className="account-form-note">{form.note}</p>}
      <form onSubmit={submit} className="account-form">
        {form.fields.map((field) => (
          <label
            className={`account-field ${field.wide ? 'is-wide' : ''}`}
            key={field.key}
          >
            <span>
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            {field.type === 'textarea' ? (
              <textarea
                name={field.key}
                rows={3}
                required={field.required}
                defaultValue={String(form.values?.[field.key] ?? '')}
              />
            ) : field.type === 'select' ? (
              <select
                name={field.key}
                required={field.required}
                defaultValue={String(
                  form.values?.[field.key] ?? field.options?.[0]?.value ?? ''
                )}
              >
                <option value="" disabled={field.required}>
                  Seleccionar
                </option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'checkbox' ? (
              <input
                type="checkbox"
                name={field.key}
                defaultChecked={!!form.values?.[field.key]}
              />
            ) : (
              <input
                name={field.key}
                type={field.type ?? 'text'}
                required={field.required}
                defaultValue={String(form.values?.[field.key] ?? '')}
                step={
                  field.step ?? (field.type === 'number' ? '0.01' : undefined)
                }
                min={field.min}
              />
            )}{' '}
            {field.hint && <small>{field.hint}</small>}
          </label>
        ))}
        {error && (
          <p className="account-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="account-form-actions">
          <button
            className="account-action"
            type="button"
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="account-action is-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </AccountDialog>
  )
}
const healthOptions = [
  { value: 'healthy', label: 'Al día' },
  { value: 'attention', label: 'Revisar' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'unknown', label: 'Por verificar' }
]
const platformOptions = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'meta', label: 'Meta' },
  { value: 'other', label: 'Otra' }
]
export function accountForm(
  kind: AccountRecordKind | 'profile',
  data: AccountBundle,
  values?: Record<string, unknown>
): AccountForm {
  const members = (
    data.assignable_members?.length
      ? data.assignable_members.map((member) => ({
          value: member.id,
          label: `${member.name} · ${member.position}`
        }))
      : [
          {
            value: data.account.director_member_id ?? '',
            label: data.account.director_name ?? 'Director de cuenta'
          },
          ...(data.capabilities.member_id &&
          data.capabilities.member_id !== data.account.director_member_id
            ? [{ value: data.capabilities.member_id, label: 'Mi usuario' }]
            : [])
        ]
  ).filter((member) => member.value)
  const titles: Partial<Record<AccountRecordKind | 'profile', string>> = {
    profile: 'Editar cuenta',
    contacts: 'Contacto y acceso',
    fronts: 'Actualizar frente',
    milestones: 'Hito o decisión',
    campaigns: 'Campaña y presupuesto',
    changes: 'Cambio de canal',
    templates: 'Encargo recurrente',
    instances: 'Nuevo encargo',
    invoices: 'Registrar factura',
    payments: 'Registrar pago',
    opportunities: 'Oportunidad comercial'
  }
  const fields: Partial<Record<AccountRecordKind | 'profile', FormField[]>> = {
    profile: [
      {
        key: 'summary',
        label: 'Próximo paso de la cuenta',
        type: 'textarea',
        wide: true
      },
      {
        key: 'services',
        label: 'Servicios contratados',
        hint: 'Separados por coma',
        wide: true
      },
      {
        key: 'monthly_fee',
        label:
          data.account.billing_cadence === 'weekly'
            ? 'Pago semanal de referencia'
            : 'Iguala mensual de referencia',
        type: 'number',
        min: 0
      },
      {
        key: 'fee_basis',
        label: 'Acuerdo de pago',
        hint: 'Ejemplo: $2,500 cada sábado'
      },
      {
        key: 'billing_cadence',
        label: 'Frecuencia de pago',
        type: 'select',
        options: [
          { value: 'monthly', label: 'Mensual' },
          { value: 'weekly', label: 'Semanal' }
        ],
        required: true
      },
      { key: 'health', label: 'Salud', type: 'select', options: healthOptions },
      { key: 'logo_url', label: 'URL del logo', type: 'url' }
    ],
    contacts: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'role', label: 'Rol', required: true },
      { key: 'email', label: 'Correo', type: 'email' },
      {
        key: 'access_location',
        label: 'Dónde vive el acceso',
        wide: true,
        hint: 'Solo referencia al gestor seguro o responsable. Nunca una contraseña.'
      }
    ],
    fronts: [
      { key: 'key', label: 'Clave del frente', required: true },
      { key: 'title', label: 'Frente', required: true },
      {
        key: 'health',
        label: 'Semáforo',
        type: 'select',
        options: healthOptions,
        required: true
      },
      { key: 'status', label: 'Estado actual', required: true },
      {
        key: 'next_action',
        label: 'Siguiente acción',
        type: 'textarea',
        wide: true
      },
      {
        key: 'owner_member_id',
        label: 'Responsable del frente',
        type: 'select',
        options: members
      }
    ],
    milestones: [
      { key: 'date', label: 'Fecha', type: 'date', required: true },
      {
        key: 'kind',
        label: 'Tipo',
        type: 'select',
        options: [
          { value: 'milestone', label: 'Hito' },
          { value: 'decision', label: 'Decisión' },
          { value: 'delivery', label: 'Entrega' }
        ],
        required: true
      },
      { key: 'title', label: 'Título', required: true, wide: true },
      { key: 'description', label: 'Detalle', type: 'textarea', wide: true }
    ],
    campaigns: [
      { key: 'name', label: 'Campaña', required: true },
      {
        key: 'platform',
        label: 'Plataforma',
        type: 'select',
        options: platformOptions,
        required: true
      },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          { value: 'active', label: 'Activa' },
          { value: 'paused', label: 'Pausada' },
          { value: 'ended', label: 'Finalizada' },
          { value: 'draft', label: 'Borrador' }
        ],
        required: true
      },
      {
        key: 'currency',
        label: 'Moneda',
        type: 'select',
        options: [
          { value: 'MXN', label: 'MXN' },
          { value: 'USD', label: 'USD' }
        ],
        required: true
      },
      {
        key: 'daily_budget',
        label: 'Presupuesto diario',
        type: 'number',
        min: 0
      },
      {
        key: 'period_budget',
        label: 'Presupuesto del periodo',
        type: 'number',
        min: 0
      },
      {
        key: 'balance',
        label: 'Saldo disponible confirmado',
        type: 'number',
        min: 0
      },
      { key: 'period_from', label: 'Inicio', type: 'date', required: true },
      { key: 'period_to', label: 'Cierre', type: 'date', required: true },
      {
        key: 'evidence',
        label: 'Fuente o evidencia',
        required: true,
        wide: true
      }
    ],
    changes: [
      {
        key: 'date',
        label: 'Fecha y hora',
        type: 'datetime-local',
        required: true
      },
      {
        key: 'platform',
        label: 'Plataforma',
        type: 'select',
        options: platformOptions,
        required: true
      },
      {
        key: 'campaign_id',
        label: 'Campaña',
        type: 'select',
        options: data.campaigns.map((c) => ({ value: c.id, label: c.name }))
      },
      { key: 'action', label: 'Acción realizada', required: true },
      { key: 'before', label: 'Antes', required: true },
      { key: 'after', label: 'Después', required: true },
      { key: 'authorized_by', label: 'Quién autorizó', required: true },
      {
        key: 'reason',
        label: 'Motivo',
        type: 'textarea',
        wide: true,
        required: true
      },
      { key: 'evidence', label: 'Evidencia', required: true, wide: true }
    ],
    templates: [
      { key: 'title', label: 'Encargo', required: true, wide: true },
      {
        key: 'frequency',
        label: 'Frecuencia',
        type: 'select',
        options: [
          { value: 'weekly', label: 'Semanal' },
          { value: 'monthly', label: 'Mensual' },
          { value: 'quarterly', label: 'Trimestral' }
        ],
        required: true
      },
      {
        key: 'day',
        label: 'Día de ejecución',
        type: 'number',
        min: 1,
        step: '1',
        required: true,
        hint: 'Semanal: 1 lunes–7 domingo. Mensual/trimestral: día del mes.'
      },
      {
        key: 'assignee_member_id',
        label: 'Responsable',
        type: 'select',
        options: members
      },
      {
        key: 'deliverable_kind',
        label: 'Tipo de entrega',
        type: 'select',
        options: [
          { value: 'report', label: 'Reporte' },
          { value: 'invoice', label: 'Factura' },
          { value: 'payment_receipt', label: 'Complemento de pago' },
          { value: 'review', label: 'Revisión' },
          { value: 'support', label: 'Soporte' }
        ],
        required: true
      },
      { key: 'enabled', label: 'Plantilla activa', type: 'checkbox' }
    ],
    instances: [
      { key: 'title', label: 'Encargo', required: true, wide: true },
      {
        key: 'due_date',
        label: 'Fecha de entrega',
        type: 'date',
        required: true
      },
      {
        key: 'assignee_member_id',
        label: 'Responsable',
        type: 'select',
        options: members
      },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          { value: 'pending', label: 'Por hacer' },
          { value: 'in_progress', label: 'En curso' },
          { value: 'review', label: 'En revisión' },
          { value: 'delivered', label: 'Entregado' },
          { value: 'blocked', label: 'Bloqueado' }
        ],
        required: true
      },
      {
        key: 'evidence',
        label: 'Entregable o evidencia',
        wide: true,
        hint: 'Obligatorio para entregar'
      },
      {
        key: 'blocked_reason',
        label: 'Motivo de bloqueo',
        type: 'textarea',
        wide: true
      }
    ],
    invoices: [
      { key: 'title', label: 'Concepto', required: true, wide: true },
      { key: 'uuid', label: 'UUID del CFDI' },
      {
        key: 'issued_date',
        label: 'Fecha de emisión',
        type: 'date',
        required: true
      },
      { key: 'due_date', label: 'Vencimiento', type: 'date' },
      {
        key: 'period_from',
        label: 'Periodo desde',
        type: 'date',
        required: true
      },
      {
        key: 'period_to',
        label: 'Periodo hasta',
        type: 'date',
        required: true
      },
      {
        key: 'subtotal',
        label: 'Subtotal',
        type: 'number',
        required: true,
        min: 0
      },
      { key: 'vat', label: 'IVA', type: 'number', required: true, min: 0 },
      {
        key: 'retention',
        label: 'Retenciones',
        type: 'number',
        required: true,
        min: 0
      },
      {
        key: 'total',
        label: 'Total por cobrar',
        type: 'number',
        required: true,
        min: 0
      },
      {
        key: 'currency',
        label: 'Moneda',
        type: 'select',
        required: true,
        options: [
          { value: 'MXN', label: 'MXN' },
          { value: 'USD', label: 'USD' }
        ]
      },
      {
        key: 'status',
        label: 'Estado documental',
        type: 'select',
        required: true,
        options: [
          { value: 'draft', label: 'Borrador' },
          { value: 'issued', label: 'Emitida' },
          { value: 'cancelled', label: 'Cancelada' }
        ]
      },
      {
        key: 'evidence',
        label: 'Referencia del documento',
        wide: true,
        required: true
      }
    ],
    payments: [
      {
        key: 'invoice_id',
        label: 'Factura relacionada',
        type: 'select',
        options: data.invoices
          .filter((i) => i.status === 'issued')
          .map((i) => ({ value: i.id, label: i.title }))
      },
      { key: 'date', label: 'Fecha de pago', type: 'date', required: true },
      {
        key: 'amount',
        label: 'Monto recibido',
        type: 'number',
        required: true,
        min: 0.01
      },
      {
        key: 'currency',
        label: 'Moneda',
        type: 'select',
        required: true,
        options: [
          { value: 'MXN', label: 'MXN' },
          { value: 'USD', label: 'USD' }
        ]
      },
      {
        key: 'receipt_status',
        label: 'Complemento de pago',
        type: 'select',
        required: true,
        options: [
          { value: 'not_required', label: 'No requerido' },
          { value: 'pending', label: 'Pendiente' },
          { value: 'issued', label: 'Emitido' }
        ]
      },
      {
        key: 'evidence',
        label: 'Comprobante de pago',
        wide: true,
        required: true
      }
    ],
    opportunities: [
      { key: 'title', label: 'Oportunidad', required: true, wide: true },
      {
        key: 'stage',
        label: 'Etapa',
        type: 'select',
        options: [
          { value: 'discovery', label: 'Evaluación' },
          { value: 'proposal', label: 'Propuesta' },
          { value: 'negotiation', label: 'Negociación' },
          { value: 'won', label: 'Aceptada' },
          { value: 'lost', label: 'Descartada' }
        ],
        required: true
      },
      {
        key: 'development_estimate',
        label: 'Desarrollo estimado',
        type: 'number',
        min: 0
      },
      {
        key: 'monthly_estimate',
        label: 'Iguala estimada',
        type: 'number',
        min: 0
      },
      {
        key: 'currency',
        label: 'Moneda',
        type: 'select',
        required: true,
        options: [
          { value: 'MXN', label: 'MXN' },
          { value: 'USD', label: 'USD' }
        ]
      },
      {
        key: 'tax_basis',
        label: 'IVA del estimado',
        type: 'select',
        options: [
          { value: 'plus_vat', label: 'Más IVA' },
          { value: 'included', label: 'Incluido' },
          { value: 'unconfirmed', label: 'Por confirmar' }
        ],
        required: true
      },
      {
        key: 'next_action',
        label: 'Siguiente paso',
        type: 'textarea',
        wide: true,
        required: true
      },
      {
        key: 'evidence',
        label: 'Propuesta o soporte',
        wide: true,
        required: true
      }
    ]
  }
  const initial =
    values ??
    (kind === 'profile'
      ? { ...data.account, services: data.account.services.join(', ') }
      : kind === 'templates'
        ? { enabled: true, day: 1 }
        : {})
  return {
    title: titles[kind] ?? 'Registrar dato',
    kind,
    fields: fields[kind] ?? [],
    values: initial,
    id: values?.id as string | undefined,
    source_key: values?.source_key as string | undefined,
    expected_updated_at: (values?.updated_at ??
      (kind === 'profile' ? data.account.updated_at : undefined)) as
      | string
      | undefined,
    note: ['invoices', 'payments'].includes(kind)
      ? 'Registro documental interno. No emite CFDI, cancela documentos ni mueve dinero.'
      : kind === 'opportunities'
        ? 'Importes estimados, separados de ingresos y cobranza.'
        : undefined
  }
}
