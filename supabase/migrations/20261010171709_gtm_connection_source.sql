alter table public.marketing_connections drop constraint marketing_connections_source_check;
alter table public.marketing_connections add constraint marketing_connections_source_check check(source in ('ga4','search_console','gtm','google_ads','google_business_profile','meta_ads','facebook','instagram','linkedin','tiktok','google_calendar'));
alter table public.marketing_connections add column snapshot jsonb;
grant select(snapshot) on public.marketing_connections to authenticated;
