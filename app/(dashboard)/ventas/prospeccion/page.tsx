import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireWorkspace } from '@/lib/workspace'
import Prospecting from '@/components/ventas/outbound/Prospecting'
export const dynamic='force-dynamic'
export default async function ProspeccionPage({searchParams}:{searchParams:Promise<{negocio?:string}>}){
 const ctx=await requireWorkspace()
 if(!ctx.can('sales'))redirect('/sin-acceso')
 const {negocio}=await searchParams
 if(negocio&&!z.uuid().safeParse(negocio).success)notFound()
 const {data,error}=await ctx.db.rpc('outbound_workspace')
 if(error||!data)throw new Error('No se pudo cargar Prospección')
 if(negocio&&!data.deals.some((d:{id:string})=>d.id===negocio))notFound()
 return <Prospecting initial={data} initialId={negocio}/>
}
