import {test} from 'node:test'
import assert from 'node:assert/strict'
import {presenceCounts,presenceFreshness,workerHeartbeatSchema,type WorkerPresence} from '../lib/team-presence'
import {scopedProductionPath} from '../lib/team-access'

const id='00000000-0000-4000-8000-000000000001',now=Date.parse('2026-10-20T22:00:00Z')
test('heartbeat payload rejects actor spoofing, timestamps, credentials and unsupported states',()=>{
 const value={state:'working',current_work_id:id,note:'Validando la entrega asignada'}
 assert.equal(workerHeartbeatSchema.safeParse(value).success,true)
 for(const extra of [{member_id:id},{organization_id:2},{reported_by:id},{last_checked_at:'2099-01-01'},{password:'secret'},{state:'online'},{note:'x'.repeat(501)}])assert.equal(workerHeartbeatSchema.safeParse({...value,...extra}).success,false)
 assert.equal(workerHeartbeatSchema.safeParse({state:'blocked'}).success,false)
 assert.equal(workerHeartbeatSchema.safeParse({state:'blocked',note:'Falta comprobante; solicitarlo a WOSS.'}).success,true)
 assert.equal(workerHeartbeatSchema.safeParse({state:'idle',current_work_id:id}).success,false)
 assert.equal(workerHeartbeatSchema.safeParse({state:'idle'}).success,true)
 assert.equal(scopedProductionPath('/api/team-presence'),true)
})
test('presence never infers active workers from missing, old or future-dated checks',()=>{
 assert.equal(presenceFreshness(null,now),'never')
 assert.equal(presenceFreshness('bad-date',now),'never')
 assert.equal(presenceFreshness('2026-10-20T21:35:00Z',now),'recent')
 assert.equal(presenceFreshness('2026-10-20T21:34:59Z',now),'stale')
 assert.equal(presenceFreshness('2026-10-20T22:02:00Z',now),'stale')
 assert.deepEqual(presenceCounts([{last_checked_at:null},{last_checked_at:'2026-10-20T21:00:00Z'},{last_checked_at:'2026-10-20T21:55:00Z'}] as WorkerPresence[],now),{never:1,stale:1,recent:1})
})
