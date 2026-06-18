-- ─────────────────────────────────────────────────────────────────────────────
-- Propuestas tipo proyecto: cronograma por fases + objetivos/KPIs del periodo.
-- Se guardan como jsonb en la propia propuesta (arrays de objetos).
--   phases: [{ name, detail, from_month, to_month }]
--   kpis:   [{ name, target, note }]
-- Aplicada en producción el 2026-06-17 vía MCP; este archivo deja el repo en sync.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.proposals
  add column if not exists phases jsonb not null default '[]'::jsonb,
  add column if not exists kpis   jsonb not null default '[]'::jsonb;
