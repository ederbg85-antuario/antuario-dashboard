# Venta en frío + CRM de Antuario — contexto para agentes

> Documento de contexto para cualquier agente (IA o humano) que trabaje el sistema de ventas de Antuario en este dashboard. Léelo completo antes de tocar Prospección / CRM. Cliente: **Eder Basilio**, fundador de Antuario (español mexicano, pragmático, directo, anti-humo).

---

## 0. TL;DR
Antuario (agencia de marketing digital, CDMX) está montando **venta en frío** para generar reuniones sin depender de pauta. Todo se **gestiona nativo en este dashboard** sobre Supabase (`oarxbxaetlaeppkcahep`, `organization_id = 1`), NO en un CRM externo. Empieza Eder como único vendedor; se construye **multi-vendedor** para escalar.

**Lo que vendemos:** el **departamento de marketing completo** por una **iguala mensual** (tráfico + web + sistemas + dirección, con KPIs y accountability). No somos "otro proveedor". Objetivo del embudo = **reuniones → propuestas**.

---

## 1. La estrategia comercial

**Oferta principal (lo que se vende):** iguala mensual del departamento de marketing. Ver el modelo de propuestas en la memoria (`feedback-proposal-standard-model`, `feedback-proposal-packages-model`).

**Embudo adaptativo de 2 caminos** (se decide en la 1ª reunión, campo `deal_path` del prospecto):
- **`cotiza_directo`** — el prospecto ya tiene su necesidad clara o departamento interno → reunión de alineación → propuesta económica. NO se le arma el Plan gratis.
- **`disena_solucion`** — prospecto frío / "en cero" → se le ofrece el **"Plan de Crecimiento"** (gancho gratis): estudiamos su demanda, web y canales desde afuera + 1 llamada, y le diseñamos una solución con números. "Tómalo y hazlo tú, con otra agencia, o con nosotros."

**Reglas duras (de Eder):**
- La palabra **"diagnóstico" está vetada** en toda la marca. Usar "Plan de Crecimiento" / "revisión".
- **Solución y precio se presentan JUNTOS** en una reunión — no alargar el proceso con juntas de en medio (la gente está ocupada).
- El Plan gratis NO se ofrece a todos a ciegas: se invierte **solo tras confirmar fit** en la reunión (candado contra el "trabajo gratis" que Eder rechaza). Es acotado/productizado (framework + datos públicos + 1 llamada), no consultoría abierta.
- **No canibaliza la Consultoría de pago:** el Plan es de altitud (afuera); la Consultoría "y Desarrollo de Proyecto" es profunda (adentro, entrega un brief reutilizable).

**Calificación de leads (modelo de 2 ejes, aplica a todo el CRM):** ver memoria `feedback-lead-qualification-model`. Eje 1 = `lead_archetype` (`defined_project` vs `needs_development`). Eje 2 = `client_role` (`direct` / `intermediary` / `employee`).

---

## 2. El pipeline (etapas)

### Venta en frío — tabla `prospects` (staging, separada del CRM warm)
`por_investigar` → `por_contactar` → `contactado` → `siguiendo` → `interesado` → `reunion_agendada` → (`convertido` | `descartado`).
- **`por_investigar`** = dato genérico (Google Maps, contacto@, WhatsApp general): falta identificar al decisor. Se captura decisor (nombre + puesto + correo directo verificado + tel) → pasa a `por_contactar`.
- **`por_contactar`** = prospecto calificado (decisor + correo directo). Definición de "prospecto" de Eder.
- Al llegar a `reunion_agendada`/interés real se **convierte a `contacts`** (source `prospeccion-fria`) y sigue el pipeline warm.

### CRM warm — tabla `contacts` (`contact_type`)
`lead_nuevo` → `lead_potential` → `lead_relevant` → `proposal` (= reunión agendada) → `active_proposal` → `client`. (`lead_irrelevant` = descartado/frío.)
Fuentes: `formulario-web`, `mensajeria` (WhatsApp/agente Dylan), `prospeccion-fria`, `landing-plan-crecimiento`.

**Regla:** `contacts` es warm; `prospects` es cold. Se mantienen **separadas** para no ensuciar métricas, pero el **CRM las presenta unificadas** (una sola vista con el pipeline completo prospecto→cliente).

---

## 3. Arquitectura en el dashboard

