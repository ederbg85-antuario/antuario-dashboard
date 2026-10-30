// Isolated visual/API fixture. Imports the real UI and handlers, with a test-only database double.
import {createServer} from 'node:http'
import {readFile,readdir} from 'node:fs/promises'
import path from 'node:path'
import {build} from 'esbuild'
import {NextRequest} from 'next/server'
import {fixtureContext,ids,loadRoute} from '../helpers/operations-route-fixture'
const fixture=fixtureContext()
fixture.context.can=()=>true
for(const [i,title,date,kind] of [[3,'Revisar copies del sitio','2026-10-29','follow_up'],[4,'Validar material del portafolio',null,null],[5,'Aprobar evidencia de entrega','2026-10-30','confirmed'],[6,'Revisar dependencias con cliente','2026-10-27','proposed']] as const){fixture.rows.tasks.push({...fixture.rows.tasks[0],id:`10000000-0000-4000-8000-00000000000${i}`,title,due_date:date,due_date_kind:kind,status:i===5?'review':'todo',priority:i===6?1:3,blocked_reason:i===4?'Esperando fotografías':null})}
const getRoute=await loadRoute<{GET:(q:NextRequest,p:{params:Promise<{id:string}>})=>Promise<Response>}>('app/api/operations/tasks/[id]/route.ts',fixture.context)
const postRoute=await loadRoute<{POST:(q:NextRequest)=>Promise<Response>}>('app/api/operations/route.ts',fixture.context)
const built=await build({entryPoints:['tests/fixtures/calendar-preview.tsx'],bundle:true,write:false,outdir:'/tmp/antuario-calendar-preview',platform:'browser',format:'esm',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'local-navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:path.resolve('tests/fixtures/navigation-preview.ts')}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children)}',loader:'js',resolveDir:process.cwd()}))}}]})
const js=built.outputFiles.find(f=>f.path.endsWith('.js'))!.text,cssFiles=await readdir('.next/static/css'),css=(await Promise.all(cssFiles.map(f=>readFile('.next/static/css/'+f,'utf8')))).join('\n')
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url!,'http://127.0.0.1:4319');let response:Response
 if(url.pathname==='/preview.js')response=new Response(js,{headers:{'content-type':'text/javascript'}})
 else if(url.pathname==='/styles.css')response=new Response(css,{headers:{'content-type':'text/css'}})
 else if(url.pathname.startsWith('/_next/static/media/')){response=new Response(await readFile('.next/static/media/'+path.basename(url.pathname)) as unknown as BodyInit)}
 else if(url.pathname==='/_fixture/data'){
  const r=fixture.rows
  response=json({ops:{...Object.fromEntries(['communications','reports','reviews','strategies','contentJobs','accounts','entries','documents','subscriptions','closings','accounting','content','proposals','connections','metrics','ads'].map(k=>[k,[]])),tasks:r.tasks,projects:r.projects,clients:r.clients,team:r.team_members,profiles:[{id:ids.user,full_name:'Eder'}],checklists:r.task_checklist,comments:r.task_comments,activity:r.operations_audit,capabilities:{production:true,productionWrite:true},errors:[],asOf:'2026-10-28T19:00:00Z',userId:ids.user,owner:true,role:'owner',orgId:1},bundle:{account:{id:ids.client,name:'Cuenta de prueba A'},existing_work:{projects:r.projects.filter(p=>p.client_id===ids.client),tasks:r.tasks.filter(t=>t.project_id===ids.project).map(t=>({...t,checklist:r.task_checklist.filter(c=>c.task_id===t.id)})),work_items:[],coverage:{errors:[],as_of:'2026-10-28T19:00:00Z'}},assignable_members:r.team_members,capabilities:{manage:true},data_mode:'live'}})
 }
 else if(url.pathname==='/_fixture/events')response=json(fixture.events)
 else if(url.pathname.startsWith('/api/operations/tasks/'))response=await getRoute.GET(new NextRequest(url),{params:Promise.resolve({id:url.pathname.split('/').at(-1)!})})
 else if(url.pathname==='/api/operations'){
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk))
  const body=Buffer.concat(chunks).toString();await new Promise(resolve=>setTimeout(resolve,250))
  response=await postRoute.POST(new NextRequest(url,{method:'POST',headers:{host:'127.0.0.1:4319',origin:'http://127.0.0.1:4319','content-type':'application/json'},body}))
 }else response=new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Antuario · laboratorio del calendario</title><link rel="stylesheet" href="/styles.css"><div id="root"></div><script type="module" src="/preview.js"></script></html>',{headers:{'content-type':'text/html'}})
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }catch(e){console.error(e);res.writeHead(500);res.end('Fixture error')}})
server.listen(4319,'127.0.0.1',()=>console.log('Calendar fixture: http://127.0.0.1:4319 · no production data'))
