-- ============================================================
--  ANTUARIO DASHBOARD — SCRIPT DE DATOS DEMO
--  Empresa:  Impulsa BTL — Agencia de Activaciones
--  Usuario:  demo@antuario.mx
--  Password: Demo2024!
-- ============================================================
--
--  INSTRUCCIONES:
--  1. Abre el SQL Editor en tu proyecto de Supabase
--  2. Pega TODO este script y ejecuta
--  3. Si el bloque de auth.users falla (raro), crea el usuario
--     manualmente en Dashboard → Authentication → Users con el
--     email demo@antuario.mx y contraseña Demo2024!, luego
--     reemplaza el UUID 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
--     con el UUID real que Supabase le asignó, y vuelve a correr
--     el script desde la sección "STEP 2" en adelante.
--
-- ============================================================

-- ============================================================
--  LIMPIEZA PREVIA (borra datos del intento anterior)
--  Corre esto primero si ya ejecutaste el script antes
-- ============================================================
DO $$
DECLARE
  v_user_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_org_id  INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM memberships WHERE user_id = v_user_id LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- NOTA: marketing_daily_summary es una VIEW, no se puede borrar directamente
    DELETE FROM marketing_metrics_values  WHERE organization_id = v_org_id;
    DELETE FROM marketing_connections     WHERE organization_id = v_org_id;
    DELETE FROM budgets                   WHERE organization_id = v_org_id;
    DELETE FROM tasks                     WHERE organization_id = v_org_id;
    DELETE FROM projects                  WHERE organization_id = v_org_id;
    DELETE FROM goal_targets              WHERE organization_id = v_org_id;
    DELETE FROM goals                     WHERE organization_id = v_org_id;
    DELETE FROM contact_notes             WHERE organization_id = v_org_id;
    DELETE FROM order_payments            WHERE organization_id = v_org_id;
    DELETE FROM orders                    WHERE organization_id = v_org_id;
    DELETE FROM proposal_items            WHERE organization_id = v_org_id;
    DELETE FROM proposals                 WHERE organization_id = v_org_id;
    DELETE FROM clients                   WHERE organization_id = v_org_id;
    DELETE FROM contacts                  WHERE organization_id = v_org_id;
    DELETE FROM companies                 WHERE organization_id = v_org_id;
    DELETE FROM memberships               WHERE organization_id = v_org_id;
    DELETE FROM organizations             WHERE id = v_org_id;
  END IF;

  -- NOTA: No borrar profiles ni auth.users por FK constraints
  -- DELETE FROM profiles    WHERE id = v_user_id;
  -- DELETE FROM auth.users  WHERE id = v_user_id;

  RAISE NOTICE 'Limpieza completa. Listo para re-insertar.';
END $$;

-- ============================================================
--  DATOS DEMO
-- ============================================================
DO $$
DECLARE
  -- ── UUIDs fijos (para poder referenciarlos entre inserts) ─
  v_user_id     UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_org_id      INTEGER;

  -- Companies
  comp_bimbo      UUID := 'bb100001-0000-0000-0000-000000000000';
  comp_cemex      UUID := 'bb100002-0000-0000-0000-000000000000';
  comp_banorte    UUID := 'bb100003-0000-0000-0000-000000000000';
  comp_liverpool  UUID := 'bb100004-0000-0000-0000-000000000000';
  comp_santander  UUID := 'bb100005-0000-0000-0000-000000000000';
  comp_heineken   UUID := 'bb100006-0000-0000-0000-000000000000';

  -- Contacts
  ct_maria      UUID := 'cc100001-0000-0000-0000-000000000000';
  ct_roberto    UUID := 'cc100002-0000-0000-0000-000000000000';
  ct_ana        UUID := 'cc100003-0000-0000-0000-000000000000';
  ct_luis       UUID := 'cc100004-0000-0000-0000-000000000000';
  ct_claudia    UUID := 'cc100005-0000-0000-0000-000000000000';
  ct_jorge      UUID := 'cc100006-0000-0000-0000-000000000000';
  ct_fernanda   UUID := 'cc100007-0000-0000-0000-000000000000';
  ct_alejandro  UUID := 'cc100008-0000-0000-0000-000000000000';
  ct_paola      UUID := 'cc100009-0000-0000-0000-000000000000';

  -- Clients (cuentas que ya pagan)
  cl_bimbo      UUID := 'c1100001-0000-0000-0000-000000000000';
  cl_banorte    UUID := 'c1100002-0000-0000-0000-000000000000';
  cl_liverpool  UUID := 'c1100003-0000-0000-0000-000000000000';

  -- Proposals
  pr_bimbo      UUID := 'ee100001-0000-0000-0000-000000000000';
  pr_cemex      UUID := 'ee100002-0000-0000-0000-000000000000';
  pr_banorte    UUID := 'ee100003-0000-0000-0000-000000000000';
  pr_liverpool  UUID := 'ee100004-0000-0000-0000-000000000000';
  pr_santander  UUID := 'ee100005-0000-0000-0000-000000000000';
  pr_heineken   UUID := 'ee100006-0000-0000-0000-000000000000';
  pr_pepsico    UUID := 'ee100007-0000-0000-0000-000000000000';
  pr_sura       UUID := 'ee100008-0000-0000-0000-000000000000';

  -- Orders
  ord_bimbo     UUID := '0d100001-0000-0000-0000-000000000000';
  ord_banorte   UUID := '0d100002-0000-0000-0000-000000000000';
  ord_liverpool UUID := '0d100003-0000-0000-0000-000000000000';

  -- Goals
  g1  UUID := 'f0100001-0000-0000-0000-000000000000';
  g2  UUID := 'f0100002-0000-0000-0000-000000000000';
  g3  UUID := 'f0100003-0000-0000-0000-000000000000';

  -- Projects
  proj1 UUID := 'b1100001-0000-0000-0000-000000000000';
  proj2 UUID := 'b1100002-0000-0000-0000-000000000000';

