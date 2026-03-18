import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PerfilClient from '@/components/perfil/PerfilClient'

export default async function PerfilPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  // Resolve signed URL server-side
  let avatarSignedUrl: string | null = null
  if (profile?.avatar_url) {
    const { data } = await supabase.storage.from('avatars').createSignedUrl(profile.avatar_url, 3600)
    avatarSignedUrl = data?.signedUrl ?? null
  }

  return (
    <PerfilClient
      userId={user.id}
      fullName={profile?.full_name ?? null}
      email={profile?.email ?? user.email ?? null}
      avatarPath={profile?.avatar_url ?? null}
      avatarSignedUrl={avatarSignedUrl}
    />
  )
}
