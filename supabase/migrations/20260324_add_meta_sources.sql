-- ================================================================
--  MIGRACIÓN: Agregar fuentes de Meta a tablas de marketing
--  Fecha: 2026-03-24
--  Verificado contra schema real de Supabase (antuario-v1.5)
--
--  HALLAZGOS DEL DIAGNÓSTICO:
--
--  marketing_connections_source_check — YA TIENE:
--    ga4, search_console, google_ads, google_business_profile,
--    facebook, instagram, linkedin, tiktok
--    FALTA: meta_ads ← único cambio necesario aquí
--
--  marketing_metrics_values_source_check — SOLO TIENE fuentes Google:
--    ga4, search_console, google_ads, google_business_profile
--    FALTA: meta_ads, facebook, instagram, linkedin, tiktok
--
--  marketing_daily_summary — SIN constraint de source → sin cambio
--  marketing_sync_jobs     — SIN constraint de source → sin cambio
--
--  EJECUCIÓN: Supabase Dashboard → SQL Editor → Run
--  Es seguro ejecutar múltiples veces (IF EXISTS / IF NOT EXISTS)
-- ================================================================


-- ══════════════════════════════════════════════════════════════
-- PASO 0 — DIAGNÓSTICO (solo lectura, ejecutar antes si quieres confirmar)
-- ══════════════════════════════════════════════════════════════

-- Muestra todos los constraints CHECK en las 4 tablas:
-- SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS def
-- FROM pg_constraint
-- WHERE conrelid IN (
--   'public.marketing_connections'::regclass,
--   'public.marketing_metrics_values'::regclass,
--   'public.marketing_daily_summary'::regclass,
--   'public.marketing_sync_jobs'::regclass
-- ) AND contype = 'c' ORDER BY tabla, conname;


-- ══════════════════════════════════════════════════════════════
-- PASO 1 — marketing_connections
-- Agregar meta_ads manteniendo: facebook, instagram, linkedin, tiktok
-- que YA EXISTEN en el constraint actual
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.marketing_connections
  DROP CONSTRAINT IF EXISTS marketing_connections_source_check;

ALTER TABLE public.marketing_connections
  ADD CONSTRAINT marketing_connections_source_check
  CHECK (source IN (
    -- Google (existentes)
    'ga4',
    'search_console',
    'google_ads',
    'google_business_profile',
    -- Redes sociales (facebook, instagram, linkedin, tiktok ya estaban; meta_ads es nuevo)
    'meta_ads',
    'facebook',
    'instagram',
    'linkedin',
    'tiktok'
  ));


-- ══════════════════════════════════════════════════════════════
-- PASO 2 — marketing_metrics_values
-- Agregar meta_ads, facebook, instagram, linkedin, tiktok
-- (este constraint solo tenía fuentes Google)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.marketing_metrics_values
  DROP CONSTRAINT IF EXISTS marketing_metrics_values_source_check;

ALTER TABLE public.marketing_metrics_values
  ADD CONSTRAINT marketing_metrics_values_source_check
  CHECK (source IN (
    -- Google (existentes)
    'ga4',
    'search_console',
    'google_ads',
    'google_business_profile',
    -- Meta y redes sociales (nuevas)
    'meta_ads',
    'facebook',
    'instagram',
    'linkedin',
    'tiktok'
  ));

-- Nota: marketing_daily_summary y marketing_sync_jobs NO tienen constraint
-- de source → no requieren cambio.


-- ══════════════════════════════════════════════════════════════
-- PASO 3 — Índices de performance para Meta Ads
-- (usa IF NOT EXISTS — seguro re-ejecutar)
-- ══════════════════════════════════════════════════════════════

-- marketing_connections: queries por org + source
CREATE INDEX IF NOT EXISTS idx_mktconn_org_meta_ads
  ON public.marketing_connections(organization_id)
  WHERE source = 'meta_ads';

CREATE INDEX IF NOT EXISTS idx_mktconn_org_facebook
  ON public.marketing_connections(organization_id)
  WHERE source = 'facebook';

CREATE INDEX IF NOT EXISTS idx_mktconn_org_instagram
  ON public.marketing_connections(organization_id)
  WHERE source = 'instagram';

-- marketing_metrics_values: queries del dashboard (org + source + date)
CREATE INDEX IF NOT EXISTS idx_mktmet_org_meta_ads_date
  ON public.marketing_metrics_values(organization_id, date DESC)
  WHERE source = 'meta_ads';

-- NOTA: marketing_daily_summary es una VIEW, no una tabla → no admite índices directos.
-- Los índices de performance para esa vista se crean en la tabla base subyacente.
-- (descubierto al ejecutar la migración real el 2026-03-24)


-- ══════════════════════════════════════════════════════════════
-- PASO 4 — VERIFICACIÓN FINAL (ejecutar después)
-- ══════════════════════════════════════════════════════════════

SELECT
  conrelid::regclass AS tabla,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN (
  'public.marketing_connections'::regclass,
  'public.marketing_metrics_values'::regclass
)
AND contype = 'c'
AND conname LIKE '%source%'
ORDER BY tabla, conname;

-- Resultado esperado:
-- marketing_connections  | marketing_connections_source_check     | CHECK (source IN ('ga4',...,'meta_ads','facebook','instagram','linkedin','tiktok'))
-- marketing_metrics_values | marketing_metrics_values_source_check | CHECK (source IN ('ga4',...,'meta_ads','facebook','instagram','linkedin','tiktok'))
