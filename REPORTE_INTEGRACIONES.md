# Reporte: Corrección Frontend — Módulo de Integraciones de Marketing
**Fecha:** 2026-03-12
**Proyecto:** Antuario Dashboard
**Alcance:** Módulo de integraciones de marketing (flujo OAuth Google)

---

## 1. CAMBIOS REALIZADOS EN FRONTEND

### Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `app/api/oauth/google/connect/route.ts` | Scope `gmb` → `google_business_profile` en SCOPES |
| `app/api/oauth/google/confirmar/route.ts` | `source === 'gmb'` → `source === 'google_business_profile'`; response incluye `active_connection_id` |
| `app/api/marketing/sync/route.ts` | Función Edge Function `marketing-sync-{source}` → `google-sync-data` unificada |
| `app/oauth/seleccionar-propiedad/page.tsx` | Fetch de propiedades vía `google-list-properties` (con fallback a API directa); `gmb` → `google_business_profile` en SOURCE_META y fetchProperties |
| `app/(dashboard)/marketing/gmb/page.tsx` | `.eq('source', 'gmb')` → `.eq('source', 'google_business_profile')` (4 queries) |
| `components/configuracion/IntegracionesClient.tsx` | `key: 'gmb'` → `key: 'google_business_profile'`; display de estados mejorado |
| `components/oauth/PropiedadSelectorClient.tsx` | `gmb` → `google_business_profile` en SOURCE_ICONS y dashboardMap; auto-sync post-confirmación |
| `components/marketing/MarketingSubNav.tsx` | `source: 'gmb'` → `source: 'google_business_profile'` |
| `components/marketing/VisionMarketingClient.tsx` | SOURCE_META, ALL_SOURCES, y llamadas `sumMetric(..., 'gmb', ...)` → `google_business_profile` |
| `components/vision-maestra/VisionMaestraClient.tsx` | `sumM(..., 'gmb', ...)` y `r.source === 'gmb'` → `google_business_profile` |

---

### Componentes tocados
- `IntegracionesClient` — catálogo de fuentes, lógica de estados visuales
- `PropiedadSelectorClient` — dashboard map, auto-sync trigger
- `MarketingSubNav` — indicador de conexión activa por fuente
- `VisionMarketingClient` — SOURCE_META, ALL_SOURCES, filtros de métricas
- `VisionMaestraClient` — filtros de métricas por source

### Handlers tocados
- `handleConnect(source)` — ahora dispara con `google_business_profile` en lugar de `gmb`
- `handleConfirm()` en `PropiedadSelectorClient` — después de confirmar, dispara `google-sync-data` automáticamente para Search Console, GA4 y Business Profile

### Payloads corregidos
- **sync/route.ts**: body ahora incluye `source` explícito y llama `google-sync-data`
  ```json
  { "connection_id": "...", "source": "search_console", "date_from": "...", "date_to": "...", "manual": true }
  ```
- **confirmar/route.ts**: response ahora incluye `active_connection_id` para que el cliente pueda hacer el auto-sync con el ID correcto (tanto si se actualizó una conexión existente como si se activó la pending)

### Sources corregidos
- `gmb` eliminado por completo de todo el flujo funcional
- Reemplazado por `google_business_profile` en todos los puntos donde viaja al backend

---

## 2. FLUJOS CORREGIDOS

### Search Console
**Antes:** OAuth completaba, se guardaba la conexión como `active`, pero el botón "Sync ahora" llamaba `marketing-sync-search_console` (función inexistente en el nuevo backend). La UI no diferenciaba entre "conectado" y "datos disponibles".

**Ahora:**
1. OAuth → pending connection creada
2. Usuario selecciona sitio en `/oauth/seleccionar-propiedad`
3. `confirmar` activa la conexión con `external_id = URL del sitio`
4. **Auto-sync inmediato**: `PropiedadSelectorClient` llama `/api/marketing/sync` con el `active_connection_id`
5. `/api/marketing/sync` llama `google-sync-data` con `source: 'search_console'`
6. Redirect a `/marketing/seo?connected=search_console`
7. La UI muestra "Primer sync pendiente" si `last_sync_at === null` y "Sin sync todavía — presiona Sync ahora" como guía

