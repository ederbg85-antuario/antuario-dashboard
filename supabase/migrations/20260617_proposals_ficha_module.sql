-- ─────────────────────────────────────────────────────────────────────────────
-- Propuestas como "ficha": brief (necesidades/solución), monto, etapas, PDF y
-- bitácora de cambios solicitados por el cliente.
-- Aplicada en producción el 2026-06-17 vía MCP; este archivo deja el repo en sync.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extiende proposals para convertirla en ficha de propuesta
alter table public.proposals
  add column if not exists client_need       text,
  add column if not exists proposed_solution text,
  add column if not exists objective         text,
  add column if not exists scope             text,
  add column if not exists stage             text not null default 'documentando',
  add column if not exists amount            numeric not null default 0,
  add column if not exists currency          text not null default 'MXN',
  add column if not exists presented_at      timestamptz,
  add column if not exists decided_at        timestamptz,
  add column if not exists source_channel    text;

-- Migra el `status` legacy al nuevo modelo de etapas (idempotente)
update public.proposals set stage = case
  when status = 'accepted' then 'aceptada'
  when status = 'rejected' then 'rechazada'
  when status = 'sent'     then 'presentada'
  else 'documentando'
end
where stage = 'documentando' and status is not null;

update public.proposals set amount = total where amount = 0 and total > 0;

-- Bitácora de cambios solicitados por el cliente
create table if not exists public.proposal_changes (
  id              uuid primary key default gen_random_uuid(),
  organization_id bigint not null,
  proposal_id     uuid not null references public.proposals(id) on delete cascade,
  description     text not null,
  resolved        boolean not null default false,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create index if not exists idx_proposal_changes_proposal on public.proposal_changes(proposal_id);

alter table public.proposal_changes enable row level security;

drop policy if exists "proposal_changes_all" on public.proposal_changes;
create policy "proposal_changes_all" on public.proposal_changes
  for all to authenticated using (true) with check (true);

-- Bucket privado para los PDF de propuestas
insert into storage.buckets (id, name, public)
values ('proposal-files', 'proposal-files', false)
on conflict (id) do nothing;

drop policy if exists "Allow read proposal-files"   on storage.objects;
drop policy if exists "Allow upload proposal-files" on storage.objects;
drop policy if exists "Allow delete proposal-files" on storage.objects;

create policy "Allow read proposal-files"   on storage.objects
  for select to authenticated using (bucket_id = 'proposal-files');
create policy "Allow upload proposal-files" on storage.objects
  for insert to authenticated with check (bucket_id = 'proposal-files');
create policy "Allow delete proposal-files" on storage.objects
  for delete to authenticated using (bucket_id = 'proposal-files');
