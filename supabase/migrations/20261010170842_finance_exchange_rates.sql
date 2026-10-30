-- Explicit conversion evidence; cash continues to use the account's native currency.
alter table public.finance_entries add column fx_rate numeric(14,6) check(fx_rate>0), add column fx_source text;
alter table public.finance_documents add column fx_rate numeric(14,6) check(fx_rate>0), add column fx_source text;
alter table public.finance_entries add constraint finance_entries_fx_pair check((fx_rate is null)=(fx_source is null));
alter table public.finance_documents add constraint finance_documents_fx_pair check((fx_rate is null)=(fx_source is null));
