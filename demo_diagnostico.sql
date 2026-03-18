-- ============================================================
--  DIAGNÓSTICO DEMO — Corre esto en el SQL Editor de Supabase
--  para verificar que los datos demo existen correctamente.
-- ============================================================

-- 1. ¿Existe el usuario demo?
SELECT id, email, created_at
FROM auth.users
WHERE email = 'demo@antuario.mx';

-- 2. ¿Existe el profile?
SELECT id, full_name, email
FROM profiles
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- 3. ¿Cuántas membresías tiene el usuario demo? (debe ser exactamente 1)
SELECT m.organization_id, m.role, m.status, m.created_at, o.name as org_name
FROM memberships m
JOIN organizations o ON o.id = m.organization_id
WHERE m.user_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
ORDER BY m.created_at ASC;

-- 4. Conteo de datos por tabla para la org del demo
DO $$
DECLARE
  v_org_id INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM memberships
  WHERE user_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  RAISE NOTICE 'Organization ID: %', v_org_id;

  PERFORM (SELECT count(*) FROM companies WHERE organization_id = v_org_id);
  RAISE NOTICE 'Companies: %', (SELECT count(*) FROM companies WHERE organization_id = v_org_id);
  RAISE NOTICE 'Contacts: %', (SELECT count(*) FROM contacts WHERE organization_id = v_org_id);
  RAISE NOTICE 'Clients: %', (SELECT count(*) FROM clients WHERE organization_id = v_org_id);
  RAISE NOTICE 'Proposals: %', (SELECT count(*) FROM proposals WHERE organization_id = v_org_id);
  RAISE NOTICE 'Orders: %', (SELECT count(*) FROM orders WHERE organization_id = v_org_id);
  RAISE NOTICE 'Goals: %', (SELECT count(*) FROM goals WHERE organization_id = v_org_id);
  RAISE NOTICE 'Projects: %', (SELECT count(*) FROM projects WHERE organization_id = v_org_id);
  RAISE NOTICE 'Tasks: %', (SELECT count(*) FROM tasks WHERE organization_id = v_org_id);
  RAISE NOTICE 'Budgets: %', (SELECT count(*) FROM budgets WHERE organization_id = v_org_id);
  RAISE NOTICE 'Marketing Connections: %', (SELECT count(*) FROM marketing_connections WHERE organization_id = v_org_id);
  RAISE NOTICE 'Marketing Metrics Values: %', (SELECT count(*) FROM marketing_metrics_values WHERE organization_id = v_org_id);
  RAISE NOTICE 'Marketing Daily Summary (VIEW): %', (SELECT count(*) FROM marketing_daily_summary WHERE organization_id = v_org_id);
  RAISE NOTICE 'Contact Notes: %', (SELECT count(*) FROM contact_notes WHERE organization_id = v_org_id);
END $$;

-- 5. ¿Hay RLS habilitado en las tablas principales?
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'contacts', 'companies', 'clients', 'proposals', 'orders',
    'goals', 'goal_targets', 'projects', 'tasks', 'budgets',
    'marketing_connections', 'marketing_metrics_values',
    'memberships', 'profiles', 'contact_notes', 'proposal_items',
    'order_payments'
  )
ORDER BY tablename;

-- 6. ¿Cuántas organizaciones existen en total? (para detectar duplicadas)
SELECT id, name, created_at
FROM organizations
ORDER BY created_at DESC
LIMIT 10;
