import {test} from 'node:test'
import assert from 'node:assert/strict'
import {canCoordinateTeamWork,createTeamWorkSchema,updateTeamWorkSchema,teamWorkCounts,type TeamWorkItem} from '../lib/team-work'
import {scopedProductionPath} from '../lib/team-access'

const id='00000000-0000-4000-8000-000000000001'
test('internal dispatch strictly rejects spoofed senders, organization IDs and credentials',()=>{
 const values={action:'create',recipient_member_id:id,area:'finance',title:'Registrar gasto',body:'Fecha, cuenta y comprobante',source_key:'owner-receipt:1'}
 assert.equal(createTeamWorkSchema.safeParse(values).success,true)
 for(const extra of [{sender_member_id:id},{organization_id:2},{password:'secret'},{status:'done'},{area:'admin'}])assert.equal(createTeamWorkSchema.safeParse({...values,...extra}).success,false)
})
test('completion needs evidence, blocked work needs a cause and updates cannot rewrite assignments',()=>{
 const values={action:'update',id,expected_updated_at:'2026-10-20T19:00:00.000Z',status:'done',evidence:'',blocked_reason:''}
 assert.equal(updateTeamWorkSchema.safeParse(values).success,false)
 assert.equal(updateTeamWorkSchema.safeParse({...values,evidence:'finance_entries/verified-id'}).success,true)
 assert.equal(updateTeamWorkSchema.safeParse({...values,status:'blocked'}).success,false)
 assert.equal(updateTeamWorkSchema.safeParse({...values,status:'blocked',blocked_reason:'Falta comprobante; pedirlo a WOSS'}).success,true)
 assert.equal(updateTeamWorkSchema.safeParse({...values,status:'in_progress',blocked_reason:'Sigue bloqueado'}).success,false)
 assert.equal(updateTeamWorkSchema.safeParse({...values,evidence:'Comprobante',recipient_member_id:id}).success,false)
})
test('only real coordination assigns work and scoped directors retain their own inbox',()=>{
 assert.equal(canCoordinateTeamWork('owner',null),true)
 assert.equal(canCoordinateTeamWork('viewer',{status:'active',access:'operator',write_areas:['people'],client_ids:[]}),true)
 assert.equal(canCoordinateTeamWork('viewer',{status:'active',access:'operator',write_areas:['finance'],client_ids:[]}),false)
 assert.equal(canCoordinateTeamWork('viewer',{status:'paused',access:'operator',write_areas:['people'],client_ids:[]}),false)
 assert.equal(scopedProductionPath('/mi-trabajo'),true)
 assert.equal(scopedProductionPath('/api/team-work'),true)
 assert.equal(scopedProductionPath('/finanzas'),false)
})
test('backlog counts only recorded work and completed tasks never count as overdue',()=>{
 const items=[{status:'pending',due_date:'2026-10-19'},{status:'done',due_date:'2026-10-18'},{status:'blocked',due_date:null},{status:'in_progress',due_date:'2026-10-20'}] as TeamWorkItem[]
 assert.deepEqual(teamWorkCounts(items,'2026-10-20'),{pending:1,inProgress:1,blocked:1,overdue:1})
})
