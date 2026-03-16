-- Tabla para almacenar las credenciales de Chatwoot por organización
-- Cada organización puede conectar su propia instancia de Chatwoot

create table if not exists public.chatwoot_connections (
  id              uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organizations(id) on delete cascade,
  base_url        text not null,            -- ej. https://chat.antuario.mx
  account_id      int  not null,            -- ID numérico de la cuenta en Chatwoot
  api_access_token text not null,           -- Token de acceso de usuario agente/administrador
  connected_by    uuid references auth.users(id),
  connected_at    timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint chatwoot_connections_org_unique unique (organization_id)
);

-- RLS: solo miembros activos de la organización pueden leer/escribir
alter table public.chatwoot_connections enable row level security;

create policy "chatwoot_connections: miembros pueden leer"
  on public.chatwoot_connections for select
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = chatwoot_connections.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy "chatwoot_connections: owners/admins pueden escribir"
  on public.chatwoot_connections for all
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = chatwoot_connections.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- Índice para búsqueda por organización
create index if not exists idx_chatwoot_connections_org
  on public.chatwoot_connections(organization_id);
