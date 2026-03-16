-- Agregar chatwoot_inbox_id a organizations para multi-tenant
-- Cada organización puede tener su propio inbox en la instancia central de mensajería
-- Si es NULL, la bandeja mostrará todas las conversaciones

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS chatwoot_inbox_id INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.organizations.chatwoot_inbox_id IS
  'ID del inbox de mensajería asignado a esta organización. NULL = ver todas las conversaciones.';
