# Prompt de Continuación — Antuario Dashboard Demo Mode Fix

## CONTEXTO GENERAL

Estoy trabajando en el modo demo del dashboard **Antuario** (una plataforma SaaS para agencias BTL). El usuario demo (`demo@antuario.mx` / `Demo2024!`) debe ver datos simulados en TODAS las secciones del dashboard. Ya hicimos avances significativos pero quedan problemas por resolver.

## STACK TÉCNICO

- **Frontend**: Next.js 16.1.6, App Router, TypeScript, React 19, Tailwind CSS 4
- **Backend/DB**: Supabase (PostgreSQL + SSR auth)
  - URL: `https://oarxbxaetlaeppkcahep.supabase.co`
- **Deploy**: Vercel
- **Repo**: El agente tiene acceso completo al código frontend

## ARQUITECTURA CLAVE

### Autenticación y Multi-tenancy
- Supabase SSR auth con cookies
- Resolución de organización: `memberships` table → `.eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle()`
- **Demo user UUID**: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Demo org_id**: `24` (organización "Impulsa BTL")

### Patrón de Server Components
Todos los page.tsx bajo `app/(dashboard)/` siguen este patrón:
```typescript
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // ← CAMBIO IMPORTANTE (ver abajo)
  { cookies: { getAll() { ... }, setAll(s) { ... } } }
)
// Auth check
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
// Org resolution
const { data: membership } = await supabase
  .from('memberships').select('organization_id, role')
  .eq('user_id', user.id).eq('status', 'active')
  .order('created_at', { ascending: true }).limit(1).maybeSingle()
const orgId = membership.organization_id
// Queries filtradas por orgId...
```

### CAMBIO ESTRUCTURAL IMPORTANTE — Service Role Key
En esta sesión se reemplazó `NEXT_PUBLIC_SUPABASE_ANON_KEY` por `SUPABASE_SERVICE_ROLE_KEY` en los **21 archivos de dashboard** (server components). Esto se hizo para bypasear RLS porque las políticas de RLS no estaban configuradas para el usuario demo.

**RIESGO**: El service_role key bypasea RLS completamente. La seguridad depende únicamente del filtro `.eq('organization_id', orgId)` en cada query. A largo plazo se debería:
1. Configurar políticas RLS adecuadas en Supabase
2. Revertir al uso de `NEXT_PUBLIC_SUPABASE_ANON_KEY` en los server components
3. O usar `createAdminClient()` (ya existe en `lib/supabase/server.ts`) solo donde sea necesario

**Archivos afectados** (todos bajo `app/(dashboard)/`):
layout.tsx, dashboard/page.tsx, marketing/page.tsx, marketing/layout.tsx, marketing/ads/page.tsx, marketing/seo/page.tsx, marketing/web/page.tsx, marketing/gmb/page.tsx, objetivos/page.tsx, proyectos/page.tsx, perfil/page.tsx, ventas/contactos/page.tsx, ventas/empresas/page.tsx, ventas/clientes/page.tsx, ventas/propuestas/page.tsx, ventas/pedidos/page.tsx, ventas/leads-relevantes/page.tsx, ventas/vision/page.tsx, ventas/bandeja/page.tsx, configuracion/organizacion/page.tsx, configuracion/integraciones/page.tsx

### Demo Mode para Bandeja de Entrada
- `lib/demo-data.ts` contiene `isDemoUser(userId)` que checa el UUID demo
- Devuelve 10 conversaciones mock (bypasea Chatwoot que es el servicio de mensajería externo)
- Solo aplica a Bandeja de Entrada, el resto de secciones usa datos reales de Supabase

### `lib/supabase/server.ts`
Tiene dos funciones:
- `createClient()` — usa anon key (para auth)
- `createAdminClient()` — usa service_role key (para queries de datos)

## BASE DE DATOS — Tablas Principales y su Uso

### marketing_metrics_values (tabla principal de marketing)
```
organization_id, source, date, metric_key, value, dimension_type, dimension_value
```
- `source`: 'google_ads', 'search_console', 'ga4', 'gmb'
- `dimension_type`: **DEBE SER 'global'** para que el VIEW funcione (ver abajo)
- `dimension_type` también puede ser 'page', 'channel', 'keyword', 'campaign' para datos granulares
- `metric_key`: 'impressions', 'clicks', 'cost', 'conversions', 'sessions', 'engaged_sessions', 'engagement_rate', 'bounce_rate', 'conversion_rate', 'profile_views', 'phone_calls', 'website_clicks', 'direction_requests'

### marketing_daily_summary (VIEW, no tabla)
```sql
SELECT organization_id, source, date, metric_key,
       sum(value) AS daily_total, avg(value) AS daily_avg
FROM marketing_metrics_values v
WHERE dimension_type = 'global'
GROUP BY organization_id, source, date, metric_key;
```
**CRÍTICO**: Este VIEW filtra por `dimension_type = 'global'`. Si los datos no tienen ese valor, el VIEW devuelve 0 filas. Ya se corrigió con UPDATE para los 1800 registros existentes, pero cualquier dato nuevo DEBE usar `dimension_type = 'global'` para métricas agregadas.

