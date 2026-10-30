alter table public.proposals add column if not exists next_followup_on date;
alter table public.proposals add column if not exists next_action text check(length(next_action)<=500);
create index if not exists proposals_followup_idx on public.proposals(organization_id,next_followup_on) where next_followup_on is not null;