- **Sección Ventas → CRM** (`/ventas/crm`) = EL workspace unificado (jul-2026): `components/ventas/CrmClient.tsx` + `components/ventas/EmbudoMetricas.tsx`. Unifica `prospects` (frío) + `contacts` (warm) + `proposals`. **Pipeline de 9 columnas en 3 fases** (definido con Eder): **Inbound** = `Nuevos` (leads web/WhatsApp/campañas que NOS contactan, = `contacts.contact_type lead_nuevo`); **Prospección · frío** = `Por investigar` (dato general → conseguir decisor) → `Por contactar` → `Contactado` → `En seguimiento`; **Oportunidad** = `Interesado` → `Reunión` → `Propuesta` → `Cliente`. Regla clave: **"Por investigar" y las columnas de prospección son solo para venta en frío**; los prospectos fríos NUNCA caen en "Nuevos"; los contactos inbound entran en "Nuevos" y saltan a Interesado (no pasan por las columnas de frío). Mapeos: `prospectCol`/`COL_TO_PROSPECT_STAGE` (frío) y `contactCol`/`COL_TO_CONTACT_TYPE` (warm). Tablero **drag & drop** valida por origen (mensajes claros al mover a columna no permitida; prospecto a Propuesta/Cliente exige convertir a contacto primero). Además: lista, pestaña **Métricas** (pipeline general de 9 + detalle frío `EmbudoMetricas`), ficha lateral **editable** (etapa, camino, vendedor, próxima acción, necesidad/notas, bitácora, compositor de plantillas con UTMs, convertir, descartar, captura de decisor), alta manual, agenda de pendientes, filtros por origen, KPIs con valor $ de propuestas. Diseño premium: header con auroras multicolor, KPIs con glow, columnas tintadas por etapa, tarjetas con acento lateral. `/ventas/prospeccion` **redirige** a `/ventas/crm` (ProspeccionClient eliminado).
- **Futuro agente n8n (planeado, NO construido):** automatizará mensajes (correo/WhatsApp al presionar un botón) y acciones al cambiar de etapa. La **fuente de eventos ya existe**: todo cambio de etapa y todo toque se registra en `prospect_activities` (type `etapa`/`toque`/`respuesta`/`sistema`) — el agente puede hacer polling de esa tabla o colgarse de un webhook/trigger de Postgres sobre ella. Diseñar cualquier automatización sobre esos eventos, no sobre la UI.
- **Tablas nuevas del motor** (migración `cold_sales_engine_v2`): `prospect_activities` (bitácora: toque/respuesta/nota/reunion/etapa/sistema · channel · direction · outcome · body · created_by), `message_templates` (plantillas de secuencia editables). RLS clonada de `prospects` (SELECT=org; INSERT/UPDATE=owner/admin/editor; DELETE=owner/admin) usando `get_user_org_ids()` + `get_user_role(org)`.
- **Otras vistas de ventas ya existentes:** Contactos, Empresas, Leads Relevantes, Propuestas, Pedidos, Clientes, Reuniones, Bandeja, Visión Ventas, Formularios web.
- **Propuestas:** ver `Propuestas/GUIA-PROPUESTAS-ANTUARIO.md` y memoria `feedback-proposal-*`.
- **Agente WhatsApp "Dylan"** (n8n): atiende leads inbound, califica y agenda Meet. Ver memoria `project-whatsapp-agent`. En frío NO se usa el número del API (riesgo de bloqueo); en frío escribe el vendedor.

---

## 4. Medición (embudo frío)

**División:** GA4/GTM (`GTM-K55R84FC`) mide la **web/landing** (tráfico, conversiones). El **dashboard** mide el **pipeline comercial** (no tráfico). El dashboard es interno, no lleva GA4.

**Esquema UTM canónico (venta en frío):**
| Param | Valores |
|---|---|
| `utm_source` | `email-frio` · `whatsapp-frio` · `tarjeta` · `visita` · `llamada` · `linkedin` |
| `utm_medium` | `outbound` |
| `utm_campaign` | `vfria-2026q3-legal` · `-inmo` · `-agencias` · `-tarjeta` |
| `utm_content` | toque/variante: `d0`, `d3`, `d7`… |
| `ref` | vendedor (`eder`) |
| `pid` | id del prospecto (atribución 1 a 1) |

**Landing `antuario.mx/plan-de-crecimiento`** (repo Antuario-Web, `src/app/plan-de-crecimiento/`): form → edge function `submit-lead` con `source=landing-plan-crecimiento` + UTMs + `pid`. Short link **`antuario.mx/r/eder`** (`src/app/r/[seller]/route.ts`) para el QR de las tarjetas.

**Puente landing → prospecto:** `submit-lead` (v3), si recibe `pid` válido, avanza el prospecto a `interesado` (nunca retrocede, usa STAGE_ORDER), liga `contact_id` y registra actividad `respuesta/entrante/"llenó la landing"`. Atribución (source/form_id/utm_*/ref/pid) se guarda en `web_form_submissions`.

---

## 5. Estado actual (jul-2026)

- **75 prospectos fríos** cargados (25 despachos legales, 25 inmobiliarias, 25 agencias/BTL; método Apollo — ver memoria `project-cold-outreach`), todos asignados a Eder.
- **44 contactos** en el CRM warm: 15 lead_potential, 11 lead_nuevo, 8 lead_irrelevant, 6 proposal, 2 active_proposal, 1 client, 1 lead_relevant.
- **7 propuestas** (todas `presentada`), 6 contactos con propuesta.
- **10 plantillas** de secuencia sembradas (borradores, faltan visto bueno de Eder).

## 6. Pendientes

1. Visto bueno de Eder a los copys de las plantillas.
2. **CRM unificado + rediseño** (en curso): que Prospección se vuelva el CRM que muestra prospectos fríos + contactos + propuestas + clientes en una sola vista, con mejor diseño (visual, profesional, simple).
3. Tarjeta print-ready con QR a `antuario.mx/r/eder` (falta: datos de Eder).
4. **DKIM + DMARC** en antuario.mx antes del primer batch (hoy solo SPF). DKIM se genera en Google Admin (cuenta admin de la Workspace de antuario.mx); DMARC = TXT `_dmarc` con `v=DMARC1; p=none; rua=mailto:hola@antuario.mx` en Hostinger. Requiere que Eder autentique (passkey/login) — un agente no puede meter credenciales.
5. Automatizar la secuencia (n8n + Gmail) cuando escale.

---
_Mantén este documento y la memoria (`/memory/project-cold-outreach.md`) sincronizados cuando cambie la estrategia o el motor._
