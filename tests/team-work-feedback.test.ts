import {test} from 'node:test'
import assert from 'node:assert/strict'
import {commentTeamWorkSchema,reviewTeamWorkSchema,listTeamWorkSchema,workReviewState,type TeamWorkEvent} from '../lib/team-work'

const id='00000000-0000-4000-8000-000000000001'
const expected_updated_at='2026-10-20T19:00:00.000Z'
test('conversation and review requests reject impersonation, unbounded messages and stale-shape requests',()=>{
 const message={action:'comment',work_id:id,body:'¿Falta el comprobante?',source_key:'expense:reply-1'}
 assert.equal(commentTeamWorkSchema.safeParse(message).success,true)
 for(const extra of [{author_id:id},{author_member_id:id},{organization_id:2},{kind:'accepted'},{body:'  '},{body:'x'.repeat(3001)}])assert.equal(commentTeamWorkSchema.safeParse({...message,...extra}).success,false)
 const review={action:'review',work_id:id,body:'Evidencia cotejada.',verdict:'accepted',expected_updated_at}
 assert.equal(reviewTeamWorkSchema.safeParse(review).success,true)
 assert.equal(reviewTeamWorkSchema.safeParse({...review,expected_updated_at:undefined}).success,false)
 assert.equal(reviewTeamWorkSchema.safeParse({...review,verdict:'approved'}).success,false)
 assert.equal(reviewTeamWorkSchema.safeParse({...review,work_version:4}).success,false)
})
test('approval applies only to the actual submitted version; comments do not invalidate it',()=>{
 const accepted={id,kind:'accepted',work_version:3,created_at:expected_updated_at} as TeamWorkEvent
 const comment={id:'2',kind:'comment',work_version:3,created_at:'2026-10-20T20:00:00.000Z'} as TeamWorkEvent
 assert.equal(workReviewState({status:'done',submission_version:3},[accepted,comment]),'accepted')
 assert.equal(workReviewState({status:'done',submission_version:4},[accepted]),'awaiting_review')
 assert.equal(workReviewState({status:'done',submission_version:3},[]),'awaiting_review')
 const change={...accepted,kind:'changes_requested'} as TeamWorkEvent
 assert.equal(workReviewState({status:'pending',submission_version:4},[change]),'changes_requested')
 assert.equal(workReviewState({status:'done',submission_version:5},[change]),'awaiting_review')
 assert.equal(workReviewState({status:'in_progress',submission_version:4},[accepted]),'not_submitted')
})
test('polling filters are bounded and explicitly include all work unless filtered',()=>{
 assert.deepEqual(listTeamWorkSchema.parse({}),{status:'all',limit:200,offset:0})
 assert.deepEqual(listTeamWorkSchema.parse({status:'open',limit:'20',offset:'40',updated_after:expected_updated_at}),{status:'open',limit:20,offset:40,updated_after:expected_updated_at})
 assert.equal(listTeamWorkSchema.parse({work_id:id}).work_id,id)
 for(const query of [{limit:'201'},{limit:'0'},{offset:'-1'},{updated_after:'yesterday'},{organization_id:'2'}])assert.equal(listTeamWorkSchema.safeParse(query).success,false)
})