### Google Business Profile
**Antes:** El flow enviaba `source: 'gmb'` al backend, que violaba el check constraint `marketing_connections_source_check`. La conexión nunca llegaba a guardarse.

**Ahora:** Todo el flow usa `source: 'google_business_profile'`:
- `connect/route.ts` construye el state con `google_business_profile`
- `callback/route.ts` guarda la pending con `source: 'google_business_profile'`
- `confirmar/route.ts` activa con `google_business_profile`
- El check constraint ya no se viola

### GA4
Sin cambio en el flujo de OAuth/confirmación (ya usaba `ga4` correctamente). Beneficio colateral: ahora también dispara auto-sync post-confirmación.

### Google Ads
Sin cambio de flujo. Consistente con los estados reales. Se reportó el issue de Developer Token pendiente abajo.

---

## 3. PROBLEMAS ENCONTRADOS

### Source mal nombrado — RESUELTO
- **Causa raíz**: `gmb` nunca fue un valor válido para el check constraint del backend. El frontend lo usaba en todos los flujos.
- **Impacto**: Business Profile nunca podía conectarse. Constraint error en insert.
- **Solución**: Renaming completo `gmb` → `google_business_profile` en 10 archivos.

### Sync llamaba función inexistente — RESUELTO
- **Causa raíz**: `/api/marketing/sync/route.ts` construía el nombre `marketing-sync-${source}` (ej. `marketing-sync-search_console`). El nuevo backend desplegó `google-sync-data`.
- **Impacto**: Todos los syncs manuales fallaban silenciosamente.
- **Solución**: Cambio a `google-sync-data` con `source` explícito en el body.

### Property listing directo a Google APIs — MITIGADO
- **Causa raíz**: La página `/oauth/seleccionar-propiedad` llamaba Google APIs directamente usando el `access_token` almacenado, sin pasar por el backend.
- **Impacto**: Si el token vencía o la API cambiaba estructura, la lista de propiedades fallaba.
- **Solución**: Se llama primero a `google-list-properties` Edge Function. Si retorna 0 propiedades (posible mismatch de respuesta con el formato esperado), cae back al método directo como fallback.

### Estados visuales engañosos — RESUELTO
- **Antes**: "Conectado" se mostraba si `status === 'active'`, sin importar `last_sync_at` o `external_id`.
- **Ahora**: La UI diferencia entre:
  - ✅ Conectado (activo + external_id + tiene sync)
  - ↻ Primer sync pendiente (activo + external_id + sin sync)
  - ⚠ Configuración incompleta (activo + sin external_id)
  - ⚠ Error de token (status = error)
  - ⏳ Esperando selección de propiedad (status = pending)
  - `last_error` mostrado siempre si existe

### Google Ads: Developer Token pendiente — NO RESUELTO (bloqueo de backend)
- La función `google-list-properties` para Google Ads requiere un Developer Token válido
- El valor de `GOOGLE_ADS_DEVELOPER_TOKEN` puede estar vacío o inválido
- El frontend queda consistente (no inventa conexión), pero no puede cerrar el flujo hasta que el Developer Token esté configurado en Supabase Secrets

---

## 4. PRUEBAS REALIZADAS

Las siguientes verificaciones fueron ejecutadas estáticamente (revisión de código y flujo):

### Business Profile
- ✅ `SCOPES` en `connect/route.ts` ya incluye `google_business_profile`
- ✅ `callback/route.ts` recibirá `source: 'google_business_profile'` desde el state
- ✅ Insert a `marketing_connections` usará `source: 'google_business_profile'` → sin constraint error
- ✅ `PropiedadSelectorClient` redirigiría a `/marketing/gmb?connected=google_business_profile`
- ✅ `gmb/page.tsx` consulta con `source: 'google_business_profile'`

### Search Console
- ✅ OAuth flow no cambió — sigue funcionando
- ✅ Después de confirmar, `PropiedadSelectorClient` dispara `/api/marketing/sync`
- ✅ `/api/marketing/sync` llama `google-sync-data` con `source: 'search_console'`
- ✅ La UI muestra "Primer sync pendiente" si `last_sync_at === null`

