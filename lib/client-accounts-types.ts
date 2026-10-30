import type { ExistingAccountWork } from './client-accounts-existing-work'

/** Account API v1. Money is recorded in its currency; estimates never become revenue. */
export type AccountStatus = 'active' | 'archived'
export type AccountHealth = 'healthy' | 'attention' | 'blocked' | 'unknown'
export type AccountSource = 'ga4' | 'search_console' | 'google_ads' | 'manual'
export type AccountWorkStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'delivered'
  | 'blocked'
export type AccountProfile = {
  id: string
  organization_id: number
  name: string
  status: AccountStatus
  logo_url: string | null
  director_member_id: string | null
  director_name: string | null
  services: string[]
  monthly_fee: number | null
  currency: 'MXN' | 'USD'
  billing_cadence: 'monthly' | 'weekly'
  fee_basis: string | null
  health: AccountHealth
  summary: string
  updated_at: string
  is_example: boolean
}
export type AccountRecordBase = {
  id: string
  account_id: string
  organization_id: number
  source_key: string
  created_by: string
  created_at: string
  updated_at: string
  is_example: boolean
}
export type AccountContact = AccountRecordBase & {
  name: string
  role: string
  email: string | null
  access_location: string | null
}
export type AccountFront = AccountRecordBase & {
  key: string
  title: string
  health: AccountHealth
  status: string
  next_action: string
  owner_member_id: string | null
}
export type AccountMilestone = AccountRecordBase & {
  date: string
  title: string
  description: string
  kind: 'milestone' | 'decision' | 'delivery'
}
export type AccountSnapshot = AccountRecordBase & {
  date: string
  period_to: string
  source: AccountSource
  metric: string
  value: number
  unit: 'count' | 'MXN' | 'USD' | 'percent' | 'position' | 'seconds'
  grain: 'daily' | 'period'
  channel: string | null
  campaign_id: string | null
  evidence: string
}
export type AccountCampaign = AccountRecordBase & {
  name: string
  platform: 'google_ads' | 'meta' | 'other'
  status: 'active' | 'paused' | 'ended' | 'draft'
  daily_budget: number | null
  period_budget: number | null
  balance: number | null
  currency: 'MXN' | 'USD'
  period_from: string
  period_to: string
  evidence: string
}
export type AccountChange = AccountRecordBase & {
  date: string
  platform: string
  campaign_id: string | null
  action: string
  before: string
  after: string
  authorized_by: string
  reason: string
  evidence: string
}
export type AccountTemplate = AccountRecordBase & {
  title: string
  frequency: 'weekly' | 'monthly' | 'quarterly'
  day: number
  assignee_member_id: string | null
  deliverable_kind:
    | 'report'
    | 'invoice'
    | 'payment_receipt'
    | 'review'
    | 'support'
  enabled: boolean
}
export type AccountInstance = AccountRecordBase & {
  template_id: string | null
  title: string
  due_date: string
  assignee_member_id: string | null
  status: AccountWorkStatus
  evidence: string
  blocked_reason: string
  period_from: string | null
  period_to: string | null
}
export type AccountAttachment = AccountRecordBase & {
  name: string
  mime_type: string
  size: number
  storage_path: string
  instance_id: string | null
  work_id: string | null
  stage: 'draft' | 'final'
  version: number
  upload_status?: 'pending' | 'ready'
  sha256?: string
}
/** Legacy financial rows are read-only projections and may lack actor/update metadata. */
export type AccountFinancialBase = Omit<
  AccountRecordBase,
  'created_by' | 'created_at' | 'updated_at'
> & {
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  read_only?: boolean
  legacy_source?: 'finance_document' | 'finance_entry'
}
export type AccountInvoice = AccountFinancialBase & {
  title: string
  uuid: string | null
  issued_date: string
  due_date: string | null
  period_from: string | null
  period_to: string | null
  subtotal: number
  vat: number
  retention: number
  total: number
  currency: 'MXN' | 'USD'
  status: 'draft' | 'issued' | 'cancelled'
  evidence: string
}
export type AccountPayment = AccountFinancialBase & {
  invoice_id: string | null
  date: string
  amount: number
  currency: 'MXN' | 'USD'
  receipt_status: 'not_required' | 'pending' | 'issued'
  evidence: string
}
export type AccountOpportunity = AccountRecordBase & {
  title: string
  stage: 'discovery' | 'proposal' | 'negotiation' | 'won' | 'lost'
  development_estimate: number | null
  monthly_estimate: number | null
  currency: 'MXN' | 'USD'
  tax_basis: 'plus_vat' | 'included' | 'unconfirmed'
  next_action: string
  evidence: string
}
export type AccountCapabilities = {
  read: boolean
  manage: boolean
  manage_billing: boolean
  write_own_instances: boolean
  upload: boolean
  archived: boolean
  member_id: string | null
}
export type AccountBundle = {
  existing_work?: ExistingAccountWork
  finance_coverage?: {
    legacy_read: boolean
    new_ledger_read: boolean
    legacy_documents: number
    confirmed_entries: number
    truncated: boolean
    as_of: string
    errors: string[]
  }
  assignable_members?: { id: string; name: string; position: string }[]
  account: AccountProfile
  contacts: AccountContact[]
  fronts: AccountFront[]
  milestones: AccountMilestone[]
  snapshots: AccountSnapshot[]
  campaigns: AccountCampaign[]
  changes: AccountChange[]
  templates: AccountTemplate[]
  instances: AccountInstance[]
  attachments: AccountAttachment[]
  invoices: AccountInvoice[]
  payments: AccountPayment[]
  opportunities: AccountOpportunity[]
  capabilities: AccountCapabilities
  server_time: string
  schema_ready: boolean
  data_mode: 'live' | 'example'
  errors: string[]
}
export type AccountsListResponse = {
  accounts: AccountProfile[]
  server_time: string
  schema_ready: boolean
  capabilities: { coordinate: boolean }
  errors: string[]
}
export const ACCOUNT_RECORD_KINDS = [
  'contacts',
  'fronts',
  'milestones',
  'snapshots',
  'campaigns',
  'changes',
  'templates',
  'instances',
  'attachments',
  'invoices',
  'payments',
  'opportunities'
] as const
export type AccountRecordKind = (typeof ACCOUNT_RECORD_KINDS)[number]
