-- Day-granularity account checkpoints preserve historical openings and entries.
-- A checkpoint includes cash already represented on its reported day; only later
-- cash dates are added. It is not a bank feed or an end-of-day confirmation.
alter table public.finance_accounts
 add column if not exists balance_snapshot_amount numeric(14,2),
 add column if not exists balance_snapshot_date date,
 add column if not exists balance_snapshot_source text;

alter table public.finance_accounts add constraint finance_account_checkpoint_complete check (
 (balance_snapshot_amount is null and balance_snapshot_date is null and balance_snapshot_source is null)
 or (kind <> 'provisional' and balance_snapshot_amount is not null
     and balance_snapshot_amount between -999999999 and 999999999
     and balance_snapshot_date is not null and balance_snapshot_source is not null
     and length(btrim(balance_snapshot_source)) between 1 and 2000)
);

comment on column public.finance_accounts.balance_snapshot_date is
 'User-reported balance date, not an end-of-day assertion. cash_date has day precision: only later dates adjust this checkpoint.';

-- Collection intent is separate from a CFDI's fiscal cancellation. Neither
-- flag changes historical revenue, paid amounts or the original payment plan.
alter table public.finance_documents
 add column if not exists collection_status text not null default 'active'
 check (collection_status in ('active','cancellation_requested','cancelled'));
alter table public.finance_entries
 add column if not exists forecast_status text not null default 'active'
 check (forecast_status in ('active','withdrawn'));
alter table public.finance_entries add constraint withdrawn_forecast_is_planned
 check (forecast_status = 'active' or evidence = 'planned');
comment on column public.finance_documents.collection_status is
 'Internal collection status only. cancellation_requested is not a SAT cancellation receipt; original CFDI data is retained.';