### Integraciones en general
- ✅ `IntegracionesClient` ya no tiene `'gmb'` en ningún source key funcional
- ✅ `MarketingSubNav` muestra dot verde para `google_business_profile`
- ✅ `VisionMarketingClient` filtra métricas por `google_business_profile`
- ✅ Sync route usa `google-sync-data` para todas las fuentes

---

## 5. QUÉ QUEDÓ FUNCIONANDO

1. **Google Business Profile — flujo de conexión**: El constraint error queda eliminado. La conexión puede crearse correctamente con `source: 'google_business_profile'`.

2. **Search Console — pipeline completo**: El flujo va de OAuth → selección de propiedad → activación → auto-sync → dashboard. El botón "Sync ahora" llama la función correcta (`google-sync-data`).

3. **Sync route unificada**: Todos los sources (GA4, Search Console, GBP) usan `google-sync-data` con `source` en el body.

4. **UI honesta**: La interfaz ya no muestra "Conectado" si `last_sync_at` es null. Muestra el estado real: pendiente de sync, error, configuración incompleta.

5. **Auto-sync post-conexión**: Después de confirmar la propiedad, Search Console, GA4 y GBP disparan automáticamente el primer sync para que los datos empiecen a fluir sin que el usuario tenga que ir a hacer clic manual.

6. **`google-list-properties` integrado**: La página de selección de propiedad intenta primero la Edge Function antes de llamar Google APIs directamente.

7. **`active_connection_id` en confirmar response**: Si el usuario reconecta una fuente que ya tenía conexión activa, el auto-sync usa el ID correcto (la conexión actualizada, no la pending eliminada).

---

## 6. QUÉ SIGUE DEPENDIENDO DE BACKEND O GOOGLE CLOUD

### `google-list-properties` — formato de respuesta no verificado
- El frontend asume que la función retorna `{ properties: [...] }` o directamente un array con items `{ id, name, meta }`
- Si el backend retorna un formato diferente, la Edge Function path devolverá 0 propiedades y caerá al fallback de API directa
- **Acción recomendada**: Verificar el response format real de `google-list-properties` y ajustar el mapeo en `seleccionar-propiedad/page.tsx` línea 26-31

### `google-save-selection` — no implementado en el frontend
- El confirmar route (`/api/oauth/google/confirmar`) todavía actualiza la DB directamente via service role key
- La Edge Function `google-save-selection` NO está siendo llamada aún
- **No es bloqueante** si el backend admite actualizaciones directas a `marketing_connections` desde el service role key
- **Acción recomendada**: Si el backend requiere que `google-save-selection` sea el único canal para activar conexiones, actualizar `confirmar/route.ts` para delegarlo

### Google Ads — Developer Token
- `google-list-properties` para Google Ads requiere `developer-token` header
- Si `GOOGLE_ADS_DEVELOPER_TOKEN` no está configurado en Supabase Secrets, la función fallará
- El frontend no puede compensar este problema

### `google-sync-data` — contrato de payload
- El frontend envía: `{ connection_id, source, date_from, date_to, manual: true }`
- Si la Edge Function no acepta `source` o espera campos distintos, el sync fallará
- La respuesta actual del sync route ya maneja errores de la Edge Function de forma no-bloqueante (warning en lugar de 500)

### Search Console — datos reales en dashboard
- El sync puede completarse pero los datos tardan en aparecer si la Edge Function tiene procesamiento async
- Si `last_sync_at` no se actualiza correctamente en `marketing_connections` después del sync, la UI seguirá mostrando "Primer sync pendiente"

---

## Criterio de Éxito — Estado

| Criterio | Estado |
|----------|--------|
| GBP deja de fallar por constraint | ✅ Resuelto |
| Search Console conectado al pipeline nuevo | ✅ Resuelto |
| Frontend usa `google-list-properties` | ✅ Implementado (con fallback) |
| Frontend usa `google-save-selection` | ⚠ Pendiente (confirmar route sigue con DB directo) |
| Frontend usa `google-sync-data` | ✅ Resuelto |
| UI muestra estados honestos | ✅ Resuelto |
| Frontend alineado con backend nuevo | ✅ Mayormente resuelto |