### marketing_connections
```
organization_id, source, status, external_name, last_sync_at
```
Hay 4 conexiones para org 24: google_ads, search_console, ga4, gmb

### contacts
```
organization_id, full_name, email, phone, company, contact_type, status, source, assigned_to, created_at
```
- `contact_type`: 'lead', 'lead_relevante', 'cliente'
- Actualmente: ~17 contacts (10 originales + 7 clientes nuevos + los leads)
- **OJO**: El embudo de Visión Maestra busca `contact_type = 'lead_relevant'` (con "t") NO 'lead_relevante'. Verificar cuál es el correcto.

### orders
```
organization_id, contact_id, title, total, status, created_at
```
- `status`: 'paid', 'pending', 'cancelled'
- El embudo cuenta `status = 'paid'` dentro del rango de fechas
- Se agregaron 7 pedidos recientes (6 paid + 1 pending) en los últimos 20 días

### goals
```
organization_id, title, category, progress_pct, status, priority, due_date
```
- `status` debe ser **'activo'** (español) — el dashboard filtra por `.eq('status', 'activo')`
- **EXCEPCIÓN**: `app/(dashboard)/proyectos/page.tsx` línea 46 filtraba por `'active'` (inglés) — YA SE CORRIGIÓ a `'activo'`
- Hay 3 goals para org 24

### goal_targets
```
goal_id, title, weight, current_value, target_value, metric_unit
```
- La columna se llama `metric_unit` NO `unit` — YA SE CORRIGIÓ en dashboard/page.tsx y VisionMaestraClient.tsx

### proposals, projects, tasks, budgets, companies
Todas filtradas por `organization_id = 24`. Ya tienen datos del seed.

## PROBLEMAS RESUELTOS

1. **RLS bloqueaba todas las queries** → Cambiado a service_role key en server components
2. **Org duplicada (20 vs 23 vs 24)** → Limpiado, membership apunta a org 24
3. **Profile full_name vacío** → Actualizado a 'Carlos Mendoza'
4. **ProyectosClient crash** → `(owner.full_name ?? ...)` cambiado a `(owner.full_name || ...)` para manejar string vacío (líneas 589 y 731)
5. **goal_targets.unit** → Corregido a `metric_unit` en query y type
6. **goals status 'active' vs 'activo'** en proyectos → Corregido a 'activo'
7. **marketing_daily_summary VIEW devolvía 0** → UPDATE dimension_type = 'global' para todos los registros
8. **Datos de marketing en org equivocada** → Membership actualizada a org 24

## PROBLEMAS PENDIENTES POR RESOLVER

### 1. Embudo — Discrepancia Clientes (6 en embudo vs 3 en sección Clientes)
**Causa probable**: El embudo cuenta `orders` con `status = 'paid'` en los últimos 30 días (da 6). La sección de Clientes (`ventas/clientes/page.tsx`) probablemente cuenta `contacts` con `contact_type = 'cliente'` de la tabla `clients` o similar. Necesitas investigar:
- Revisar `app/(dashboard)/ventas/clientes/page.tsx` para ver qué tabla/query usa
- Puede que haya una tabla `clients` separada de `contacts`
- Los nuevos pedidos se crearon con `contact_id` de contactos tipo 'cliente', pero eso no necesariamente los registra como "clientes" en la sección dedicada

### 2. Embudo — Engagement = 0
**Causa**: El embudo obtiene Engagement de métricas de marketing (`engagement_rate` o `engaged_sessions` de ga4). En Visión Maestra page.tsx, query #2 pide `metric_key` incluyendo `'engaged_sessions'` y `'engagement_rate'`. Los datos del seed probablemente no incluyen estas métricas para source `'ga4'`. Necesitas:
- Verificar: `SELECT DISTINCT metric_key FROM marketing_metrics_values WHERE organization_id = 24 AND source = 'ga4'`
- Si faltan `engaged_sessions`, `engagement_rate`, `visitors` → insertarlos
- Revisar `components/vision-maestra/VisionMaestraClient.tsx` para ver exactamente cómo calcula Engagement

### 3. Embudo — Leads Relevantes muestra 2, no los 10 que insertamos
**Causa**: El embudo filtra por `created_at` dentro del rango de fechas (últimos 30 días) Y por `contact_type = 'lead_relevant'` (con "t" final). Los 8 nuevos leads se insertaron con `contact_type = 'lead_relevante'` (sin "t"). Verificar:
- Cuál es el valor correcto: `lead_relevant` o `lead_relevante`
- Revisar la query #5 en dashboard/page.tsx línea 124: `.eq('contact_type', 'lead_relevant')`
- Si el valor correcto es `lead_relevant`, actualizar los contactos insertados

