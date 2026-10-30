import {test} from 'node:test'
import assert from 'node:assert/strict'
import {activeClientProjects,isCurrentProject} from '../lib/client-lifecycle'
import {clientWork,responsibilityRows} from '../lib/performance'
import {memberTasks} from '../lib/accountability'
import type {Client,Project,Task,TeamMember} from '../lib/operations-types'

const clients=[{id:'acriland',name:'Acriland',status:'active'},{id:'metrica',name:'Métrica BTL',status:'active'},{id:'fcm',name:'Francés con Marie',status:'archived'},{id:'fly',name:'Fly Club',status:'archived'}] as Client[]
const projects=[{id:'a',client_id:'acriland',status:'active'},{id:'m',client_id:'metrica',status:'active'},{id:'f',client_id:'fcm',status:'active'},{id:'past',client_id:'metrica',status:'completed'},{id:'internal',client_id:null,status:'active'}] as Project[]

test('only current client work contributes to operating metrics while archived history stays intact',()=>{
 assert.deepEqual(activeClientProjects({clients,projects}).map(p=>p.id),['a','m'])
 assert.equal(isCurrentProject(projects[2],clients),false)
 assert.equal(isCurrentProject(projects[4],clients),true)
 assert.equal(projects.length,5)
 assert.equal(clients.length,4)
 const tasks=projects.map(p=>({id:p.id,project_id:p.id,status:'todo',assignee_member_id:'max'})) as Task[]
 const team=[{id:'max',name:'Max',position:'Desarrollo',status:'active',kind:'agent',areas:['production'],client_ids:[],email:null,user_id:null,access:'operator',responsibilities:null}] as TeamMember[]
 assert.deepEqual(clientWork({clients,projects,tasks}).map(t=>t.id),['a','m'])
 assert.equal(responsibilityRows({clients,projects,tasks,team}).reduce((n,r)=>n+r.total,0),2)
 assert.equal(tasks.length,5)
})

test('reactivating a client restores only projects that have not ended',()=>{
 const restored=clients.map(c=>c.id==='fcm'?{...c,status:'active' as const}:c)
 assert.deepEqual(activeClientProjects({clients:restored,projects}).map(p=>p.id),['a','m','f'])
 assert.equal(isCurrentProject({...projects[2],status:'cancelled'},restored),false)
})

test('a reassigned quality lead is measured on current assigned work instead of an archived account',()=>{
 const lisa={id:'lisa',kind:'agent',areas:['production'],client_ids:['acriland','metrica']} as TeamMember
 const work=[{id:'qa',project_id:'a',assignee_member_id:'lisa'},{id:'old',project_id:'f',assignee_member_id:'lisa'}] as Task[]
 const history=projects.map(p=>p.id==='f'?{...p,director_member_id:'lisa'}:p)
 const currentTasks=clientWork({clients,projects:history,tasks:work})
 const result=memberTasks({clients,projects:history,tasks:currentTasks},lisa)
 assert.equal(result.managed,false)
 assert.deepEqual(result.tasks.map(t=>t.id),['qa'])
})
