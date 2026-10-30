import test from 'node:test'
import assert from 'node:assert/strict'
import type {AccountBundle,AccountSnapshot} from '../lib/client-accounts-types'
import {accountMetrics,accountPercentChange,dedupeAccountSnapshots,mexicoAccountDate,resolveAccountsRange,validAccountDate} from '../lib/client-accounts-metrics'
import {getDemoAccount,getDemoAccounts} from '../lib/client-accounts-fixtures'

const account=getDemoAccount('metrica')!
const empty=():AccountBundle=>({...account,snapshots:[],campaigns:[],invoices:[],payments:[],opportunities:[],instances:[]})
const range=resolveAccountsRange('custom','2026-10-20',{from:'2026-10-01',to:'2026-10-02'})
let nextId=0
function row(date:string,source:AccountSnapshot['source'],metric:string,value:number,extra:Partial<AccountSnapshot>={}):AccountSnapshot{
 const id=String(++nextId)
 return {id,account_id:account.account.id,organization_id:1,source_key:`source-${id}`,created_by:'actor',created_at:'2026-10-20T00:00:00Z',updated_at:'2026-10-20T00:00:00Z',is_example:true,date,period_to:date,source,metric,value,unit:'count',grain:'daily',channel:null,campaign_id:null,evidence:'example',...extra}
}
test('Civil Mexico range arithmetic is inclusive and independent of UTC date boundaries',()=>{
 assert.equal(mexicoAccountDate(new Date('2026-10-20T02:00:00Z')),'2026-10-19')
 assert.equal(validAccountDate('2026-02-30'),false)
 assert.equal(validAccountDate('2024-02-29'),true)
 assert.deepEqual(resolveAccountsRange('7d','2026-03-02'),{from:'2026-02-24',to:'2026-03-02',previousFrom:'2026-02-17',previousTo:'2026-02-23',preset:'7d',label:'7 días'})
 const month=resolveAccountsRange('month','2026-10-20')
 assert.equal(month.previousFrom,'2026-09-01');assert.equal(month.previousTo,'2026-09-20')
 const quarter=resolveAccountsRange('quarter','2026-10-20')
 assert.equal(quarter.from,'2026-10-01');assert.equal(quarter.previousFrom,'2026-07-01');assert.equal(quarter.previousTo,'2026-07-20')
 assert.throws(()=>resolveAccountsRange('custom','2026-10-20',{from:'2026-10-20',to:'2026-10-01'}))
})
test('CTR and average position are weighted by the same observed impression grain',()=>{
 const bundle=empty();bundle.snapshots=[row('2026-10-01','search_console','impressions',100),row('2026-10-01','search_console','clicks',10),row('2026-10-01','search_console','position',2,{unit:'position'}),row('2026-10-02','search_console','impressions',900),row('2026-10-02','search_console','clicks',9),row('2026-10-02','search_console','position',12,{unit:'position'})]
 const result=accountMetrics(bundle,range)
 assert.equal(result.byKey.ctr.value,1.9)
 assert.equal(result.byKey.position.value,11)
 assert.equal(result.byKey.ctr.complete,true)
})
test('A missing numerator day does not silently become zero in a rate',()=>{
 const bundle=empty();bundle.snapshots=[row('2026-10-01','search_console','impressions',100),row('2026-10-01','search_console','clicks',10),row('2026-10-02','search_console','impressions',900)]
 const result=accountMetrics(bundle,range)
 assert.equal(result.byKey.ctr.value,null)
 assert.equal(result.byKey.seoClicks.complete,false)
 assert.deepEqual(result.byKey.seoClicks.series.map(point=>point.value),[10,null])
})
test('Distinct daily users cannot be added into a period unique audience',()=>{
 const bundle=empty();bundle.snapshots=[row('2026-10-01','ga4','users',10),row('2026-10-02','ga4','users',12)]
 assert.equal(accountMetrics(bundle,range).byKey.users.value,null)
 assert.deepEqual(accountMetrics(bundle,range).byKey.users.series.map(point=>point.value),[10,12])
 bundle.snapshots.push(row(range.from,'ga4','users',16,{grain:'period',period_to:range.to}))
 const result=accountMetrics(bundle,range)
 assert.equal(result.byKey.users.value,16);assert.equal(result.byKey.users.complete,true)
})
test('Retries, corrected observations, channel partitions and account totals do not double-count',()=>{
 const first=row('2026-10-01','ga4','sessions',10)
 const retry={...first,id:'retry'}
 const corrected={...first,id:'correction',source_key:'different-key',value:12,updated_at:'2026-10-20T01:00:00Z'}
 assert.equal(dedupeAccountSnapshots([first,retry,corrected]).length,1)
 const bundle=empty();bundle.snapshots=[first,retry,corrected,row('2026-10-01','ga4','sessions',7,{channel:'organic'}),row('2026-10-01','ga4','sessions',5,{channel:'paid'})]
 assert.equal(accountMetrics(bundle,range).byKey.sessions.value,12)
 bundle.snapshots=bundle.snapshots.filter(item=>item.channel)
 assert.equal(accountMetrics(bundle,range).byKey.sessions.value,12)
})
test('An explicit period total supersedes overlapping daily totals without duplication',()=>{
 const bundle=empty();bundle.snapshots=[row('2026-10-01','ga4','sessions',10),row('2026-10-02','ga4','sessions',20),row(range.from,'ga4','sessions',32,{grain:'period',period_to:range.to})]
 assert.equal(accountMetrics(bundle,range).byKey.sessions.value,32)
})
test('Empty coverage is unavailable; an observed zero is zero; zero baselines have no invented delta',()=>{
 const bundle=empty();assert.equal(accountMetrics(bundle,range).byKey.leads.value,null)
 bundle.snapshots=[row('2026-10-01','ga4','leads',0)]
 assert.equal(accountMetrics(bundle,range).byKey.leads.value,0)
 assert.equal(accountPercentChange(10,0),null);assert.equal(accountPercentChange(0,0),null);assert.equal(accountPercentChange(0,10),-100)
})
test('CPA uses actual conversions and never silently mixes currencies',()=>{
 const bundle=empty();bundle.snapshots=[row('2026-10-01','google_ads','cost',120,{unit:'MXN'}),row('2026-10-01','google_ads','cost',10,{unit:'USD'}),row('2026-10-01','google_ads','conversions',3)]
 const result=accountMetrics(bundle,range)
 assert.equal(result.byKey.adSpend.value,120);assert.equal(result.byKey.costPerConversion.value,40)
 bundle.snapshots=bundle.snapshots.map(item=>item.metric==='conversions'?{...item,value:0}:item)
 assert.equal(accountMetrics(bundle,range).byKey.costPerConversion.value,null)
})
test('Budget projection uses observed daily spend, a dated account balance and the planned campaign end',()=>{
 const bundle=getDemoAccount('metrica')!,result=accountMetrics(bundle,resolveAccountsRange('month','2026-10-20'))
 assert.equal(result.budget.spent,4047);assert.equal(result.budget.budget,7600)
 assert.equal(result.budget.dailyRate,202.35);assert.equal(result.budget.balance,980);assert.equal(result.budget.plannedDays,11);assert.equal(result.budget.alert,true)
 const noSpend={...bundle,snapshots:bundle.snapshots.filter(item=>item.metric!=='cost')}
 assert.equal(accountMetrics(noSpend,resolveAccountsRange('month','2026-10-20')).budget.daysRemaining,null)
})
test('Cash, invoices and opportunities stay separate; cancelling an invoice does not erase cash',()=>{
 const bundle=getDemoAccount('metrica')!,month=resolveAccountsRange('month','2026-10-20')
 const base={id:'unit-invoice',account_id:bundle.account.id,organization_id:1,source_key:'unit-invoice',created_by:'unit-actor',created_at:'2026-10-20T00:00:00Z',updated_at:'2026-10-20T00:00:00Z',is_example:true}
 bundle.invoices=[{...base,title:'Documento exclusivo de prueba unitaria',uuid:null,issued_date:'2026-10-03',due_date:'2026-10-15',period_from:'2026-10-01',period_to:'2026-10-31',subtotal:1000,vat:160,retention:0,total:1160,currency:'MXN',status:'issued',evidence:'Solo test, nunca se presenta en la aplicación.'}]
 bundle.payments=[{...base,id:'unit-payment',source_key:'unit-payment',invoice_id:base.id,date:'2026-10-13',amount:800,currency:'MXN',receipt_status:'pending',evidence:'Solo test.'}]
 bundle.opportunities=[{...base,id:'unit-opportunity',source_key:'unit-opportunity',title:'Oportunidad exclusiva de prueba',stage:'won',development_estimate:50000,monthly_estimate:1000,currency:'MXN',tax_basis:'unconfirmed',next_action:'No es ingreso',evidence:'Solo test.'}]
 bundle.payments.push({...bundle.payments[0],id:'retry'})
 let result=accountMetrics(bundle,month)
 assert.equal(result.billingSummary.invoiced,1160);assert.equal(result.billingSummary.collected,800);assert.equal(result.billingSummary.outstanding,360)
 assert.equal(result.billingSummary.daysLate,5)
 assert.equal(bundle.opportunities[0].development_estimate,50000)
 const noEvidence={...bundle,payments:[]}
 assert.equal(accountMetrics(noEvidence,month).billingSummary.outstanding,null)
 assert.equal(accountMetrics(noEvidence,month).invoices[0].paid,null)
 bundle.invoices[0].status='cancelled'
 result=accountMetrics(bundle,month)
 assert.equal(result.billingSummary.invoiced,null);assert.equal(result.billingSummary.outstanding,null);assert.equal(result.billingSummary.collected,800);assert.equal(result.billingSummary.unappliedPayments,800)
})
test('Presentation examples contain no invented invoices, dated collections or named client balances',()=>{
 const bundle=getDemoAccount('acriland')!,result=accountMetrics(bundle,resolveAccountsRange('month','2026-10-20'))
 assert.equal(bundle.account.billing_cadence,'weekly');assert.equal(bundle.account.monthly_fee,null)
 assert.equal(result.billingSummary.collected,null);assert.equal(result.billingSummary.invoiced,null);assert.equal(result.billingSummary.outstanding,null)
 for(const demo of getDemoAccounts()){
  assert.equal(demo.invoices.length,0);assert.equal(demo.payments.length,0);assert.equal(demo.opportunities.length,0)
  assert.match(demo.account.name,/Cuenta de ejemplo/)
  assert.equal(/Métrica|Acriland|Óscar|Memo/.test(demo.account.name+' '+demo.account.director_name),false)
  const metrics=accountMetrics(demo,resolveAccountsRange('month','2026-10-20'))
  assert.equal(metrics.billingSummary.outstanding,null);assert.equal(metrics.billingSummary.hasInvoices,false);assert.equal(metrics.billingSummary.hasPayments,false)
 }
 assert.equal(bundle.snapshots.some(snapshot=>snapshot.source==='google_ads'||snapshot.channel==='paid'),false)
 assert.equal(bundle.campaigns.length,0);assert.equal(bundle.changes.length,0)
 assert.equal(bundle.account.services.some(service=>/Google Ads/i.test(service)),false)
 assert.equal(result.byKey.adSpend.value,null);assert.equal(result.budget.balance,null);assert.equal(result.budget.budget,null)
})
test('Example fixtures remain wholly marked, and a live view never consumes example metric rows',()=>{
 for(const bundle of getDemoAccounts()){
  assert.equal(bundle.data_mode,'example');assert.equal(bundle.account.is_example,true)
  for(const key of ['snapshots','campaigns','contacts','fronts','templates','instances','changes','milestones','payments','invoices','opportunities'] as const)assert.equal(bundle[key].every(item=>item.is_example),true)
  const live={...bundle,data_mode:'live' as const}
  assert.equal(accountMetrics(live,range).byKey.sessions.value,null)
  assert.equal(accountMetrics(live,range).billingSummary.collected,null)
 }
 assert.equal(getDemoAccount('does-not-exist'),null)
})
