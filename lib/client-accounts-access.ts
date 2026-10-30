import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'
import type { TeamMember } from './operations-types'
import { mergeLegacyAccountFinance } from './client-accounts-legacy-finance'
import { loadExistingAccountWork } from './client-accounts-existing-work'
import {
  ACCOUNT_RECORD_KINDS,
  type AccountBundle,
  type AccountCapabilities,
  type AccountProfile,
  type AccountRecordBase,
  type AccountRecordKind,
  type AccountsListResponse
} from './client-accounts-types'

export type AccountsContext = {
  db: SupabaseClient
  orgId: number
  role: string
  user: { id: string }
  seat: TeamMember | null
}
export const ACCOUNT_BUCKET = 'client-account-deliverables'
export function accountReadAccess(
  c: Pick<AccountsContext, 'role' | 'seat'>,
  accountId: string
) {
  if (c.role === 'owner') return true
  const s = c.seat
  return (
    !!s &&
    s.status === 'active' &&
    s.areas.length > 0 &&
    (!s.client_ids.length || s.client_ids.includes(accountId))
  )
}
export function accountCoordination(c: Pick<AccountsContext, 'role' | 'seat'>) {
  return (
    c.role === 'owner' ||
    (!!c.seat &&
      c.seat.status === 'active' &&
      c.seat.access === 'operator' &&
      (c.seat.write_areas ?? []).includes('people'))
  )
}
export function flattenAccountRecord(row: Record<string, unknown>) {
  const { data, initial_data: original, ...base } = row
  void original
  return {
    ...(data as Record<string, unknown>),
    ...base
  } as AccountRecordBase & Record<string, unknown>
}
export function missingAccountSchema(
  error: { code?: string; message?: string } | null
) {
  return (
    !!error &&
    ['42P01', 'PGRST205', '42883', 'PGRST202'].includes(error.code ?? '')
  )
}

