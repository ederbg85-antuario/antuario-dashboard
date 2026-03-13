import { createServerClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PropiedadSelectorClient from '@/components/oauth/PropiedadSelectorClient'

// ─── Fetcher via Edge Function google-list-properties ────────────────────────
// La Edge Function accede a los tokens almacenados y consulta Google APIs.
// Fallback: llamada directa a Google API si la Edge Function falla.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPropertiesViaEdgeFunction(
  connectionId: string,
  adminClient: SupabaseClient<any>
): Promise<{ id: string; name: string; meta: string }[]> {
  try {
    const { data, error } = await adminClient.functions.invoke('google-list-properties', {
      body: { connection_id: connectionId },
    })
    if (error) {
      console.error('google-list-properties Edge Function error:', error)
      return []
    }
    // La función devuelve { properties: [...] } o directamente el array
    const list = data?.properties ?? data ?? []
    if (!Array.isArray(list)) return []
    return list.map((p: { id?: string; name?: string; meta?: string; siteUrl?: string; displayName?: string }) => ({
      id:   p.id ?? p.siteUrl ?? p.name ?? '',
      name: p.name ?? p.displayName ?? p.siteUrl ?? p.id ?? '',
      meta: p.meta ?? '',
    }))
  } catch (err) {
    console.error('fetchPropertiesViaEdgeFunction error:', err)
    return []
  }
}

// ─── Fallback: fetchers directos a Google API (por si la Edge Function falla) ─

async function fetchPropertiesFallback(
  source: string,
  accessToken: string
): Promise<{ id: string; name: string; meta: string }[]> {
  try {
    if (source === 'search_console') {
      const res = await fetch(
        'https://www.googleapis.com/webmasters/v3/sites',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      return (data.siteEntry ?? []).map((s: { siteUrl: string; permissionLevel: string }) => ({
        id:   s.siteUrl,
        name: s.siteUrl,
        meta: s.permissionLevel ?? '',
      }))
    }

    if (source === 'ga4') {
      const res = await fetch(
        'https://analyticsadmin.googleapis.com/v1beta/accounts',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      const accounts = data.accounts ?? []

      const props: { id: string; name: string; meta: string }[] = []
      for (const account of accounts) {
        const propsRes = await fetch(
          `https://analyticsadmin.googleapis.com/v1beta/properties?filter=ancestor:${account.name}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const propsData = await propsRes.json()
        for (const prop of (propsData.properties ?? [])) {
          props.push({
            id:   prop.name.replace('properties/', ''),
            name: prop.displayName ?? prop.name,
            meta: account.displayName ?? account.name,
          })
        }
      }
      return props
    }

    if (source === 'google_ads') {
      const res = await fetch(
        'https://googleads.googleapis.com/v14/customers:listAccessibleCustomers',
        {
          headers: {
            Authorization:     `Bearer ${accessToken}`,
            'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
          },
        }
      )
      const data = await res.json()
      return (data.resourceNames ?? []).map((r: string) => {
        const id = r.replace('customers/', '')
        return { id, name: `Cuenta ${id}`, meta: 'Google Ads' }
      })
    }

    if (source === 'google_business_profile') {
      const res = await fetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      const accounts = data.accounts ?? []

      const locations: { id: string; name: string; meta: string }[] = []
      for (const account of accounts) {
        const locRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const locData = await locRes.json()
        for (const loc of (locData.locations ?? [])) {
          locations.push({
            id:   loc.name,
            name: loc.title ?? loc.name,
            meta: account.accountName ?? account.name,
          })
        }
        if (!locData.locations?.length) {
          locations.push({
            id:   account.name,
            name: account.accountName ?? account.name,
            meta: 'Cuenta Business Profile',
          })
        }
      }
      return locations
    }

    return []
  } catch (err) {
    console.error(`fetchPropertiesFallback error [${source}]:`, err)
    return []
  }
}

// ─── Source labels ────────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; propertyLabel: string; hint: string }> = {
  ga4: {
    label:         'Google Analytics 4',
    propertyLabel: 'Selecciona la propiedad de GA4',
    hint:          'Elige la propiedad de Google Analytics que corresponde a este cliente.',
  },
  search_console: {
    label:         'Google Search Console',
    propertyLabel: 'Selecciona el sitio de Search Console',
    hint:          'Elige el sitio web que quieres monitorear. Puedes conectar uno por organización.',
  },
  google_ads: {
    label:         'Google Ads',
    propertyLabel: 'Selecciona la cuenta de Google Ads',
    hint:          'Elige la cuenta de Ads cuyos datos quieres ver en el dashboard.',
  },
  google_business_profile: {
    label:         'Google Business Profile',
    propertyLabel: 'Selecciona tu perfil de negocio',
    hint:          'Elige la ubicación o perfil que quieres conectar.',
  },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SeleccionarPropiedadPage({
  searchParams,
}: {
  searchParams: Promise<{ connection_id?: string; source?: string }>
}) {
  const params = await searchParams
  const connectionId = params.connection_id
  const source       = params.source

  if (!connectionId || !source) redirect('/configuracion/integraciones?error=missing_params')

  // Verificar usuario autenticado
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Cargar la conexión pending con service_role (tiene access_token)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: connection } = await adminClient
    .from('marketing_connections')
    .select('id, source, access_token, organization_id, connected_by')
    .eq('id', connectionId)
    .eq('status', 'pending')
    .maybeSingle()

  // Si no existe o no es del usuario correcto → redirigir
  if (!connection || connection.connected_by !== user.id) {
    redirect('/configuracion/integraciones?error=session_not_found')
  }

  // Obtener propiedades via Edge Function google-list-properties.
  // Si falla, usa el fetcher directo a Google API como fallback.
  let properties = await fetchPropertiesViaEdgeFunction(connectionId, adminClient)
  if (properties.length === 0) {
    console.warn(`[seleccionar-propiedad] Edge Function devolvió 0 propiedades para ${source}, usando fallback directo`)
    properties = await fetchPropertiesFallback(source, connection.access_token)
  }

  const sourceMeta = SOURCE_META[source] ?? {
    label:         source,
    propertyLabel: 'Selecciona una propiedad',
    hint:          '',
  }

  return (
    <PropiedadSelectorClient
      connectionId={connectionId}
      source={source}
      sourceMeta={sourceMeta}
      properties={properties}
    />
  )
}
