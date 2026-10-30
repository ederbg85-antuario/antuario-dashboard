import {build} from 'esbuild'
import {createRequire} from 'node:module'
import path from 'node:path'

export type Row=Record<string,unknown>
export const ids={task:'10000000-0000-4000-8000-000000000001',otherTask:'10000000-0000-4000-8000-000000000002',project:'20000000-0000-4000-8000-000000000001',otherProject:'20000000-0000-4000-8000-000000000002',client:'30000000-0000-4000-8000-000000000001',otherClient:'30000000-0000-4000-8000-000000000002',member:'40000000-0000-4000-8000-000000000001',user:'50000000-0000-4000-8000-000000000001',checklist:'60000000-0000-4000-8000-000000000001'}
export function fixtureRows():Record<string,Row[]> {
 return {
  tasks:[{id:ids.task,organization_id:1,title:'Revisar entrega del dashboard',status:'in_progress',project_id:ids.project,due_date:'2026-10-28',task_areas:[],task_tags:[],due_date_kind:'proposed',assignee_member_id:ids.member,assigned_to:null,priority:2,description:'Validar la entrega con evidencia.',acceptance:'Revisión del responsable',next_action:'Probar calendario',blocked_reason:null,deliverable_url:null,updated_at:'2026-10-28T18:00:00.000Z'},{id:ids.otherTask,organization_id:1,title:'Preparar portafolio',status:'todo',project_id:ids.otherProject,due_date:null,due_date_kind:null,assigned_to:null,priority:3,updated_at:'2026-10-28T18:00:00.000Z'}],
  projects:[{id:ids.project,organization_id:1,client_id:ids.client,title:'Operación',status:'active'},{id:ids.otherProject,organization_id:1,client_id:ids.otherClient,title:'Marketing',status:'active'}],
  clients:[{id:ids.client,organization_id:1,name:'Cuenta de prueba A',status:'active',contracted_services:[]},{id:ids.otherClient,organization_id:1,name:'Cuenta de prueba B',status:'active',contracted_services:[]}],
  team_members:[{id:ids.member,organization_id:1,name:'Eder',position:'Dirección',kind:'human',status:'active',user_id:ids.user,areas:['production'],client_ids:[],access:'operator'}],
  task_checklist:[{id:ids.checklist,organization_id:1,task_id:ids.task,title:'Validar evidencia',done:false}],task_comments:[],operations_audit:[],memberships:[{id:ids.user,user_id:ids.user,organization_id:1,status:'active'}]
 }
}
/** In-memory query double for isolated handler tests. No production credentials or network. */
export function fixtureContext(rows=fixtureRows()) {
 let clock=0
 const events:{table:string;values:Row}[]=[]
 const context={orgId:1,user:{id:ids.user},role:'owner',seat:null,can:(_area:string,_write?:boolean,client?:string|null)=>client!==ids.otherClient,db:{from:(table:string)=>{
  const filters:((row:Row)=>boolean)[]=[];let values:Row|null=null,inserting=false,one=false
  const q={
   select:()=>q,
   eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return q},
   in:(key:string,values:unknown[])=>{filters.push(row=>values.includes(row[key]));return q},
   or:(expression:string)=>{const id=expression.split(',')[0].split('.').slice(2).join('.');filters.push(row=>row.record_id===id||(row.after_data as Row)?.task_id===id||(row.before_data as Row)?.task_id===id);return q},
   order:()=>q,limit:()=>q,
   update:(v:Row)=>{values=v;return q},insert:(v:Row)=>{values=v;inserting=true;return q},
   maybeSingle:()=>{one=true;return q},single:()=>{one=true;return q},
   then:(resolve:(v:{data:Row[]|Row|null;error:null})=>unknown)=>{
    let selected=(rows[table]??[]).filter(row=>filters.every(f=>f(row)))
    if(values){if(inserting){const row={id:crypto.randomUUID(),...values,author_id:ids.user,created_at:new Date().toISOString()};(rows[table]??=[]).push(row);selected=[row]}else{for(const row of selected)Object.assign(row,values,table==='tasks'?{updated_at:new Date(Date.UTC(2026,9,28,19,0,++clock)).toISOString()}:{})}for(const row of selected){events.push({table,values:{...row}});rows.operations_audit.push({id:rows.operations_audit.length+1,organization_id:1,actor_id:ids.user,entity:table,record_id:row.id,operation:inserting?'INSERT':'UPDATE',after_data:{...row},created_at:new Date().toISOString()})}}
    return Promise.resolve(resolve({data:one?(selected[0]??null):selected,error:null}))
   }
  };return q
 }}}
 return {context,rows,events}
}
export async function loadRoute<T>(filename:string,context:unknown):Promise<T> {
 const result=await build({entryPoints:[path.resolve(filename)],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-identity',setup(b){b.onResolve({filter:/^@\/lib\/workspace$/},()=>({path:'workspace',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function workspace(){return globalThis.__operationsContext}',loader:'js'}))}}]})
 const compiledModule={exports:{}}
 new Function('require','module','exports','globalThis',result.outputFiles[0].text)(createRequire(import.meta.url),compiledModule,compiledModule.exports,{__operationsContext:context})
 return compiledModule.exports as T
}
