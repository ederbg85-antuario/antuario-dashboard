import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/crear-organizacion')

  const { data: organization } = await supabase
    .from('organizations')
    .select('name, logo_url')
    .eq('id', membership.organization_id)
    .maybeSingle()

  // Signed URL para avatar
  let avatarSignedUrl: string | null = null
  if (profile?.avatar_url) {
    const { data } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_url.replace(/^.*avatars\//, ''), 3600)
    avatarSignedUrl = data?.signedUrl ?? null
  }

  // Signed URL para logo
  let logoSignedUrl: string | null = null
  if (organization?.logo_url) {
    const { data } = await supabase.storage
      .from('org-logos')
      .createSignedUrl(organization.logo_url.replace(/^.*org-logos\//, ''), 3600)
    logoSignedUrl = data?.signedUrl ?? null
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar orgName={organization?.name ?? 'Mi Organización'} orgId={membership.organization_id} logoSignedUrl={logoSignedUrl} />
      <div className="flex-1 flex flex-col ml-[16rem] overflow-hidden">
        {/* Topbar incluye DateFilterBar — ver Topbar.tsx */}
        <Topbar
          userName={profile?.full_name ?? user.email ?? 'Usuario'}
          avatarUrl={avatarSignedUrl}
          showDateFilter={true}
        />
        <main className="flex-1 overflow-y-auto pt-20">
          {children}
        </main>
      </div>
    </div>
  )
}
