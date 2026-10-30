import DashboardShell from '@/components/layout/DashboardShell'
import {requireWorkspace} from '@/lib/workspace'
import {AREAS,isScopedProductionSeat} from '@/lib/team-access'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const context=await requireWorkspace()
  const capabilities=Object.fromEntries(AREAS.map(a=>[a,context.can(a)||!!(context.seat?.status==='active'&&context.seat.areas.includes(a))]))
  capabilities.scopedProduction=!!isScopedProductionSeat(context.role,context.seat)
  // requireWorkspace already verifies the user and active Antuario membership.
  // Reuse that request-scoped identity; independent presentation reads run together.
  const {db:supabase,user,orgId}=context
  const [{data:profile},{data:organization}]=await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url').eq('id',user.id).maybeSingle(),
    supabase.from('organizations').select('name').eq('id',orgId).maybeSingle(),
  ])
  const avatarResult=profile?.avatar_url
    ? await supabase.storage.from('avatars').createSignedUrl(profile.avatar_url.replace(/^.*avatars\//,''),3600)
    : {data:null}
  const avatarSignedUrl=avatarResult.data?.signedUrl??null

  return (
    <DashboardShell
      capabilities={capabilities}
      orgName={organization?.name ?? 'Mi Organización'}
      orgId={orgId}
      logoSignedUrl={null}
      userName={profile?.full_name ?? user.email ?? 'Usuario'}
      avatarUrl={avatarSignedUrl}
    >
      {children}
    </DashboardShell>
  )
}
