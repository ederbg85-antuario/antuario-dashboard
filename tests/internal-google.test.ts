import {test} from 'node:test'
import assert from 'node:assert/strict'
import {collectInternalGoogle} from '../lib/google-internal-data'
import {GOOGLE_TARGETS} from '../lib/internal-platform'

const mock=(handler:(url:string,body:Record<string,unknown>)=>unknown)=>
  (async(url,init)=>Response.json(handler(String(url),JSON.parse(String(init?.body??'{}'))))) as typeof fetch

test('GA4 reads only Antuario and preserves ratio metrics without scaling',async()=>{
 const request=mock((url,body)=>{
  assert.equal(url,`https://analyticsdata.googleapis.com/v1beta/properties/${GOOGLE_TARGETS.ga4}:runReport`)
  const dimensions=body.dimensions as {name:string}[]
  if(dimensions.length!==1)return {rows:[],rowCount:0}
  return {rows:[{dimensionValues:[{value:'20261010'}],metricValues:[10,8,3,.2,50,25,2,.8,.1,8].map(value=>({value:String(value)}))}],rowCount:1}
 })
 const result=await collectInternalGoogle('ga4','test','2026-10-01','2026-10-11',request)
 assert.equal(result.metrics.find(m=>m.metric_key==='bounce_rate')?.value,.2)
 assert.equal(result.metrics.find(m=>m.metric_key==='sessions')?.value,10)
 assert.equal(result.snapshot.auth_mode,'server')
})

test('Search Console keeps global totals separate from incomplete keyword coverage',async()=>{
 const request=mock((url,body)=>{
  assert.ok(url.includes(encodeURIComponent('https://www.antuario.mx/')))
  assert.equal(body.dataState,'final')
  const keywords=(body.dimensions as string[]).includes('query')
  return {rows:[{keys:keywords?['2026-10-10','antuario']:['2026-10-10'],clicks:keywords?2:12,impressions:keywords?8:100,ctr:keywords?.25:.12,position:4}]}
 })
 const result=await collectInternalGoogle('search_console','test','2026-10-01','2026-10-11',request)
 assert.equal(result.metrics.find(m=>m.metric_key==='clicks'&&m.dimension_type==='global')?.value,12)
 assert.equal(result.metrics.find(m=>m.metric_key==='clicks'&&m.dimension_type==='keyword')?.value,2)
 assert.equal(result.snapshot.keyword_coverage,'top_queries_subset')
})

test('Tag Manager paginates accounts and never reads another client’s live container',async()=>{
 const calls:string[]=[]
 const request=mock(url=>{
  calls.push(url)
  if(url.endsWith('/accounts'))return {account:[{path:'accounts/1'}],nextPageToken:'next'}
  if(url.includes('/accounts?pageToken='))return {account:[{path:'accounts/2'}]}
  if(url.endsWith('accounts/1/containers'))return {container:[{path:'accounts/1/containers/1',publicId:'GTM-OTHER',name:'Other'}]}
  if(url.endsWith('accounts/2/containers'))return {container:[{path:'accounts/2/containers/2',publicId:GOOGLE_TARGETS.gtm,name:'Antuario'}]}
  assert.ok(url.endsWith('accounts/2/containers/2/versions:live'))
  return {container:{publicId:GOOGLE_TARGETS.gtm},containerVersionId:'12',tag:[{},{}]}
 })
 const result=await collectInternalGoogle('gtm','test','2026-10-01','2026-10-11',request)
 assert.equal(result.snapshot.tags,2)
 assert.equal(calls.some(url=>url.includes('containers/1/versions')),false)
})

test('invalid dates and provider errors cannot produce successful metrics or expose tokens',async()=>{
 const invalid=mock(()=>({rows:[{keys:['2026-10-12'],clicks:1,impressions:1,ctr:1,position:1}]}))
 await assert.rejects(()=>collectInternalGoogle('search_console','test','2026-10-01','2026-10-11',invalid),/inválida/)
 const denied=(async()=>new Response('provider body with sensitive data',{status:403})) as typeof fetch
 await assert.rejects(()=>collectInternalGoogle('gtm','test','2026-10-01','2026-10-11',denied),/permisos/)
})
