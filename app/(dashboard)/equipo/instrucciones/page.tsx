import {notFound} from 'next/navigation'
import {requireWorkspace} from '@/lib/workspace'
import {canReadWossInstructions} from '@/lib/woss-instructions-access'
import WossInstructions from '@/components/workspace/WossInstructions'

export const dynamic='force-dynamic'
export const metadata={title:'Instrucciones WOSS · Antuario',robots:{index:false,follow:false}}
export default async function Page(){
 const context=await requireWorkspace()
 if(!canReadWossInstructions(context))notFound()
 return <WossInstructions/>
}
