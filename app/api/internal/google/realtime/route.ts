import {NextResponse} from 'next/server'
import {workspace} from '@/lib/workspace'
import {internalGoogleToken} from '@/lib/google-internal-auth'
import {GOOGLE_TARGETS} from '@/lib/internal-platform'
export const maxDuration=30
let cached:{at:number;data:unknown}|undefined
let pending:Promise<unknown>|undefined
async function collect(){
 const token=await internalGoogleToken('ga4')
 const query=async(body:unknown)=>{const res=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GOOGLE_TARGETS.ga4}:runRealtimeReport`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(18000)});if(!res.ok)throw new Error('No disponible');return res.json()}
 const [total,events]=await Promise.all([query({metrics:[{name:'activeUsers'},{name:'eventCount'}],minuteRanges:[{startMinutesAgo:29,endMinutesAgo:0}]}),query({dimensions:[{name:'eventName'}],metrics:[{name:'eventCount'}],minuteRanges:[{startMinutesAgo:29,endMinutesAgo:0}],limit:30})])
 const values=total.rows?.[0]?.metricValues??[]
 return {activeUsers:Number(values[0]?.value??0),eventCount:Number(values[1]?.value??0),events:(events.rows??[]).map((r:{dimensionValues:{value:string}[];metricValues:{value:string}[]})=>({name:r.dimensionValues[0].value,count:Number(r.metricValues[0].value)})),asOf:new Date().toISOString(),windowMinutes:30}
}
export async function GET(){
 const ctx=await workspace()
 if(!ctx)return NextResponse.json({error:'Sesión requerida'},{status:401})
 if(!ctx.can('marketing'))return NextResponse.json({error:'Sin acceso a marketing'},{status:403})
 try{if(!cached||Date.now()-cached.at>55000){pending??=collect().finally(()=>{pending=undefined});const data=await pending;cached={at:Date.now(),data}}return NextResponse.json(cached.data,{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'No se pudo consultar el tiempo real de Analytics'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
}