### 4. Página Web (GA4) — Visitantes = 0, Sesiones Engaged = 0
**Causa**: La página `marketing/web/page.tsx` consulta `marketing_metrics_values` con `source = 'ga4'` y `dimension_type = 'global'` para métricas como `sessions`, `engaged_sessions`, `visitors`. Los datos del seed probablemente solo tienen algunos metric_keys para ga4. Necesitas:
- Verificar: `SELECT DISTINCT metric_key FROM marketing_metrics_values WHERE organization_id = 24 AND source = 'ga4' AND dimension_type = 'global'`
- Insertar métricas faltantes: `visitors`, `engaged_sessions`, `engagement_rate`, `bounce_rate`, `conversion_rate`
- También faltan datos de `dimension_type = 'page'` (para Top Pages) y `dimension_type = 'channel'` (para Fuentes de Tráfico)

### 5. Google Ads — "Sin datos de campaña" y "Rendimiento por Campaña" vacío
**Causa**: La página `marketing/ads/page.tsx` probablemente busca datos con `dimension_type = 'campaign'` para la tabla de campañas. El seed solo insertó datos globales. Necesitas:
- Revisar `marketing/ads/page.tsx` para ver qué queries hace
- Insertar datos con `dimension_type = 'campaign'` y `dimension_value` con nombres de campañas como 'Campaña Branding Q1', 'Campaña Leads Marzo', etc.

### 6. Google SEO — "Sin datos de keywords" y "Sin oportunidades"
**Causa similar**: La página `marketing/seo/page.tsx` busca `dimension_type = 'keyword'` para la tabla de keywords. Necesitas:
- Revisar `marketing/seo/page.tsx`
- Insertar datos con `dimension_type = 'keyword'` y `dimension_value` con keywords relevantes

### 7. Objetivos — Posiblemente vacíos en Visión Maestra
Los goals existen (3 para org 24) con `status = 'activo'`. Si no aparecen en Visión Maestra, puede ser por el rango de fechas. Verificar que `goal_targets` tenga registros asociados a esos goals.

## DATOS ACTUALES EN SUPABASE (org 24)

| Tabla | Registros |
|-------|-----------|
| contacts | ~25 |
| companies | 6 |
| orders | 10 |
| projects | 2 |
| goals | 3 |
| tasks | 7 |
| budgets | 9 |
| proposals | 8 |
| marketing_connections | 4 |
| marketing_metrics_values | 1800 (todos dimension_type='global') |

## ARCHIVOS CLAVE A REVISAR

### Server Components (queries)
- `app/(dashboard)/dashboard/page.tsx` — Visión Maestra (embudo completo)
- `app/(dashboard)/marketing/web/page.tsx` — Página Web / GA4
- `app/(dashboard)/marketing/ads/page.tsx` — Google Ads
- `app/(dashboard)/marketing/seo/page.tsx` — Google SEO
- `app/(dashboard)/marketing/gmb/page.tsx` — Google Maps
- `app/(dashboard)/ventas/clientes/page.tsx` — Sección Clientes
- `app/(dashboard)/ventas/leads-relevantes/page.tsx` — Leads Relevantes

### Client Components (rendering)
- `components/vision-maestra/VisionMaestraClient.tsx` — Embudo y métricas
- `components/marketing/WebAnalyticsClient.tsx` — GA4 analytics
- `components/marketing/AdsClient.tsx` — Google Ads
- `components/marketing/SeoClient.tsx` — SEO
- `components/ventas/ClientesClient.tsx` — Lista de clientes

### Configuración
- `lib/supabase/server.ts` — createClient() y createAdminClient()
- `lib/demo-data.ts` — Mock data para Bandeja de Entrada
- `lib/date-filter.ts` — Filtro de fechas por cookie

## MÉTODO DE TRABAJO RECOMENDADO

1. **Siempre diagnosticar primero** — El usuario prefiere que le des queries SQL para correr en Supabase SQL Editor antes de hacer cambios en código
2. **Scripts uno por uno** — El usuario pidió explícitamente: "dame script por script, no todo junto"
3. **El agente NO tiene acceso al backend** — Solo puede leer/modificar código frontend. Para cambios en DB, debe dar scripts SQL al usuario
4. **Verificar después de cada cambio** — Hacer queries de verificación para confirmar que el fix funcionó
5. **El usuario hace push desde su terminal** — Después de cambios en código, el usuario hace git push manualmente

## SIGUIENTE PASO SUGERIDO

Empezar por el problema del embudo (el más visible):
1. Query diagnóstica: `SELECT DISTINCT source, metric_key FROM marketing_metrics_values WHERE organization_id = 24 AND dimension_type = 'global' ORDER BY source, metric_key` — para ver qué métricas existen por source
2. Query: `SELECT contact_type, COUNT(*) FROM contacts WHERE organization_id = 24 GROUP BY contact_type` — para verificar los valores de contact_type
3. Revisar `VisionMaestraClient.tsx` para entender cómo calcula cada paso del embudo
4. Insertar métricas faltantes y corregir contact_type si es necesario
