import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {canArea,isScopedProductionSeat,scopedProductionPath,type Area} from '@/lib/team-access'
import type {TeamMember} from '@/lib/operations-types'
import {ANTUARIO_ORG_ID} from '@/lib/internal-platform'
import {isSameOrigin} from '@/lib/request-origin'

export async function proxy(request: NextRequest) {
  const path=request.nextUrl.pathname
  if(['/registro','/crear-organizacion','/seleccionar-organizacion','/admin/invitar'].includes(path)||path.startsWith('/oauth/')){
    const url=request.nextUrl.clone();url.pathname='/login';url.search=''
    return NextResponse.redirect(url)
  }
  if(path==='/api/admin/invite'||path.startsWith('/api/oauth/google/')||path.startsWith('/api/oauth/meta/')){
    return NextResponse.json({message:'Las fuentes de Antuario se configuran desde el servidor.'},{status:410})
  }
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Legacy server proxies also obey the internal team's permissions.
  if(path.startsWith('/api/chatwoot/')||path.startsWith('/api/contacts/')||path.startsWith('/api/oauth/google-calendar/')){
    if(!user)return NextResponse.json({error:'Inicia sesión'},{status:401})
    const {data:member}=await supabase.from('memberships').select('role').eq('user_id',user.id).eq('organization_id',ANTUARIO_ORG_ID).eq('status','active').maybeSingle()
    const {data:seat}=await supabase.from('team_members').select('*').eq('user_id',user.id).eq('organization_id',ANTUARIO_ORG_ID).maybeSingle()
    const writing=!['GET','HEAD'].includes(request.method)
    const administrative=path.startsWith('/api/oauth/')||['/api/chatwoot/connection','/api/chatwoot/inbox'].includes(path)
    if(!member||(administrative?member.role!=='owner':!canArea(member.role,seat as TeamMember|null,'sales',writing)))return NextResponse.json({error:'Sin permisos para esta operación'},{status:403})
    if(writing&&!isSameOrigin(request))return NextResponse.json({error:'Origen no permitido'},{status:403})
  }

  const { pathname } = request.nextUrl

  // Rutas protegidas: requieren sesión activa
  const protectedPrefixes = [
    '/dashboard',
    '/mi-trabajo',
    '/equipo',
    '/produccion',
    '/cuentas',
    '/ventas',
    '/marketing',
    '/objetivos',
    '/proyectos',
    '/configuracion',
    '/finanzas',
    '/contabilidad',
    '/contenido',
    '/indicadores',
    '/crear-organizacion',
    '/seleccionar-organizacion',
  ]

  const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if(user&&(isProtected||path.startsWith('/api/')||path==='/login'||path==='/perfil')){
    const [{data:member},{data:seat}]=await Promise.all([
      supabase.from('memberships').select('user_id,role').eq('user_id',user.id).eq('organization_id',ANTUARIO_ORG_ID).eq('status','active').maybeSingle(),
      supabase.from('team_members').select('*').eq('organization_id',ANTUARIO_ORG_ID).eq('user_id',user.id).maybeSingle(),
    ])
    if(!member&&isProtected){const url=request.nextUrl.clone();url.pathname='/sin-acceso';url.search='';return NextResponse.redirect(url)}
    if(member&&isScopedProductionSeat(member.role,seat as TeamMember|null)&&!scopedProductionPath(path)){
      if(path.startsWith('/api/'))return NextResponse.json({error:'Fuera de tu espacio de trabajo'},{status:403})
      const url=request.nextUrl.clone();url.pathname='/proyectos';url.search='';return NextResponse.redirect(url)
    }
    const area:Area|null=(pathname.startsWith('/proyectos')||pathname.startsWith('/produccion'))?'production':pathname.startsWith('/finanzas')?'finance':pathname.startsWith('/contabilidad')?'accounting':pathname.startsWith('/marketing')||pathname.startsWith('/contenido')?'marketing':pathname.startsWith('/ventas')?'sales':null
    if(area&&member){if(!canArea(member.role,seat as TeamMember|null,area)&&!(seat?.status==='active'&&seat.areas.includes(area)&&seat.client_ids.length&&area==='production')){const url=request.nextUrl.clone();url.pathname='/dashboard';url.search='';return NextResponse.redirect(url)}}
  }

  // Si está logueado y va a login/registro → redirigir al dashboard
  if (user && pathname === '/login') {
    const {data:member}=await supabase.from('memberships').select('user_id,role').eq('user_id',user.id).eq('organization_id',ANTUARIO_ORG_ID).eq('status','active').maybeSingle()
    const url = request.nextUrl.clone()
    url.pathname = member?'/dashboard':'/sin-acceso'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
