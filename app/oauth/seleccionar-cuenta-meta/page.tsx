import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MetaCuentaSelectorClient from '@/components/oauth/MetaCuentaSelectorClient'

// ─── Fetchers de cuentas Meta ─────────────────────────────────────────────────

async function fetchMetaAdAccounts(
  accessToken: string
): Promise<{ id: string; name: string; meta: string }[]> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&access_token=${accessToken}&limit=100`
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Meta Ad Accounts fetch error:', err)
      return []
    }
    const data = await res.json()
    return (data.data ?? []).map((a: { id: string; name: string; account_status: number; currency: string }) => ({
      id:   a.id,                                          // formato "act_XXXXXXXXXX"
      name: a.name,
      meta: `${a.currency ?? 'MXN'} · ${a.account_status === 1 ? 'Activa' : 'Inactiva'}`,
    }))
  } catch (err) {
    console.error('fetchMetaAdAccounts error:', err)
    return []
  }
}

async function fetchFacebookPages(
  accessToken: string
): Promise<{ id: string; name: string; meta: string }[]> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,fan_count&access_token=${accessToken}&limit=100`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? []).map((p: { id: string; name: string; category: string; fan_count: number }) => ({
      id:   p.id,
      name: p.name,
      meta: `${p.category ?? 'Página'} · ${(p.fan_count ?? 0).toLocaleString('es-MX')} seguidores`,
    }))
  } catch (err) {
    console.error('fetchFacebookPages error:', err)
    return []
  }
}

async function fetchInstagramAccounts(
  accessToken: string
): Promise<{ id: string; name: string; meta: string }[]> {
  try {
    // Primero obtener páginas conectadas
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,name,username,followers_count}&access_token=${accessToken}&limit=100`
    )
    if (!pagesRes.ok) return []
    const pagesData = await pagesRes.json()

    const accounts: { id: string; name: string; meta: string }[] = []
    for (const page of (pagesData.data ?? [])) {
      const ig = page.instagram_business_account
      if (ig) {
        accounts.push({
          id:   ig.id,
          name: ig.name ?? ig.username ?? ig.id,
          meta: `@${ig.username ?? ig.id} · ${(ig.followers_count ?? 0).toLocaleString('es-MX')} seguidores · via ${page.name}`,
        })
      }
    }
    return accounts
  } catch (err) {
    console.error('fetchInstagramAccounts error:', err)
    return []
  }
}

// ─── Source labels ────────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; accountLabel: string; hint: string }> = {
  meta_ads: {
    label:        'Meta Ads',
    accountLabel: 'Selecciona la cuenta publicitaria de Meta',
    hint:         'Elige la cuenta de Meta Ads cuyos datos de campañas quieres ver en el dashboard.',
  },
  facebook: {
    label:        'Facebook Pages',
    accountLabel: 'Selecciona tu Página de Facebook',
    hint:         'Elige la Página de Facebook cuyas métricas orgánicas quieres monitorear.',
  },
  instagram: {
    label:        'Instagram Business',
    accountLabel: 'Selecciona tu cuenta de Instagram',
    hint:         'Elige la cuenta de Instagram Business conectada a tu Página de Facebook.',
  },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SeleccionarCuentaMetaPage({
  searchParams,
}: {
  searchParams: Promise<{ connection_id?: string; source?: string }>
}) {
  const params       = await searchParams
  const connectionId = params.connection_id
  const source       = params.source

  if (!connectionId || !source) redirect('/configuracion/integraciones?error=missing_params')

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

  if (!connection || connection.connected_by !== user.id) {
    redirect('/configuracion/integraciones?error=session_not_found')
  }

  // Obtener cuentas según el source
  let accounts: { id: string; name: string; meta: string }[] = []

  if (source === 'meta_ads') {
    accounts = await fetchMetaAdAccounts(connection.access_token)
  } else if (source === 'facebook') {
    accounts = await fetchFacebookPages(connection.access_token)
  } else if (source === 'instagram') {
    accounts = await fetchInstagramAccounts(connection.access_token)
  }

  const sourceMeta = SOURCE_META[source!] ?? {
    label:        source,
    accountLabel: 'Selecciona una cuenta',
    hint:         '',
  }

  return (
    <MetaCuentaSelectorClient
      connectionId={connectionId!}
      source={source!}
      sourceMeta={sourceMeta}
      accounts={accounts}
    />
  )
}