/** Supabase can cap a response at1000 rows even when a higher limit is requested. */
export async function readPagedAccountRecords(
  db: SupabaseClient,
  orgId: number,
  accountId: string
) {
  type RecordRow = {
    id: string
    created_at: string
    kind: string
    data: Record<string, unknown>
  } & Record<string, unknown>
  const data: RecordRow[] = []
  let cursor: Pick<RecordRow, 'id' | 'created_at'> | null = null
  let count: number | null = null
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    let query = db
      .from('client_account_records')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .order('id')
      .limit(1000)
    if (cursor)
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`
      )
    const page = await query
    if (page.error)
      return { data, error: page.error, count, truncated: data.length > 0 }
    if (count === null) count = page.count
    const rows = (page.data ?? []) as RecordRow[]
    data.push(...rows)
    if (
      !rows.length ||
      (count !== null ? data.length >= count : rows.length < 1000)
    )
      break
    const last = rows.at(-1)!
    cursor = { id: last.id, created_at: last.created_at }
  }
  return {
    data,
    error: null,
    count,
    truncated: count !== null ? count > data.length : data.length >= 10000
  }
}
const legacyAccountProfiles = cache(async (c: AccountsContext) => {
  const [clients, projects, team] = await Promise.all([
    c.db
      .from('clients')
      .select('id,name,status,contracted_services')
      .eq('organization_id', c.orgId)
      .order('name'),
    c.db
      .from('projects')
      .select('client_id,director_member_id')
      .eq('organization_id', c.orgId),
    c.db
      .from('team_members')
      .select('id,name,status')
      .eq('organization_id', c.orgId)
  ])
  if (clients.error) return []
  return (clients.data ?? [])
    .filter((row) => accountReadAccess(c, row.id))
    .map((row) => {
      // Commercial terms are private database records, never source-code defaults.
      const directorId =
        projects.data?.find(
          (p) => p.client_id === row.id && p.director_member_id
        )?.director_member_id ?? null
      return {
        id: row.id,
        organization_id: c.orgId,
        name: row.name,
        status: row.status ?? 'active',
        services: row.contracted_services ?? [],
        logo_url: null,
        director_member_id: directorId,
        director_name:
          team.data?.find((t) => t.id === directorId)?.name ?? null,
        monthly_fee: null,
        currency: 'MXN',
        billing_cadence: 'monthly',
        fee_basis: null,
        health: 'unknown',
        summary: '',
        updated_at: new Date(0).toISOString(),
        is_example: false,
      } as AccountProfile
    })
})
const readAccountProfiles = cache(async (c: AccountsContext) =>
  c.db
    .from('client_account_profiles')
    .select('*')
    .eq('organization_id', c.orgId)
    .order('name')
)
export async function listClientAccounts(
  c: AccountsContext
): Promise<AccountsListResponse> {
  const result = await readAccountProfiles(c)
  if (missingAccountSchema(result.error))
    return {
      accounts: await legacyAccountProfiles(c),
      server_time: new Date().toISOString(),
      schema_ready: false,
      capabilities: { coordinate: accountCoordination(c) },
      errors: ['migration_pending']
    }
  return {
    accounts: (result.data ?? []) as AccountProfile[],
    server_time: new Date().toISOString(),
    schema_ready: !missingAccountSchema(result.error),
    capabilities: { coordinate: accountCoordination(c) },
    errors: result.error ? ['accounts'] : []
  }
}

/** Read-only bridge: existing ledger rows remain governed by their original finance RLS. */
async function withLegacyAccountFinance(
  c: AccountsContext,
  bundle: AccountBundle
): Promise<AccountBundle> {
  const clientNames: Record<string, string> = {
    '6257d252-eb54-423e-b72b-fe5deb3e078a': 'Métrica BTL',
    'a69fe8b1-14f5-4033-9cda-dc55d9e2726d': 'Acriland'
  }
  const seat = c.seat,
    name = clientNames[bundle.account.id]
  const allowed =
    c.role === 'owner' ||
    (!!seat &&
      seat.status === 'active' &&
      seat.areas.includes('finance') &&
      seat.client_ids.length === 0)
  const coverage = {
    legacy_read: false,
    new_ledger_read: bundle.schema_ready && !bundle.errors.includes('records'),
    legacy_documents: 0,
    confirmed_entries: 0,
    truncated: false,
    as_of: new Date().toISOString(),
    errors: [] as string[]
  }
  if (!allowed || !name) return { ...bundle, finance_coverage: coverage }
  const documents = await c.db
    .from('finance_documents')
    .select('*', { count: 'exact' })
    .eq('organization_id', c.orgId)
    .eq('client_name', name)
    .order('issued_date', { ascending: false })
    .range(0, 999)
  if (documents.error)
    return {
      ...bundle,
      finance_coverage: { ...coverage, errors: ['legacy_finance_documents'] }
    }
  const rows = documents.data ?? []
  const ids = rows.map((row) => row.id),
    groups: string[][] = []
  for (let offset = 0; offset < ids.length; offset += 100)
    groups.push(ids.slice(offset, offset + 100))
  const parts = await Promise.all(
    groups.map((group) =>
      c.db
        .from('finance_entries')
        .select('*', { count: 'exact' })
        .eq('organization_id', c.orgId)
        .eq('direction', 'income')
        .eq('category', 'revenue')
        .eq('evidence', 'confirmed')
        .not('cash_date', 'is', null)
        .in('document_id', group)
        .order('cash_date', { ascending: false })
        .range(0, 999)
    )
  )
  const entries = parts.flatMap((part) => (part.error ? [] : (part.data ?? [])))
  const errors = parts.some((part) => part.error)
    ? ['legacy_finance_entries']
    : []
  const merged = mergeLegacyAccountFinance(
    bundle.account,
    rows,
    entries,
    bundle.invoices,
    bundle.payments
  )
  return {
    ...bundle,
    invoices: merged.invoices,
    payments: merged.payments,
    finance_coverage: {
      ...coverage,
      legacy_read: errors.length === 0,
      legacy_documents: rows.length,
      confirmed_entries: entries.length,
      truncated:
        (documents.count ?? rows.length) > rows.length ||
        parts.some(
          (part) =>
            (part.count ?? part.data?.length ?? 0) > (part.data?.length ?? 0)
        ),
      errors: [...errors, ...merged.warnings]
    }
  }
}
export async function loadClientAccount(
  c: AccountsContext,
  id: string
): Promise<AccountBundle | null> {
  const profiles = await readAccountProfiles(c)
  const error = profiles.error,
    account = profiles.data?.find((row) => row.id === id)
  if (missingAccountSchema(error)) {
    const legacy = (await legacyAccountProfiles(c)).find((row) => row.id === id)
    if (!legacy) return null
    const grouped = Object.fromEntries(
      ACCOUNT_RECORD_KINDS.map((kind) => [kind, []])
    )
    const bundle = {
      account: legacy,
      ...grouped,
      capabilities: {
        read: true,
        manage: false,
        manage_billing: false,
        write_own_instances: false,
        upload: false,
        archived: legacy.status === 'archived',
        member_id: c.seat?.id ?? null
      },
      server_time: new Date().toISOString(),
      schema_ready: false,
      data_mode: 'live',
      errors: ['migration_pending']
    } as AccountBundle
    const [withFinance, existingWork] = await Promise.all([
      withLegacyAccountFinance(c, bundle),
      loadExistingAccountWork(c.db, c.orgId, id)
    ])
    return { ...withFinance, existing_work: existingWork }
  }
  if (error || !account) return null
  const [records, cap, members] = await Promise.all([
    readPagedAccountRecords(c.db, c.orgId, id),
    c.db.rpc('account_capabilities', { account: id }),
    c.db
      .from('team_members')
      .select('id,name,position,status,client_ids')
      .eq('organization_id', c.orgId)
      .eq('status', 'active')
  ])
  const grouped = Object.fromEntries(
    ACCOUNT_RECORD_KINDS.map((kind) => [kind, []])
  ) as unknown as Record<AccountRecordKind, unknown[]>
  for (const row of (records.data ?? []).slice(0, 10000)) {
    const kind = row.kind as AccountRecordKind
    if (!ACCOUNT_RECORD_KINDS.includes(kind)) continue
    if (kind === 'attachments' && row.data?.upload_status !== 'ready') continue
    grouped[kind].push(flattenAccountRecord(row))
  }
  const denied: AccountCapabilities = {
    read: true,
    manage: false,
    manage_billing: false,
    write_own_instances: false,
    upload: false,
    archived: account.status === 'archived',
    member_id: c.seat?.id ?? null
  }
  const bundle = {
    account,
    ...grouped,
    assignable_members: (members.data ?? [])
      .filter((m) => !m.client_ids.length || m.client_ids.includes(id))
      .map(({ id, name, position }) => ({ id, name, position })),
    capabilities: cap.data ?? denied,
    server_time: new Date().toISOString(),
    schema_ready:
      !missingAccountSchema(records.error) && !missingAccountSchema(cap.error),
    data_mode: 'live',
    errors: [
      ...(records.error ? ['records'] : []),
      ...(cap.error ? ['capabilities'] : []),
      ...(records.truncated ? ['records_truncated'] : [])
    ]
  } as AccountBundle
  const [withFinance, existingWork] = await Promise.all([
    withLegacyAccountFinance(c, bundle),
    loadExistingAccountWork(c.db, c.orgId, id)
  ])
  return { ...withFinance, existing_work: existingWork }
}
export function validFileHeader(type: string, bytes: Uint8Array) {
  const at = (...values: number[]) => values.every((n, i) => bytes[i] === n)
  if (type === 'application/pdf') return at(0x25, 0x50, 0x44, 0x46, 0x2d)
  if (type === 'image/png')
    return at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  if (type === 'image/jpeg') return at(0xff, 0xd8, 0xff)
  return (
    type === 'image/webp' &&
    at(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

/** Validate the actual object, including a resumed upload that returned409. */
export async function storedFileMatches(
  blob: Blob,
  expected: { sha256: string; size: number; mime_type: string }
) {
  if (
    blob.size !== expected.size ||
    blob.type.toLowerCase().split(';')[0] !== expected.mime_type
  )
    return false
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!validFileHeader(expected.mime_type, bytes)) return false
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('')
  return sha256 === expected.sha256
}
