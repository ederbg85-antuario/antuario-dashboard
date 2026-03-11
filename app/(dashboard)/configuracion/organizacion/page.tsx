// ─── Server Component ─────────────────────────────────────────────────────────
// app/(dashboard)/configuracion/organizacion/page.tsx

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import OrganizacionClient from '@/components/configuracion/OrganizacionClient'

export default async function OrganizacionPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/crear-organizacion')

  // Only owner/admin can edit org settings
  if (!['owner', 'admin'].includes(membership.role)) {
    redirect('/dashboard')
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', membership.organization_id)
    .maybeSingle()

  let logoSignedUrl: string | null = null
  if (org?.logo_url) {
    const { data } = await supabase.storage.from('org-logos').createSignedUrl(org.logo_url, 3600)
    logoSignedUrl = data?.signedUrl ?? null
  }

  return (
    <OrganizacionClient
      orgId={membership.organization_id}
      orgName={org?.name ?? null}
      logoPath={org?.logo_url ?? null}
      logoSignedUrl={logoSignedUrl}
    />
  )
}
