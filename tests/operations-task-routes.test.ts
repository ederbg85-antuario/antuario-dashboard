import {test} from 'node:test'
import assert from 'node:assert/strict'
import {NextRequest} from 'next/server'
import {fixtureContext,ids,loadRoute} from './helpers/operations-route-fixture'
type GetRoute={GET:(request:NextRequest,params:{params:Promise<{id:string}>})=>Promise<Response>}
type PostRoute={POST:(request:NextRequest)=>Promise<Response>}
const get=(route:GetRoute,task=ids.task,account=ids.client)=>route.GET(new NextRequest('http://localhost/api/operations/tasks/'+task+'?account='+account),{params:Promise.resolve({id:task})})
const post=(route:PostRoute,body:unknown,origin='http://localhost')=>route.POST(new NextRequest('http://localhost/api/operations',{method:'POST',headers:{host:'localhost',origin,'content-type':'application/json'},body:JSON.stringify(body)}))
test('task detail authenticates, scopes client and organization, and retains original evidence/checklist',async()=>{
 const fixture=fixtureContext(),route=await loadRoute<GetRoute>('app/api/operations/tasks/[id]/route.ts',fixture.context)
 const response=await get(route);assert.equal(response.status,200)
 const body=await response.json();assert.equal(body.task.id,ids.task);assert.equal(body.data.checklists[0].id,ids.checklist);assert.equal(body.data.dateKindsReady,true);assert.equal(body.data.classificationReady,true)
 assert.equal((await get(route,ids.task,ids.otherClient)).status,404)
 assert.equal((await get(route,ids.otherTask,ids.otherClient)).status,404)
 fixture.rows.tasks[0].organization_id=2;assert.equal((await get(route)).status,404)
 const unauth=await loadRoute<GetRoute>('app/api/operations/tasks/[id]/route.ts',null);assert.equal((await get(unauth)).status,401)
})
test('saving through Accounts updates the same task, preserves unrelated data and rejects stale writes',async()=>{
 const fixture=fixtureContext(),route=await loadRoute<PostRoute>('app/api/operations/route.ts',fixture.context)
 const task=fixture.rows.tasks[0],version=task.updated_at
 const body={table:'tasks',id:ids.task,expected_updated_at:version,values:{title:'Entrega revisada',due_date:'2026-10-30',due_date_kind:'follow_up'}}
 assert.equal((await post(route,body)).status,200)
 assert.equal(task.title,'Entrega revisada');assert.equal(task.project_id,ids.project);assert.equal(task.assignee_member_id,ids.member);assert.equal(fixture.rows.task_checklist[0].done,false)
 assert.equal((await post(route,body)).status,409)
 assert.equal(fixture.rows.tasks.length,2);assert.equal(fixture.events.length,1)
 assert.equal((await post(route,{...body,expected_updated_at:task.updated_at},'https://other.example')).status,403)
})
test('guarded saves cannot cross accounts, invent dates, or finish an incomplete checklist',async()=>{
 const fixture=fixtureContext(),route=await loadRoute<PostRoute>('app/api/operations/route.ts',fixture.context)
 assert.equal((await post(route,{table:'tasks',id:ids.otherTask,values:{title:'Cross client'}})).status,403)
 assert.equal((await post(route,{table:'tasks',id:ids.task,values:{status:'done'}})).status,400)
 assert.equal((await post(route,{table:'tasks',id:ids.otherTask,values:{due_date_kind:'confirmed'}})).status,403)
 fixture.rows.tasks[0].due_date=null
 assert.equal((await post(route,{table:'tasks',id:ids.task,values:{due_date_kind:'confirmed'}})).status,400)
 assert.equal(fixture.events.length,0)
})

test('classification saves canonical task and validates tags and areas without inference',async()=>{const fixture=fixtureContext(),route=await loadRoute<PostRoute>('app/api/operations/route.ts',fixture.context);assert.equal((await post(route,{table:'tasks',id:ids.task,values:{task_areas:['marketing','production'],task_tags:['SEO','diseño']}})).status,200);assert.deepEqual(fixture.rows.tasks[0].task_areas,['marketing','production']);assert.deepEqual(fixture.rows.tasks[0].task_tags,['seo','diseño']);assert.equal((await post(route,{table:'tasks',id:ids.task,values:{task_areas:['marketing','marketing']}})).status,400);assert.equal((await post(route,{table:'tasks',id:ids.task,values:{task_tags:['seo','SEO']}})).status,400);assert.equal((await post(route,{table:'tasks',id:ids.task,values:{task_tags:Array(9).fill('tag')}})).status,400);})

test('task feed cursor retains complete history at equal timestamps without duplicates or cross-task access',async()=>{
 const fixture=fixtureContext(),at='2026-10-29T18:00:00.000Z'
 fixture.rows.operations_audit=Array.from({length:75},(_,i)=>({id:i+1,organization_id:1,actor_id:ids.user,entity:'tasks',record_id:ids.task,operation:'UPDATE',created_at:at}))
 fixture.rows.operations_audit.push({id:999,organization_id:1,entity:'tasks',record_id:ids.otherTask,operation:'UPDATE',created_at:at})
 const route=await loadRoute<GetRoute>('app/api/operations/tasks/[id]/route.ts',fixture.context),first=await(await get(route)).json(),seen=first.data.activity.map((r:{id:number})=>r.id)
 assert.equal(seen.length,30)
 let cursor=first.data.feed.activity
 while(cursor){const response=await route.GET(new NextRequest('http://localhost/api/operations/tasks/'+ids.task+'?section=activity&cursor='+cursor),{params:Promise.resolve({id:ids.task})});assert.equal(response.status,200);const page=await response.json();seen.push(...page.items.map((r:{id:number})=>r.id));cursor=page.nextCursor}
 assert.equal(seen.length,75);assert.equal(new Set(seen).size,75);assert.ok(!seen.includes(999))
 const invalid=await route.GET(new NextRequest('http://localhost/api/operations/tasks/'+ids.task+'?section=activity&cursor=invalid'),{params:Promise.resolve({id:ids.task})});assert.equal(invalid.status,400)
 const forbidden=await route.GET(new NextRequest('http://localhost/api/operations/tasks/'+ids.otherTask+'?section=activity'),{params:Promise.resolve({id:ids.otherTask})});assert.equal(forbidden.status,404)
})
