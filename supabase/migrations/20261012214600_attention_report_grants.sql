-- Supabase default privileges must not grant destructive table operations.
revoke all on public.account_attention_reports from authenticated, anon, public;
grant select, insert on public.account_attention_reports to authenticated;
