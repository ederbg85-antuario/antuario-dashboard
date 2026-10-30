import {ANTUARIO_ORG_ID} from './internal-platform'

type InstructionContext={orgId:number;role:string;user:{id:string;email?:string};seat:{user_id:string|null;status:string;access?:string;write_areas?:string[];client_ids?:string[]}|null}
/** Accept only the context derived by workspace() from Auth and active membership. */
export function canReadWossInstructions(context:InstructionContext|null|undefined){
 if(!context||context.orgId!==ANTUARIO_ORG_ID)return false
 if(context.role==='owner')return true
 const {user,seat}=context
 return user.email?.toLowerCase()==='woss@antuario.mx'&&seat?.user_id===user.id&&seat.status==='active'&&seat.access==='operator'&&!!seat.write_areas?.includes('people')&&!seat.client_ids?.length
}