BEGIN

  -- ============================================================
  --  STEP 1 — AUTH USER
  -- ============================================================
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'demo@antuario.mx',
    crypt('Demo2024!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}', false,
    NOW(), NOW(),
    '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  --  STEP 2 — PROFILE + ORGANIZACIÓN + MEMBRESÍA
  -- ============================================================
  INSERT INTO profiles (id, full_name, email)
  VALUES (v_user_id, 'Carlos Mendoza', 'demo@antuario.mx')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO organizations (name)
  VALUES ('Impulsa BTL')
  RETURNING id INTO v_org_id;

  INSERT INTO memberships (user_id, organization_id, role, status, created_at)
  VALUES (v_user_id, v_org_id, 'owner', 'active', NOW());

  -- ============================================================
  --  STEP 3 — EMPRESAS
  -- ============================================================
  INSERT INTO companies (
    id, organization_id, name, industry, website, phone, email,
    city, country, notes, assigned_to, created_by, created_at, updated_at
  ) VALUES
    (comp_bimbo, v_org_id,
     'Grupo Bimbo', 'Alimentos y Bebidas',
     'www.grupobimbo.com', '55 5268 6600', 'contacto@bimbo.com.mx',
     'Ciudad de México', 'México',
     'Principal marca de panificación en LATAM. Requieren activaciones BTL masivas para lanzamientos de producto en puntos de venta.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '120 days', NOW() - INTERVAL '95 days'),

    (comp_cemex, v_org_id,
     'Cemex México', 'Construcción y Materiales',
     'www.cemex.com', '81 8888 4000', 'marketing@cemex.com',
     'Monterrey', 'México',
     'Empresa global de materiales de construcción. Requieren eventos corporativos y ferias de industria.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '90 days', NOW() - INTERVAL '75 days'),

    (comp_banorte, v_org_id,
     'Banco Banorte', 'Servicios Financieros',
     'www.banorte.com', '81 8319 6000', 'events@banorte.com',
     'Monterrey', 'México',
     'Institución bancaria líder en México. Campañas de sampling y activaciones en sucursales para captación de clientes.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '100 days', NOW() - INTERVAL '82 days'),

    (comp_liverpool, v_org_id,
     'Liverpool', 'Retail y Comercio',
     'www.liverpool.com.mx', '55 9177 5000', 'btl@liverpool.com.mx',
     'Ciudad de México', 'México',
     'Cadena de tiendas departamentales premium. Ambientaciones navideñas, exhibits de producto y activaciones de temporada.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '105 days', NOW() - INTERVAL '86 days'),

    (comp_santander, v_org_id,
     'Santander México', 'Servicios Financieros',
     'www.santander.com.mx', '55 5169 4300', 'marketing@santander.com.mx',
     'Ciudad de México', 'México',
     'Banco internacional con fuerte presencia en CDMX. Promotoras en sucursales y eventos de captación de nuevos clientes.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '62 days', NOW() - INTERVAL '48 days'),

    (comp_heineken, v_org_id,
     'Heineken México', 'Bebidas y Entretenimiento',
     'www.heineken.com.mx', '55 1099 0000', 'activaciones@heineken.com.mx',
     'Ciudad de México', 'México',
     'Marca de cerveza premium. Activaciones en venues deportivos, Copa Heineken y eventos de patrocinio. Lead caliente.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '28 days', NOW() - INTERVAL '14 days');

  -- ============================================================
  --  STEP 4 — CONTACTOS
  -- ============================================================
  INSERT INTO contacts (
    id, organization_id, full_name, email, phone,
    company, company_id, position,
    contact_type, status, source, source_campaign,
    primary_channel, notes,
    assigned_to, created_by, created_at, updated_at
  ) VALUES
    (ct_maria, v_org_id,
     'María González Reyes', 'mgonzalez@bimbo.com.mx', '55 8901 2345',
     'Grupo Bimbo', comp_bimbo, 'Gerente de Marketing Trade',
     'active_proposal', 'active', 'google_ads', 'BTL-Alimentos-2024',
     'email',
     'Cliente activa. Proyecto Q4 aprobado y en ejecución. Muy profesional, puntual con pagos. Potencial de renovación en Q1.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '115 days', NOW() - INTERVAL '30 days'),

    (ct_roberto, v_org_id,
     'Roberto Sánchez Vega', 'rsanchez@cemex.com', '81 4567 8901',
     'Cemex México', comp_cemex, 'Director de Brand Experience',
     'proposal', 'active', 'referral', NULL,
     'email',
     'Evento 30 aniversario Cemex. Propuesta enviada, pendiente aprobación del CFO. Seguimiento programado para esta semana.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '85 days', NOW() - INTERVAL '48 days'),

    (ct_ana, v_org_id,
     'Ana Torres Mendívil', 'atorres@banorte.com', '81 2345 6789',
     'Banco Banorte', comp_banorte, 'Coordinadora de Eventos y BTL',
     'active_proposal', 'active', 'google_ads', 'BTL-Banca-2024',
     'whatsapp',
     'Sampling tour en proceso. Primera fase entregada con éxito. Segunda fase pactada para el mes próximo.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '92 days', NOW() - INTERVAL '20 days'),

    (ct_luis, v_org_id,
     'Luis Herrera Castillo', 'lherrera@liverpool.com.mx', '55 7890 1234',
     'Liverpool', comp_liverpool, 'Vicepresidente de Marketing y Visual',
     'active_proposal', 'active', 'google_ads', 'BTL-Retail-2024',
     'email',
     'Proyecto exhibit navideño. Contrato firmado, anticipo recibido. Alta exigencia en tiempos y calidad. En producción.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '100 days', NOW() - INTERVAL '15 days'),

    (ct_claudia, v_org_id,
     'Claudia Reyes Morales', 'creyes@santander.com.mx', '55 3456 7890',
     'Santander México', comp_santander, 'Gerente BTL Nacional',
     'proposal', 'active', 'google_ads', 'BTL-Banca-2024',
     'email',
     'Campaña nacional de promotoras en 50 sucursales. En revisión por presupuesto corporativo Q1. Muy interesada.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '58 days', NOW() - INTERVAL '14 days'),

    (ct_jorge, v_org_id,
     'Jorge Vidal Espinosa', 'jvidal@heineken.com.mx', '55 2345 6789',
     'Heineken México', comp_heineken, 'Director de Activaciones y Patrocinios',
     'lead_relevant', 'lead_relevante', 'google_ads', 'BTL-Bebidas-2025',
     'whatsapp',
     'Lead muy caliente. Encontró nuestros anuncios buscando "agencia btl cdmx". Presupuesto Copa Heineken confirmado en 200-250k. Reunión presencial esta semana.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '26 days', NOW() - INTERVAL '8 days'),

    (ct_fernanda, v_org_id,
     'Fernanda Cruz Ortega', 'fcruz@pepsico.com', '55 9012 3456',
     'PepsiCo México', NULL, 'Brand Manager — Nuevos Productos',
     'proposal', 'active', 'google_ads', 'BTL-Alimentos-2025',
     'email',
     'Lanzamiento nacional de nuevo producto PepsiCo. Propuesta enviada. En análisis con su equipo de marketing. 20 ciudades.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '22 days', NOW() - INTERVAL '10 days'),

    (ct_alejandro, v_org_id,
     'Alejandro Moreno Fuentes', 'amoreno@sura.com.mx', '55 5678 9012',
     'Seguros Sura', NULL, 'Director Comercial',
     'lead_relevant', 'lead_relevante', 'direct', NULL,
     'phone',
     'Referido por contacto de Banorte. Necesita stand corporativo premium para Expo Seguros 2025. Presupuesto limitado.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '16 days', NOW() - INTERVAL '7 days'),

    (ct_paola, v_org_id,
     'Paola Jiménez Téllez', 'paola@tiendaoxxo.com', '55 1234 5678',
     'OXXO', NULL, 'Analista de Marketing Regional',
     'lead_irrelevant', 'dormant', 'google_ads', 'BTL-Retail-2024',
     'email',
     'Lead de formulario web. Presupuesto muy por debajo de nuestro ticket mínimo. No es match para Impulsa BTL.',
     v_user_id, v_user_id,
     NOW() - INTERVAL '72 days', NOW() - INTERVAL '70 days');

  -- ============================================================
  --  STEP 5 — CLIENTES (cuentas activas)
  -- ============================================================
  INSERT INTO clients (
    id, organization_id, name, contact_id, assigned_to,
    contracted_services,
    total_revenue, total_purchases, average_ticket, last_purchase_at,
    created_by, created_at, updated_at
  ) VALUES
    (cl_bimbo, v_org_id,
     'Grupo Bimbo', ct_maria, v_user_id,
     ARRAY['Activaciones de Marca', 'Sampling Masivo', 'Coordinación de Promotoras'],
     280320.00, 1, 280320.00,
     NOW() - INTERVAL '60 days',
     v_user_id,
     NOW() - INTERVAL '105 days', NOW() - INTERVAL '30 days'),

    (cl_banorte, v_org_id,
     'Banco Banorte', ct_ana, v_user_id,
     ARRAY['Sampling Digital', 'Activaciones en Sucursales', 'Staff Especializado'],
     140320.00, 1, 140320.00,
     NOW() - INTERVAL '40 days',
     v_user_id,
     NOW() - INTERVAL '85 days', NOW() - INTERVAL '20 days'),

    (cl_liverpool, v_org_id,
     'Liverpool', ct_luis, v_user_id,
     ARRAY['Exhibits BTL', 'Ambientación Navideña', 'Staff de Activación', 'Producción de Materiales'],
     369920.00, 1, 369920.00,
     NOW() - INTERVAL '20 days',
     v_user_id,
     NOW() - INTERVAL '90 days', NOW() - INTERVAL '15 days');

  -- ============================================================
  --  STEP 6 — PROPUESTAS
  -- ============================================================
  INSERT INTO proposals (
    id, organization_id, contact_id, client_id, assigned_to,
    title, status, module_label,
    subtotal, tax_rate, tax_amount, total,
    notes, terms_and_conditions,
    created_by, created_at, updated_at
  ) VALUES
    -- ── Bimbo (aceptada) ──────────────────────────────────────
    (pr_bimbo, v_org_id, ct_maria, cl_bimbo, v_user_id,
     'Activación de Marca Bimbo — Q4 2024',
     'accepted', 'Propuesta',
     241655.17, 16, 38664.83, 280320.00,
     'Activación en 30 puntos de venta estratégicos CDMX. Incluye promotoras capacitadas, material POP y supervisión de campo semanal.',
     'Vigencia: 30 días naturales. Anticipo del 50% al confirmar. Saldo al inicio de la segunda semana de campaña. Precios expresados en MXN más IVA.',
     v_user_id,
     NOW() - INTERVAL '112 days', NOW() - INTERVAL '98 days'),

    -- ── Cemex (enviada) ───────────────────────────────────────
    (pr_cemex, v_org_id, ct_roberto, NULL, v_user_id,
     'Evento Corporativo Cemex — 30 Aniversario',
     'sent', 'Cotización',
     171655.17, 16, 27464.83, 199120.00,
     'Organización integral del evento de 30 aniversario Cemex: producción, ambientación temática, animación y logística para 300 invitados.',
     'Vigencia: 30 días naturales. Anticipo del 50% al confirmar. Saldo 5 días antes del evento. No incluye alimentos ni bebidas.',
     v_user_id,
     NOW() - INTERVAL '82 days', NOW() - INTERVAL '77 days'),

    -- ── Banorte (aceptada) ────────────────────────────────────
    (pr_banorte, v_org_id, ct_ana, cl_banorte, v_user_id,
     'Sampling Tour Digital — Banorte',
     'accepted', 'Propuesta',
     120965.52, 16, 19354.48, 140320.00,
     'Campaña de sampling en 15 sucursales bancarias clave. 3 fases, 60 días de activación. Staff especializado en apertura de cuentas digitales.',
     'Vigencia: 30 días naturales. Anticipo del 40% al arranque de cada fase. El cliente provee los productos de sampling.',
     v_user_id,
     NOW() - INTERVAL '90 days', NOW() - INTERVAL '83 days'),

    -- ── Liverpool (aceptada) ──────────────────────────────────
    (pr_liverpool, v_org_id, ct_luis, cl_liverpool, v_user_id,
     'Exhibit BTL Liverpool — Temporada Navidad 2024',
     'accepted', 'Propuesta',
     318896.55, 16, 51023.45, 369920.00,
     'Diseño, producción e instalación de exhibits navideños en 5 tiendas Liverpool premium CDMX. Incluye staff de activación y coordinación.',
     'Vigencia: 30 días. Anticipo 50% al aprobar diseños. Saldo contra instalación completada. Cambios de diseño posteriores tienen costo adicional.',
     v_user_id,
     NOW() - INTERVAL '95 days', NOW() - INTERVAL '88 days'),

    -- ── Santander (enviada) ───────────────────────────────────
    (pr_santander, v_org_id, ct_claudia, NULL, v_user_id,
     'Campaña Promotoras Nacional — Santander Q1 2025',
     'sent', 'Cotización',
     94675.86, 16, 15148.14, 109824.00,
     'Despliegue de 50 promotoras capacitadas en sucursales Santander clave. Incluye uniformes corporativos, materiales y supervisión mensual.',
     'Vigencia: 30 días naturales. Tarifa mensual por servicio. Contratación mínima de 3 meses. Precio sujeto a volumen.',
     v_user_id,
     NOW() - INTERVAL '52 days', NOW() - INTERVAL '50 days'),

    -- ── Heineken (borrador) ───────────────────────────────────
    (pr_heineken, v_org_id, ct_jorge, NULL, v_user_id,
     'Activación Copa Heineken 2025 — 8 Venues',
     'draft', 'Propuesta',
     209999.14, 16, 33599.86, 243599.00,
     'Activación de marca en 8 venues deportivos durante 12 fechas Copa Heineken. Equipo especializado, materiales de branding y dirección creativa.',
     'Vigencia: 30 días naturales. Anticipo del 50% al confirmar calendario. Los venues son provistos por el cliente.',
     v_user_id,
     NOW() - INTERVAL '18 days', NOW() - INTERVAL '16 days'),

    -- ── PepsiCo (enviada) ─────────────────────────────────────
    (pr_pepsico, v_org_id, ct_fernanda, NULL, v_user_id,
     'Lanzamiento BTL Nacional — PepsiCo Nuevo Producto',
     'sent', 'Propuesta',
     154662.07, 16, 24745.93, 179408.00,
     'Campaña de lanzamiento en 20 ciudades: degustaciones, sampling y activaciones en tiendas de autoservicio clave.',
     'Vigencia: 30 días. Anticipo del 50% al firmar contrato. Logística de ciudades foráneas incluida en el precio.',
     v_user_id,
     NOW() - INTERVAL '18 days', NOW() - INTERVAL '16 days'),

    -- ── Sura (borrador) ───────────────────────────────────────
    (pr_sura, v_org_id, ct_alejandro, NULL, v_user_id,
     'Stand Corporativo Sura — Expo Seguros 2025',
     'draft', 'Cotización',
     87337.93, 16, 13974.07, 101312.00,
     'Diseño y producción de stand premium 6x4m para Expo Seguros 2025. Incluye mobiliario, pantallas LED y material impreso de alto impacto.',
     'Vigencia: 30 días. Anticipo 60% al aprobar diseño. Entrega 5 días hábiles antes del evento. Ajustes menores sin costo adicional.',
     v_user_id,
     NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days');

  -- ============================================================
  --  STEP 7 — CONCEPTOS DE PROPUESTA (líneas de cotización)
  -- ============================================================

  -- Bimbo
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_bimbo, v_org_id, 'Promotoras de Imagen', 'Staff femenino capacitado en manejo de producto Bimbo y atención al consumidor. Uniforme personalizado.', 30, 3500.00, 105000.00, 1),
    (pr_bimbo, v_org_id, 'Supervisoras de Campo', 'Coordinación y supervisión en campo, reporte diario de KPIs y asistencia por punto de venta.', 4, 8500.00, 34000.00, 2),
    (pr_bimbo, v_org_id, 'Material POP Impreso', 'Diseño e impresión de materiales: banners, habladores, parasoles y displays para 30 puntos de venta.', 1, 45000.00, 45000.00, 3),
    (pr_bimbo, v_org_id, 'Logística y Transporte', 'Traslado de materiales y equipo a todos los puntos de venta en CDMX y zona metropolitana.', 1, 28500.00, 28500.00, 4),
    (pr_bimbo, v_org_id, 'Fee de Coordinación del Proyecto', 'Gestión integral, dirección creativa, reportes ejecutivos semanales y cierre de campaña.', 1, 29155.17, 29155.17, 5);

  -- Cemex
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_cemex, v_org_id, 'Producción del Evento', 'Escenario modular, iluminación arquitectónica, audio profesional y pantallas LED para 300 personas.', 1, 65000.00, 65000.00, 1),
    (pr_cemex, v_org_id, 'Ambientación y Decoración', 'Concepto temático corporativo con elementos personalizados de marca Cemex y flores de temporada.', 1, 38000.00, 38000.00, 2),
    (pr_cemex, v_org_id, 'Animación y Entretenimiento', 'Conducción del evento, música en vivo (trío) y actividades interactivas alusivas al aniversario.', 1, 32000.00, 32000.00, 3),
    (pr_cemex, v_org_id, 'Staff de Protocolo', 'Personal de registro, valet, meseros y atención a invitados VIP durante todo el evento.', 20, 1200.00, 24000.00, 4),
    (pr_cemex, v_org_id, 'Coordinación y Logística', 'Dirección general del evento, gestión de proveedores, ensayos previos y reporte post-evento.', 1, 12655.17, 12655.17, 5);

  -- Banorte
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_banorte, v_org_id, 'Promotoras Financieras', 'Staff especializado en apertura de cuentas digitales y productos financieros Banorte. 15 sucursales.', 15, 4000.00, 60000.00, 1),
    (pr_banorte, v_org_id, 'Kits de Sampling y Materiales', 'Diseño y producción de kits informativos, gifts y materiales de captación por sucursal.', 1, 28500.00, 28500.00, 2),
    (pr_banorte, v_org_id, 'Supervisión y Reportes de KPIs', 'Visitas semanales de supervisión, base de datos de leads capturados y reportes ejecutivos.', 1, 32465.52, 32465.52, 3);

  -- Liverpool
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_liverpool, v_org_id, 'Diseño de Exhibits Navideños', 'Concepto creativo y renders 3D de 5 exhibits personalizados, uno por tienda Liverpool premium.', 5, 18000.00, 90000.00, 1),
    (pr_liverpool, v_org_id, 'Producción e Instalación', 'Fabricación de materiales, traslado e instalación en las 5 tiendas. Materiales premium y duraderos.', 5, 32000.00, 160000.00, 2),
    (pr_liverpool, v_org_id, 'Staff de Activación Navideña', 'Promotores en floor durante temporada alta (15 nov – 6 ene). 2 por tienda con uniforme navideño.', 10, 4500.00, 45000.00, 3),
    (pr_liverpool, v_org_id, 'Coordinación y Permisos', 'Gestión de permisos con gerencias de tienda, coordinación logística y reportes de tráfico diario.', 1, 23896.55, 23896.55, 4);

  -- Santander
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_santander, v_org_id, 'Promotoras en Sucursal (mensual)', 'Promotoras capacitadas en productos Santander para 50 sucursales clave de CDMX y GDL.', 50, 1500.00, 75000.00, 1),
    (pr_santander, v_org_id, 'Uniformes y Kit de Trabajo', 'Uniformes corporativos con identidad Santander y kit completo de materiales por promotora.', 50, 350.00, 17500.00, 2),
    (pr_santander, v_org_id, 'Supervisión y Reportes Mensuales', 'Visitas de supervisión a todas las sucursales, reporte de KPIs semanal y dashboard de resultados.', 1, 2175.86, 2175.86, 3);

  -- Heineken
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_heineken, v_org_id, 'Activación por Venue (12 fechas)', 'Equipo completo por venue: 4 brand ambassadors, materiales y coordinador de activación.', 8, 18500.00, 148000.00, 1),
    (pr_heineken, v_org_id, 'Producción de Materiales de Marca', 'Inflables personalizados, banners, arcos y elementos de branding para los 8 venues.', 1, 35000.00, 35000.00, 2),
    (pr_heineken, v_org_id, 'Dirección Creativa y Capacitación', 'Concepto de activación, guion de experiencia, capacitación del equipo y manuales de operación.', 1, 26999.14, 26999.14, 3);

  -- PepsiCo
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_pepsico, v_org_id, 'Degustaciones por Ciudad', 'Equipo de 3 personas por ciudad para degustaciones en tiendas de autoservicio clave.', 20, 5500.00, 110000.00, 1),
    (pr_pepsico, v_org_id, 'Materiales de Degustación', 'Mesas muestreadoras, uniformes de lanzamiento, banners y kits de producto por ciudad.', 1, 22000.00, 22000.00, 2),
    (pr_pepsico, v_org_id, 'Logística Nacional y Supervisión', 'Coordinación de traslados, hospedaje en ciudades foráneas y supervisión en sitio por región.', 1, 22662.07, 22662.07, 3);

  -- Sura
  INSERT INTO proposal_items (proposal_id, organization_id, concept, description, quantity, unit_price, total, sort_order)
  VALUES
    (pr_sura, v_org_id, 'Diseño y Producción de Stand 6x4m', 'Stand modular premium con estructura, recubrimiento de marca, mobiliario e iluminación LED.', 1, 58000.00, 58000.00, 1),
    (pr_sura, v_org_id, 'Tecnología: Pantallas y Audio', '2 pantallas LED 55", sistema de audio ambiente y looping de contenido corporativo Sura.', 1, 18000.00, 18000.00, 2),
    (pr_sura, v_org_id, 'Material Impreso Premium', 'Brochures institucionales, roll-ups y flyers de producto para el evento.', 1, 11337.93, 11337.93, 3);

  -- ============================================================
  --  STEP 8 — PEDIDOS (órdenes de compra)
  -- ============================================================
  INSERT INTO orders (
    id, organization_id, contact_id, client_id, proposal_id,
    title, status, total, amount_paid, payment_method,
    notes, created_by, created_at, updated_at
  ) VALUES
    (ord_bimbo, v_org_id, ct_maria, cl_bimbo, pr_bimbo,
     'Activación de Marca Bimbo Q4 2024', 'paid',
     280320.00, 280320.00, 'transfer',
     'Proyecto completado al 100%. Cliente muy satisfecha. Anticipo de 140,160 recibido el 15 oct. Saldo final liquidado el 15 nov. Alta probabilidad de renovación.',
     v_user_id,
     NOW() - INTERVAL '95 days', NOW() - INTERVAL '28 days'),

    (ord_banorte, v_org_id, ct_ana, cl_banorte, pr_banorte,
     'Sampling Tour Digital Banorte', 'partial',
     140320.00, 56128.00, 'transfer',
     'Fase 1 completada exitosamente. Anticipo de primera fase recibido. Fase 2 arranca la próxima semana. Saldo pendiente contra entrega fase 2.',
     v_user_id,
     NOW() - INTERVAL '78 days', NOW() - INTERVAL '18 days'),

    (ord_liverpool, v_org_id, ct_luis, cl_liverpool, pr_liverpool,
     'Exhibit BTL Liverpool Navidad 2024', 'partial',
     369920.00, 184960.00, 'transfer',
     'Anticipo del 50% recibido. Producción de materiales en proceso. Instalación programada para el 12 de diciembre. Saldo contra instalación.',
     v_user_id,
     NOW() - INTERVAL '82 days', NOW() - INTERVAL '12 days');

  -- ============================================================
  --  STEP 9 — PAGOS DE PEDIDOS
  -- ============================================================
  INSERT INTO order_payments (order_id, organization_id, amount, payment_method, payment_date, notes, created_by, created_at)
  VALUES
    -- Bimbo: 2 pagos (anticipo + saldo)
    (ord_bimbo, v_org_id, 140160.00, 'transfer',
     CURRENT_DATE - 80,
     'Anticipo 50% — Proyecto Activación Bimbo Q4 2024',
     v_user_id, NOW() - INTERVAL '80 days'),

    (ord_bimbo, v_org_id, 140160.00, 'transfer',
     CURRENT_DATE - 28,
     'Liquidación total — Proyecto Activación Bimbo Q4 2024 completado',
     v_user_id, NOW() - INTERVAL '28 days'),

    -- Banorte: anticipo fase 1
    (ord_banorte, v_org_id, 56128.00, 'transfer',
     CURRENT_DATE - 62,
     'Anticipo 40% — Sampling Tour Banorte, Fase 1',
     v_user_id, NOW() - INTERVAL '62 days'),

    -- Liverpool: anticipo 50%
    (ord_liverpool, v_org_id, 184960.00, 'transfer',
     CURRENT_DATE - 52,
     'Anticipo 50% — Exhibit Navideño Liverpool 2024. Aprobación de diseños recibida.',
     v_user_id, NOW() - INTERVAL '52 days');

  -- ============================================================
  --  STEP 10 — NOTAS DE CONTACTO (actividad del CRM)
  -- ============================================================
  INSERT INTO contact_notes (contact_id, organization_id, content, created_by, created_at)
  VALUES
    (ct_maria, v_org_id,
     'Primera reunión con María. Nos contactó a través de nuestros anuncios de Google. Presentación de portafolio exitosa. Muy interesada en activaciones Q4.',
     v_user_id, NOW() - INTERVAL '112 days'),
    (ct_maria, v_org_id,
     'Propuesta enviada por correo. María la revisó y pidió agregar supervisión de fin de semana. Ajuste hecho mismo día.',
     v_user_id, NOW() - INTERVAL '108 days'),
    (ct_maria, v_org_id,
     'Propuesta ACEPTADA. Firmaron contrato. Anticipo en proceso. Arranque de campaña en 15 días. ¡Primer cliente grande del año!',
     v_user_id, NOW() - INTERVAL '98 days'),
    (ct_maria, v_org_id,
     'Proyecto finalizado. María envió felicitaciones al equipo por los resultados. KPIs: 98% de asistencia de staff, +32% awareness en puntos activados. Renovación posible.',
     v_user_id, NOW() - INTERVAL '28 days'),

    (ct_roberto, v_org_id,
     'Primera presentación en Monterrey. Excelente reunión. Roberto muy entusiasmado con el concepto. Debe llevarlo al CFO para aprobación de presupuesto.',
     v_user_id, NOW() - INTERVAL '80 days'),
    (ct_roberto, v_org_id,
     'Follow-up por correo a los 10 días. Respuesta: proceso de aprobación aún en revisión interna. Paciencia.',
     v_user_id, NOW() - INTERVAL '62 days'),
    (ct_roberto, v_org_id,
     'Llamada de seguimiento. Roberto confirmó que el CFO aprobó el presupuesto en principio. Pendiente validación final de fechas. Llamada agendada para esta semana.',
     v_user_id, NOW() - INTERVAL '10 days'),

    (ct_jorge, v_org_id,
     'Jorge nos encontró buscando "agencia btl cdmx" en Google. Llamó directamente. Perfil ideal: director de activaciones con presupuesto aprobado para Copa Heineken 2025.',
     v_user_id, NOW() - INTERVAL '24 days'),
    (ct_jorge, v_org_id,
     'Reunión virtual vía Teams. Presentamos 3 conceptos de activación para venues deportivos. Jorge quedó impactado. Presupuesto confirmado: 200k-250k MXN. Reunión presencial pactada.',
     v_user_id, NOW() - INTERVAL '14 days'),

    (ct_alejandro, v_org_id,
     'Referido por Ana Torres de Banorte. Necesita stand corporativo para Expo Seguros 2025 en WTC. Presupuesto ajustado pero vale la pena por la referencia y proyección.',
     v_user_id, NOW() - INTERVAL '14 days');

  -- ============================================================
  --  STEP 11 — OBJETIVOS (Goals)
  -- ============================================================
  INSERT INTO goals (
    id, organization_id, title, description,
    category, metric_key, metric_unit,
    target_value, current_value, baseline_value,
    period, start_date, end_date,
    status, priority, owner_id, notes,
    created_at, updated_at
  ) VALUES
    (g1, v_org_id,
     'Facturación Q1 2025 — $2,500,000 MXN',
     'Alcanzar 2.5 millones MXN de facturación en Q1 mediante cierre de propuestas activas y captación de nuevos contratos por Google Ads.',
     'revenue', 'mxn_revenue', 'MXN',
     2500000.00, 950640.00, 0.00,
     'Q1 2025', '2025-01-01', '2025-03-31',
     'activo', 1, v_user_id,
     'Bimbo (280k) + Banorte (140k) + Liverpool (370k) = 790k base. PepsiCo y Heineken en negociación = +422k potencial.',
     NOW() - INTERVAL '70 days', NOW() - INTERVAL '5 days'),

    (g2, v_org_id,
     'Nuevos Clientes Q1 — 6 Cierres',
     'Cerrar 6 nuevos contratos en Q1 2025, consolidando el pipeline actual y maximizando la conversión de leads calientes.',
     'clients', 'new_clients', 'clientes',
     6.00, 3.00, 0.00,
     'Q1 2025', '2025-01-01', '2025-03-31',
     'activo', 2, v_user_id,
     '3 clientes activos (Bimbo, Banorte, Liverpool). Heineken y PepsiCo: alta probabilidad de cierre Q1. Santander en proceso.',
     NOW() - INTERVAL '70 days', NOW() - INTERVAL '5 days'),

    (g3, v_org_id,
     'Tasa de Conversión de Propuestas — 60%',
     'Mejorar la conversión de propuestas enviadas a aceptadas del 42% actual al 60%, mediante seguimiento más estructurado y propuestas mejor alineadas al cliente.',
     'sales', 'conversion_rate', '%',
     60.00, 42.00, 35.00,
     'Q1 2025', '2025-01-01', '2025-03-31',
     'activo', 3, v_user_id,
     'Propuestas aceptadas/enviadas: 3/7 = 42.8%. Meta 60% = 6/10. Clave: mejor calificación de leads y seguimiento a 48hrs.',
     NOW() - INTERVAL '70 days', NOW() - INTERVAL '5 days');

  -- Targets de objetivos
  INSERT INTO goal_targets (
    goal_id, organization_id, title,
    metric_key, metric_unit, target_value, current_value,
    weight, status, owner_id, sort_order, created_at
  ) VALUES
    -- g1: facturación por mes
    (g1, v_org_id, 'Enero 2025 — $750,000 MXN',   'monthly_revenue', 'MXN', 750000, 480320, 33.33, 'active', v_user_id, 1, NOW()),
    (g1, v_org_id, 'Febrero 2025 — $900,000 MXN',  'monthly_revenue', 'MXN', 900000, 325760, 33.33, 'active', v_user_id, 2, NOW()),
    (g1, v_org_id, 'Marzo 2025 — $850,000 MXN',    'monthly_revenue', 'MXN', 850000, 144560, 33.34, 'active', v_user_id, 3, NOW()),
    -- g2: clientes por bimestre
    (g2, v_org_id, 'Cierres Enero-Febrero',         'new_clients', 'clientes', 4, 3, 66.66, 'active', v_user_id, 1, NOW()),
    (g2, v_org_id, 'Cierres Marzo',                 'new_clients', 'clientes', 2, 0, 33.34, 'active', v_user_id, 2, NOW()),
    -- g3: propuestas
    (g3, v_org_id, 'Propuestas Enviadas (meta 10)', 'proposals_sent',     'propuestas', 10, 7, 50, 'active', v_user_id, 1, NOW()),
    (g3, v_org_id, 'Propuestas Cerradas (meta 6)',  'proposals_accepted', 'propuestas',  6, 3, 50, 'active', v_user_id, 2, NOW());

  -- ============================================================
  --  STEP 12 — PROYECTOS + TAREAS
  -- ============================================================
  INSERT INTO projects (
    id, organization_id, goal_id,
    title, description, color, status, priority,
    start_date, due_date,
    tasks_total, tasks_completed,
    owner_id, notes, created_by, created_at, updated_at
  ) VALUES
    (proj1, v_org_id, g1,
     'Cierre y Cobro Liverpool — Navidad 2024',
     'Asegurar instalación, entrega exitosa y cobro del saldo pendiente del proyecto Liverpool antes del 20 de diciembre.',
     '#10b981', 'active', 'alta',
     CURRENT_DATE - 30, CURRENT_DATE + 15,
     4, 2,
     v_user_id,
     'Producción en proceso. Instalación: 12 dic. Saldo de 184,960 pendiente contra entrega.',
     v_user_id,
     NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),

    (proj2, v_org_id, g2,
     'Cerrar Heineken Copa 2025',
     'Convertir al lead de Heineken en cliente confirmado. Reunión presencial esta semana para cerrar contrato Copa 2025.',
     '#f59e0b', 'active', 'alta',
     CURRENT_DATE - 10, CURRENT_DATE + 20,
     3, 0,
     v_user_id,
     'Lead caliente con presupuesto confirmado 200-250k. Reunión presencial pactada. Alta probabilidad de cierre.',
     v_user_id,
     NOW() - INTERVAL '10 days', NOW() - INTERVAL '3 days');

  -- Tareas proj1
  INSERT INTO tasks (project_id, organization_id, title, status, priority, due_date, assigned_to, completed_at, created_at)
  VALUES
    (proj1, v_org_id, 'Aprobar diseños finales con equipo Liverpool', 'done', NULL,
     CURRENT_DATE - 18, v_user_id, NOW() - INTERVAL '18 days', NOW() - INTERVAL '28 days'),
    (proj1, v_org_id, 'Producción de materiales y stands navideños', 'done', NULL,
     CURRENT_DATE - 5, v_user_id, NOW() - INTERVAL '5 days', NOW() - INTERVAL '25 days'),
    (proj1, v_org_id, 'Instalación en las 5 tiendas Liverpool (12 dic)', 'in_progress', NULL,
     CURRENT_DATE + 5, v_user_id, NULL, NOW() - INTERVAL '10 days'),
    (proj1, v_org_id, 'Cobrar saldo final $184,960 contra entrega', 'todo', NULL,
     CURRENT_DATE + 12, v_user_id, NULL, NOW() - INTERVAL '5 days');

  -- Tareas proj2
  INSERT INTO tasks (project_id, organization_id, title, status, priority, due_date, assigned_to, completed_at, created_at)
  VALUES
    (proj2, v_org_id, 'Reunión presencial con Jorge Vidal (Heineken CDMX)', 'in_progress', NULL,
     CURRENT_DATE + 3, v_user_id, NULL, NOW() - INTERVAL '8 days'),
    (proj2, v_org_id, 'Enviar propuesta Heineken Copa 2025 (finalizar borrador)', 'todo', NULL,
     CURRENT_DATE + 6, v_user_id, NULL, NOW() - INTERVAL '5 days'),
    (proj2, v_org_id, 'Negociación y cierre de contrato Heineken', 'todo', NULL,
     CURRENT_DATE + 18, v_user_id, NULL, NOW() - INTERVAL '3 days');

  -- ============================================================
  --  STEP 13 — PRESUPUESTOS
  -- ============================================================
  INSERT INTO budgets (organization_id, name, amount, type, category, recurrence, start_date, end_date, created_at)
  VALUES
    (v_org_id, 'Nómina Mensual — Equipo Operativo y Comercial', 85000.00, 'recurring', 'operaciones',   'monthly', '2025-01-01', '2025-12-31', NOW()),
    (v_org_id, 'Google Ads — Captación de Leads B2B',           25000.00, 'recurring', 'marketing',      'monthly', '2025-01-01', '2025-12-31', NOW()),
    (v_org_id, 'Renta Oficinas y Bodega CDMX',                  18000.00, 'recurring', 'operaciones',    'monthly', '2025-01-01', '2025-12-31', NOW()),
    (v_org_id, 'Software, Herramientas y Suscripciones',         8500.00, 'recurring', 'operaciones',    'monthly', '2025-01-01', '2025-12-31', NOW()),
    (v_org_id, 'Contabilidad y Asesoría Legal',                  6000.00, 'recurring', 'otro',           'monthly', '2025-01-01', '2025-12-31', NOW());

  INSERT INTO budgets (organization_id, name, amount, type, category, expense_date, created_at)
  VALUES
    (v_org_id, 'Adquisición de Equipo BTL — Expositores y Soportes', 45000.00, 'one_time', 'operaciones',       CURRENT_DATE - 45, NOW()),
    (v_org_id, 'Capacitación Comercial — Equipo de Ventas Q1',       12000.00, 'one_time', 'ventas',            CURRENT_DATE - 20, NOW()),
    (v_org_id, 'Diseño de Identidad y Materiales Corporativos',      18500.00, 'one_time', 'marketing',         CURRENT_DATE - 62, NOW()),
    (v_org_id, 'Producción de Portafolio y Caso de Éxito Bimbo',      8000.00, 'one_time', 'marketing',         CURRENT_DATE - 22, NOW());

  -- ============================================================
  --  STEP 14 — CONEXIONES DE MARKETING (simuladas como activas)
  -- ============================================================
  INSERT INTO marketing_connections (
    organization_id, source, status, external_name,
    last_sync_at, connected_by, created_at, updated_at
  ) VALUES
    (v_org_id, 'google_ads',             'active', 'Impulsa BTL — Google Ads MX',
     NOW() - INTERVAL '2 hours',  v_user_id, NOW() - INTERVAL '62 days', NOW() - INTERVAL '2 hours'),
    (v_org_id, 'search_console',         'active', 'impulsabtl.mx',
     NOW() - INTERVAL '3 hours',  v_user_id, NOW() - INTERVAL '62 days', NOW() - INTERVAL '3 hours'),
    (v_org_id, 'google_business_profile','active', 'Impulsa BTL — Ciudad de México',
     NOW() - INTERVAL '4 hours',  v_user_id, NOW() - INTERVAL '62 days', NOW() - INTERVAL '4 hours'),
    (v_org_id, 'ga4',                    'active', 'Impulsa BTL — GA4 Web',
     NOW() - INTERVAL '1 hour',   v_user_id, NOW() - INTERVAL '62 days', NOW() - INTERVAL '1 hour');

  -- ============================================================
  --  STEP 15 — MÉTRICAS DE MARKETING (90 días de datos simulados)
  --
  --  Tendencia: crecimiento gradual con varianza diaria natural.
  --  Refleja una agencia que va ganando tracción en digital.
  -- ============================================================

  -- ── Google Ads: Impresiones ───────────────────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_ads', d::date, 'impressions',
    ROUND((1800 + (EXTRACT(DOY FROM d) * 12) + (RANDOM() * 700 - 100))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Google Ads: Clics ─────────────────────────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_ads', d::date, 'clicks',
    ROUND((55 + (EXTRACT(DOY FROM d) * 0.5) + (RANDOM() * 60 - 10))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Google Ads: Costo (MXN) ───────────────────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_ads', d::date, 'cost',
    ROUND((580 + (EXTRACT(DOY FROM d) * 4) + (RANDOM() * 280 - 40))::numeric, 2),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Google Ads: Conversiones ──────────────────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_ads', d::date, 'conversions',
    ROUND((1.5 + (RANDOM() * 5.5))::numeric, 1),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Search Console: Sesiones orgánicas ───────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'search_console', d::date, 'sessions',
    ROUND((120 + (EXTRACT(DOY FROM d) * 2) + (RANDOM() * 110 - 20))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Search Console: Clics orgánicos ──────────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'search_console', d::date, 'clicks',
    ROUND((65 + (EXTRACT(DOY FROM d) * 1.2) + (RANDOM() * 65 - 10))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Search Console: Impresiones orgánicas ────────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'search_console', d::date, 'impressions',
    ROUND((1400 + (EXTRACT(DOY FROM d) * 6) + (RANDOM() * 500 - 80))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Search Console: Keywords top (últimos 30 días) ───────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type, dimension_value)
  SELECT v_org_id, 'search_console', d::date, 'clicks',
    ROUND((8 + (RANDOM() * 22))::numeric, 0),
    'keyword', kw
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day'::interval) d,
       (VALUES
         ('agencia btl cdmx'),
         ('activaciones de marca mexico'),
         ('promotoras para eventos empresariales'),
         ('agencia de activaciones b2b'),
         ('btl marketing empresas')
       ) AS keywords(kw);

  -- ── Google Business Profile: Vistas de perfil ────────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_business_profile', d::date, 'profile_views',
    ROUND((38 + (EXTRACT(DOY FROM d) * 0.8) + (RANDOM() * 70 - 10))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Google Business Profile: Llamadas telefónicas ────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_business_profile', d::date, 'phone_calls',
    ROUND((1.5 + (RANDOM() * 7))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Google Business Profile: Clics a sitio web ───────────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_business_profile', d::date, 'website_clicks',
    ROUND((10 + (EXTRACT(DOY FROM d) * 0.3) + (RANDOM() * 35 - 5))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ── Google Business Profile: Solicitudes de dirección ────
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_business_profile', d::date, 'direction_requests',
    ROUND((2 + (RANDOM() * 9))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- ============================================================
  --  STEP 16 — GA4 WEB METRICS (90 días)
  -- ============================================================

  -- GA4: Sessions
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'ga4', d::date, 'sessions',
    ROUND((180 + (EXTRACT(DOY FROM d) * 2.5) + (RANDOM() * 130 - 20))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- GA4: Engaged Sessions
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'ga4', d::date, 'engaged_sessions',
    ROUND((100 + (EXTRACT(DOY FROM d) * 1.5) + (RANDOM() * 80 - 10))::numeric, 0),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- GA4: Conversions
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'ga4', d::date, 'conversions',
    ROUND((3 + (RANDOM() * 8))::numeric, 1),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- GA4: Bounce Rate
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'ga4', d::date, 'bounce_rate',
    ROUND((35 + (RANDOM() * 20))::numeric, 2),
    'global'
  FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE - 1, '1 day'::interval) d;

  -- GA4: Top Pages (last 30 days)
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type, dimension_value)
  SELECT v_org_id, 'ga4', d::date, 'sessions',
    ROUND((15 + (RANDOM() * 50))::numeric, 0),
    'page', pg
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day'::interval) d,
       (VALUES
         ('/'),
         ('/servicios'),
         ('/portafolio'),
         ('/contacto'),
         ('/blog/activaciones-btl-exitosas')
       ) AS pages(pg);

  -- GA4: Channels (last 30 days)
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type, dimension_value)
  SELECT v_org_id, 'ga4', d::date, 'sessions',
    ROUND((20 + (RANDOM() * 60))::numeric, 0),
    'channel', ch
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day'::interval) d,
       (VALUES
         ('Organic Search'),
         ('Paid Search'),
         ('Direct'),
         ('Social'),
         ('Referral')
       ) AS channels(ch);

  -- ============================================================
  --  STEP 17 — MARKETING DAILY SUMMARY
  --  NOTA: marketing_daily_summary es una VIEW (no tabla).
  --  Se alimenta automáticamente desde marketing_metrics_values.
  --  Los datos de STEP 15 y 16 ya cubren 90 días.
  --  Pero la VIEW necesita 6 meses para las gráficas de tendencia,
  --  así que extendemos marketing_metrics_values a 180 días.
  -- ============================================================

  -- Extender Google Ads a 180 días (los últimos 90 ya están, agregar días 91-180)
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_ads', d::date, mk,
    CASE mk
      WHEN 'impressions' THEN ROUND((1800 + (EXTRACT(DOY FROM d) * 12) + (RANDOM() * 700 - 100))::numeric, 0)
      WHEN 'clicks'      THEN ROUND((55 + (EXTRACT(DOY FROM d) * 0.5) + (RANDOM() * 60 - 10))::numeric, 0)
      WHEN 'cost'        THEN ROUND((580 + (EXTRACT(DOY FROM d) * 4) + (RANDOM() * 280 - 40))::numeric, 2)
      WHEN 'conversions' THEN ROUND((1.5 + (RANDOM() * 5.5))::numeric, 1)
    END,
    'global'
  FROM generate_series(CURRENT_DATE - 180, CURRENT_DATE - 91, '1 day'::interval) d,
       (VALUES ('impressions'), ('clicks'), ('cost'), ('conversions')) AS metrics(mk);

  -- Extender Search Console a 180 días
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'search_console', d::date, mk,
    CASE mk
      WHEN 'impressions' THEN ROUND((1400 + (EXTRACT(DOY FROM d) * 6) + (RANDOM() * 500 - 80))::numeric, 0)
      WHEN 'clicks'      THEN ROUND((65 + (EXTRACT(DOY FROM d) * 1.2) + (RANDOM() * 65 - 10))::numeric, 0)
      WHEN 'sessions'    THEN ROUND((120 + (EXTRACT(DOY FROM d) * 2) + (RANDOM() * 110 - 20))::numeric, 0)
    END,
    'global'
  FROM generate_series(CURRENT_DATE - 180, CURRENT_DATE - 91, '1 day'::interval) d,
       (VALUES ('impressions'), ('clicks'), ('sessions')) AS metrics(mk);

  -- Extender GA4 a 180 días
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'ga4', d::date, mk,
    CASE mk
      WHEN 'sessions'    THEN ROUND((180 + (EXTRACT(DOY FROM d) * 2.5) + (RANDOM() * 130 - 20))::numeric, 0)
      WHEN 'conversions' THEN ROUND((3 + (RANDOM() * 8))::numeric, 1)
    END,
    'global'
  FROM generate_series(CURRENT_DATE - 180, CURRENT_DATE - 91, '1 day'::interval) d,
       (VALUES ('sessions'), ('conversions')) AS metrics(mk);

  -- Extender Google Business Profile a 180 días
  INSERT INTO marketing_metrics_values (organization_id, source, date, metric_key, value, dimension_type)
  SELECT v_org_id, 'google_business_profile', d::date, mk,
    CASE mk
      WHEN 'profile_views'      THEN ROUND((38 + (EXTRACT(DOY FROM d) * 0.8) + (RANDOM() * 70 - 10))::numeric, 0)
      WHEN 'phone_calls'        THEN ROUND((1.5 + (RANDOM() * 7))::numeric, 0)
      WHEN 'website_clicks'     THEN ROUND((10 + (EXTRACT(DOY FROM d) * 0.3) + (RANDOM() * 35 - 5))::numeric, 0)
      WHEN 'direction_requests' THEN ROUND((2 + (RANDOM() * 9))::numeric, 0)
    END,
    'global'
  FROM generate_series(CURRENT_DATE - 180, CURRENT_DATE - 91, '1 day'::interval) d,
       (VALUES ('profile_views'), ('phone_calls'), ('website_clicks'), ('direction_requests')) AS metrics(mk);

  -- ============================================================
  RAISE NOTICE '✅ Demo data insertado correctamente.';
  RAISE NOTICE '   Organization ID: %', v_org_id;
  RAISE NOTICE '   Usuario: demo@antuario.mx | Contraseña: Demo2024!';
  RAISE NOTICE '   Empresa: Impulsa BTL — Agencia de Activaciones';

END $$;
