import {test} from 'node:test'
import assert from 'node:assert/strict'
import {addDays,calendarDays,calendarTasks,mexicoDay,movePeriod,taskPerson,taskPersonKey} from '../lib/operations-calendar'
import type {OpsData,Project,Task} from '../lib/operations-types'
import {operationSchemas} from '../lib/operations-schema'
const project=(id:string,client_id:string|null,status='active')=>({id,client_id,status}) as Project
const task=(id:string,overrides:Partial<Task>={})=>({id,title:id,project_id:'p',status:'todo',due_date:null,assigned_to:null,priority:2,...overrides}) as Task
const data={projects:[project('p','a'),project('internal',null),project('archive','b'),project('done','a','completed')],clients:[{id:'a',name:'A',contracted_services:[]},{id:'b',name:'B',status:'archived',contracted_services:[]}],tasks:[task('dated',{due_date:'2026-10-28',assignee_member_id:'eder',priority:1}),task('undated'),task('blocked',{blocked_reason:'Faltan fotos'}),task('finished',{status:'done'}),task('internal',{project_id:'internal'}),task('archive',{project_id:'archive'}),task('closed-project',{project_id:'done'}),task('dated',{due_date:'2026-10-28',assignee_member_id:'eder',priority:1})]} as Pick<OpsData,'projects'|'clients'|'tasks'>
const filters={client:'',person:'',priority:'',status:'open'}
test('CDMX midnight and civil dates never shift due dates',()=>{
 assert.equal(mexicoDay('2026-10-29T05:59:59Z'),'2026-10-28')
 assert.equal(mexicoDay('2026-10-29T06:00:00Z'),'2026-10-29')
 assert.equal(addDays('2026-10-31',1),'2026-11-01')
 assert.equal(addDays('2028-02-28',1),'2028-02-29')
})
test('Monday weeks and variable month grids span year/leap boundaries',()=>{
 assert.deepEqual(calendarDays('2026-10-28','week'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01'])
 assert.equal(calendarDays('2026-11-01','month').length,42)
 assert.equal(calendarDays('2027-02-18','month').length,28)
 assert.equal(movePeriod('2026-12-31','month',1),'2027-01-01')
 assert.equal(movePeriod('2026-03-31','month',-1),'2026-02-01')
})
test('calendar counts canonical tasks once, including internal and undated, excluding archived history',()=>{
 const result=calendarTasks(data,filters)
 assert.equal(result.length,4)
 assert.equal(result.filter(t=>!t.due_date).length,3)
 assert.equal(result.filter(t=>t.due_date==='2026-10-28').length,1)
 assert.equal(calendarTasks(data,{...filters,status:''}).length,5)
 assert.deepEqual(calendarTasks(data,{...filters,status:'done'}).map(t=>t.id),['finished'])
})
test('client, owner, priority, blocked and combined filters use original fields',()=>{
 assert.equal(calendarTasks(data,{...filters,client:'a'}).length,3)
 assert.deepEqual(calendarTasks(data,{...filters,client:'internal'}).map(t=>t.id),['internal'])
 assert.deepEqual(calendarTasks(data,{...filters,person:'member:eder',priority:'1',client:'a'}).map(t=>t.id),['dated'])
 assert.deepEqual(calendarTasks(data,{...filters,status:'blocked'}).map(t=>t.id),['blocked'])
 assert.equal(calendarTasks(data,{...filters,person:'unassigned'}).length,3)
 assert.equal(calendarTasks(data,{...filters,priority:'4'}).length,0)
 const legacy=task('legacy',{assigned_to:'u'})
 assert.equal(taskPersonKey(legacy),'user:u')
 assert.equal(taskPerson(legacy,{team:[],profiles:[{id:'u',full_name:'Eder'}]}),'Eder')
})
test('date intent is explicit and no new assignment or date is invented',()=>{
 const input={title:'Tarea',project_id:'00000000-0000-4000-8000-000000000001',status:'todo',due_date:null}
 assert.equal(operationSchemas.tasks.safeParse(input).success,true)
 assert.equal(operationSchemas.tasks.safeParse({...input,due_date_kind:'guaranteed'}).success,false)
 for(const due_date_kind of ['proposed','confirmed','follow_up',null])assert.equal(operationSchemas.tasks.safeParse({...input,due_date:'2026-10-28',due_date_kind}).success,true)
 assert.deepEqual(calendarTasks(data,filters).find(t=>t.id==='undated'),data.tasks.find(t=>t.id==='undated'))
})

test('legacy user assignments and member assignments share the same responsible filter',()=>{
 const team=[{id:'eder',user_id:'u',name:'Eder'}] as OpsData['team']
 const taskWithSeat=task('seat',{assignee_member_id:'eder'}),legacy=task('legacy',{assigned_to:'u'})
 assert.equal(taskPersonKey(taskWithSeat,{team}),'user:u')
 assert.equal(taskPersonKey(legacy,{team}),'user:u')
 assert.equal(taskPerson(legacy,{team,profiles:[{id:'u',full_name:'Eder Basilio'}]}),'Eder')
 assert.equal(calendarTasks({...data,team,tasks:[taskWithSeat,legacy]},{...filters,person:'user:u'}).length,2)
})

test('an unassigned task cannot inherit the name of an unlinked agent',()=>{
 const team=[{id:'agent',user_id:null,name:'Agente'}] as OpsData['team']
 assert.equal(taskPerson(task('unassigned'),{team,profiles:[]}),'Sin responsable')
 assert.equal(taskPersonKey(task('unassigned'),{team}),'unassigned')
})

test('period selection includes every status and only the scheduled civil dates',async()=>{
 const {calendarPeriodTasks}=await import('../lib/operations-calendar')
 const own={...data,tasks:[...['todo','in_progress','review','done'].map(status=>task(status,{status:status as Task['status'],due_date:'2026-10-30'})),task('next-month',{due_date:'2026-11-01',status:'done'}),task('no-date',{status:'done',completed_at:'2026-10-30T12:00:00Z'}),task('finished-today-due-yesterday',{due_date:'2026-10-29',status:'done',completed_at:'2026-10-30T12:00:00Z'})]}
 const all=calendarTasks(own,{...filters,status:''})
 assert.deepEqual(calendarPeriodTasks(all,'2026-10-30','agenda').map(t=>t.status).sort(),['done','in_progress','review','todo'])
 assert.equal(calendarPeriodTasks(all,'2026-10-30','week').length,6)
 assert.equal(calendarPeriodTasks(all,'2026-10-30','month').length,5)
 assert.equal(calendarPeriodTasks(all,'2026-11-01','month').length,1)
 assert.equal(calendarPeriodTasks(calendarTasks(own,{...filters,status:'done'}),'2026-10-30','agenda').length,1)
 assert.equal(calendarPeriodTasks(calendarTasks(own,{...filters,client:'internal',status:''}),'2026-10-30','agenda').length,0)
 assert.equal(own.tasks.find(t=>t.id==='no-date')?.due_date,null)
})
test('invalid calendar dates cannot roll into another period and CDMX defines Today',async()=>{
 const {isCalendarDay,calendarPeriodTasks}=await import('../lib/operations-calendar')
 for(const day of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-2-01','bad'])assert.equal(isCalendarDay(day),false,day)
 assert.equal(isCalendarDay('2028-02-29'),true)
 const tasks=[task('before-midnight',{due_date:'2026-10-29',status:'done'}),task('after-midnight',{due_date:'2026-10-30',status:'review'})]
 assert.deepEqual(calendarPeriodTasks(tasks,mexicoDay('2026-10-30T05:59:59Z'),'agenda').map(t=>t.id),['before-midnight'])
 assert.deepEqual(calendarPeriodTasks(tasks,mexicoDay('2026-10-30T06:00:00Z'),'agenda').map(t=>t.id),['after-midnight'])
 assert.equal(calendarPeriodTasks([task('leap',{due_date:'2028-02-29'})],'2028-02-01','month').length,1)
})
