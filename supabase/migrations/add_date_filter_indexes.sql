-- ============================================================
-- MIGRACIÓN: Índices para filtros de fecha globales
-- Aplica a: marketing_daily_summary, contacts, proposals,
--           orders, clients, order_payments
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- 1. marketing_daily_summary
--    (no tenía ningún índice de fecha — el más crítico)
CREATE INDEX IF NOT EXISTS idx_mktds_org_source_date
  ON marketing_daily_summary(organization_id, source, date DESC);

CREATE INDEX IF NOT EXISTS idx_mktds_org_date
  ON marketing_daily_summary(organization_id, date DESC);

-- 2. contacts — filtrar por período de creación
CREATE INDEX IF NOT EXISTS idx_contacts_org_created
  ON contacts(organization_id, created_at DESC);

-- 3. proposals — filtrar por período de creación
CREATE INDEX IF NOT EXISTS idx_proposals_org_created
  ON proposals(organization_id, created_at DESC);

-- 4. orders — filtrar por período de creación
CREATE INDEX IF NOT EXISTS idx_orders_org_created
  ON orders(organization_id, created_at DESC);

-- 5. clients — filtrar por período de creación
CREATE INDEX IF NOT EXISTS idx_clients_org_created
  ON clients(organization_id, created_at DESC);

-- 6. order_payments — filtrar por fecha de pago (columna date, no timestamp)
CREATE INDEX IF NOT EXISTS idx_payments_org_payment_date
  ON order_payments(organization_id, payment_date DESC);
