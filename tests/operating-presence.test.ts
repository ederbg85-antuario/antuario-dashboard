import {test} from 'node:test'
import assert from 'node:assert/strict'
import {operationalSignal,operationalWorkload} from '../lib/operating-presence'
import type {WorkerPresence} from '../lib/team-presence'
import {businessFixture} from './helpers/business-fixture'
const now=Date.parse('2026-10-29T20:00:00Z'),signal={last_checked_at:'2026-10-29T19:59:00Z',state:'working'} as WorkerPresence

test('operating states need fresh authenticated reports, never membership or assigned workload',()=>{
 assert.equal(operationalSignal({status:'active'},undefined,now).key,'never')
 assert.equal(operationalSignal({status:'active'},signal,now,false).key,'unavailable')
 assert.equal(operationalSignal({status:'paused'},signal,now).key,'paused')
 assert.equal(operationalSignal({status:'active'},{...signal,state:'idle'},now).label,'Sin ejecución reportada')
 assert.equal(operationalSignal({status:'active'},signal,now).label,'Reporta trabajo')
 assert.equal(operationalSignal({status:'active'},{...signal,last_checked_at:'2026-10-29T19:34:59Z'},now).key,'stale')
 assert.equal(operationalSignal({status:'active'},{...signal,last_checked_at:'2099-10-29T19:59:00Z'},now).key,'stale')
 assert.equal(operationalSignal({status:'active'},{...signal,last_checked_at:'bad'},now).key,'never')
})
test('person counts deduplicate original tasks and exclude archived/completed project work',()=>{
 const data=businessFixture(),member=data.team[0],task={...data.tasks[0],status:'in_progress' as const,assignee_member_id:member.id,project_id:data.projects[0].id};data.clients[0].status='active';data.projects[0].status='active';data.tasks=[task,{...task}]
 assert.equal(operationalWorkload(data).get(member.id)?.length,1)
 data.projects[0].status='completed';assert.equal(operationalWorkload(data).get(member.id)?.length,0)
 data.projects[0].status='active';data.clients.find(c=>c.id===data.projects[0].client_id)!.status='archived';assert.equal(operationalWorkload(data).get(member.id)?.length,0)
})
