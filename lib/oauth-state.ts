import 'server-only'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {cookies} from 'next/headers'
import {workspace} from '@/lib/workspace'
export async function createOAuthState(provider:string,payload:{orgId:number;userId:string;source:string}){
 const state=Buffer.from(JSON.stringify({...payload,nonce:randomBytes(32).toString('hex')})).toString('base64url')
 ;(await cookies()).set(`antuario-oauth-${provider}`,state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:`/api/oauth/${provider}`})
 return state
}
export async function verifyOAuthState(provider:string,state:string){
 const jar=await cookies();const saved=jar.get(`antuario-oauth-${provider}`)?.value
 jar.set(`antuario-oauth-${provider}`,'',{path:`/api/oauth/${provider}`,maxAge:0,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'})
 if(!saved||saved.length!==state.length||!timingSafeEqual(Buffer.from(saved),Buffer.from(state)))return null
 try{
  const parsed=JSON.parse(Buffer.from(state,'base64url').toString())
  const context=await workspace()
  if(!context||context.user.id!==parsed.userId||context.orgId!==parsed.orgId||!['owner','admin'].includes(context.role))return null
  return parsed as {orgId:number;userId:string;source:string}
 }catch{return null}
}
