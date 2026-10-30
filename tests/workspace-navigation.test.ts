import {test} from 'node:test'
import assert from 'node:assert/strict'
import LegacyWorkPage from '../app/(dashboard)/mi-trabajo/page'
import {workspaceNavigation,mobileWorkspaceNavigation,TEAM_WORK_PATH} from '../lib/workspace-navigation'
import {canArea,scopedProductionPath} from '../lib/team-access'
import type {TeamMember} from '../lib/operations-types'

test('team work belongs under Equipo, while overview stays first and performance is permission-bound',()=>{
 const sections=workspaceNavigation({production:true,people:true})
 assert.equal(sections[0].links[0].href,'/dashboard')
 assert.equal(sections.some(section=>section.key==='work'),false)
 assert.deepEqual(sections.find(section=>section.key==='team')?.links.map(item=>item.href),[TEAM_WORK_PATH,'/equipo'])
 const finance=workspaceNavigation({finance:true,people:false})
 assert.deepEqual(finance.find(section=>section.key==='team')?.links.map(item=>item.href),[TEAM_WORK_PATH])
 assert.equal(finance.some(section=>section.key==='production'),false)
})

test('scoped directors get their work queue without entering team administration or finance',()=>{
 const director:TeamMember={id:'director',name:'Memo',position:'Director',kind:'agent',status:'active',email:null,user_id:'user',areas:['production'],write_areas:['production'],client_ids:['acriland'],access:'operator',responsibilities:null}
 assert.equal(scopedProductionPath(TEAM_WORK_PATH),true)
 assert.equal(scopedProductionPath('/api/team-work'),true)
 assert.equal(scopedProductionPath('/api/team-presence'),true)
 for(const path of ['/cuentas','/cuentas/acriland','/api/accounts','/api/accounts/acriland/snapshots'])assert.equal(scopedProductionPath(path),true,path)
 for(const path of ['/cuentas-ajenas','/api/accounts-admin','/api/accountsx'])assert.equal(scopedProductionPath(path),false,path)
 for(const path of ['/equipo','/equipo/accesos','/equipo/trabajox','/equipo/trabajo/privado','/finanzas'])assert.equal(scopedProductionPath(path),false,path)
 assert.equal(canArea('viewer',director,'people'),false)
 assert.equal(canArea('viewer',director,'finance'),false)
 const nav=workspaceNavigation({scopedProduction:true,production:true,people:false})
 assert.equal(nav.some(section=>section.key==='overview'),false)
 assert.equal(nav.find(section=>section.key==='accounts')?.links.some(item=>item.href==='/cuentas'),true)
 assert.deepEqual(nav.find(section=>section.key==='team')?.links.map(item=>item.href),[TEAM_WORK_PATH])
})

test('account entry point is shared across existing areas without exposing production or finance navigation',()=>{
 const accounting=workspaceNavigation({accounting:true})
 assert.equal(accounting.find(section=>section.key==='accounts')?.links[0].href,'/cuentas')
 assert.equal(accounting.some(section=>section.key==='production'),false)
 assert.equal(accounting.some(section=>section.key==='finance'),false)
 assert.equal(workspaceNavigation({}).some(section=>section.key==='accounts'),false)
})

test('mobile navigation keeps Inicio and Equipo with at most two relevant area shortcuts',()=>{
 const all=mobileWorkspaceNavigation({production:true,marketing:true,sales:true,finance:true,accounting:true,people:true})
 assert.deepEqual(all.slice(0,2).map(item=>item.label),['Inicio','Equipo'])
 assert.equal(all.length,4)
 const accounting=mobileWorkspaceNavigation({finance:true,accounting:true})
 assert.deepEqual(accounting.map(item=>item.href),['/dashboard',TEAM_WORK_PATH,'/finanzas','/contabilidad'])
 const director=mobileWorkspaceNavigation({scopedProduction:true,production:true})
 assert.deepEqual(director.map(item=>item.href),[TEAM_WORK_PATH,'/proyectos'])
})

test('old automation links redirect to the canonical team work route',()=>{
 assert.throws(()=>LegacyWorkPage(),(error:unknown)=>{
  return error instanceof Error&&'digest' in error&&String(error.digest).includes('NEXT_REDIRECT')&&String(error.digest).includes(TEAM_WORK_PATH)
 })
})
