-- ─────────────────────────────────────────────────────────────────────────────
-- Propuestas: tipo de cobro + duración (para proyectar valor mensual / anual /
-- de contrato) y fechas del recorrido comercial (primer contacto → reunión →
-- propuesta → presentada → cierre) para medir tasa de cierre y tiempos.
-- Aplicada en producción el 2026-06-17 vía MCP; este archivo deja el repo en sync.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.proposals
  add column if not exists billing_type     text not null default 'monthly',  -- 'monthly' | 'one_time'
  add column if not exists duration_months  integer not null default 6,
  add column if not exists first_contact_at timestamptz,
  add column if not exists meeting_at        timestamptz;

-- Backfill: el primer contacto = cuando entró el contacto al CRM
update public.proposals p
set first_contact_at = c.created_at
from public.contacts c
where p.contact_id = c.id and p.first_contact_at is null;
