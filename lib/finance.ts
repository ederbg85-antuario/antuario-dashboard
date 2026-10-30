import type {OpsData,Document,Entry} from './operations-types'
export const money=(value:number|null,currency='MXN')=>value===null?'Por confirmar':new Intl.NumberFormat('es-MX',{style:'currency',currency,maximumFractionDigits:2}).format(value)
export const percentage=(numerator:number,denominator:number)=>denominator>0?Math.round(numerator/denominator*1000)/10:null
const inMonth=(date:string|null,month:string)=>!!date&&date.slice(0,7)===month
const cents=(n:number)=>Math.round(Number(n)*100)
const sum=(values:number[])=>values.reduce((a,b)=>a+cents(b),0)/100
const mxToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date())
const inMxn=(value:number,currency:string,rate?:number|null)=>currency==='MXN'?Number(value):rate?Number(value)*Number(rate):0
export const isCollectible=(doc:Document)=>doc.kind==='invoice'&&(!doc.collection_status||doc.collection_status==='active')
export const isExpectedCash=(entry:Entry)=>entry.evidence==='planned'&&entry.forecast_status!=='withdrawn'
function cutoff(month:string,asOf:string){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10)<asOf?d.toISOString().slice(0,10):asOf}
export function recognizedRevenue(doc:Document,month:string,asOf=mxToday()){
 if(doc.kind!=='invoice'||!doc.service_date||(doc.currency!=='MXN'&&!doc.fx_rate)||doc.service_date>asOf)return 0
 if(!doc.service_end)return inMonth(doc.service_date,month)?inMxn(doc.subtotal,doc.currency,doc.fx_rate):0
 const start=Date.parse(doc.service_date+'T00:00:00Z'),end=Date.parse(doc.service_end+'T00:00:00Z')
 const monthStart=Date.parse(month+'-01T00:00:00Z'),next=new Date(monthStart);next.setUTCMonth(next.getUTCMonth()+1)
 const overlap=Math.max(0,Math.min(end+86400000,next.getTime(),Date.parse(asOf+'T00:00:00Z')+86400000)-Math.max(start,monthStart))
 return end>=start?Math.round(cents(inMxn(doc.subtotal,doc.currency,doc.fx_rate))*overlap/(end-start+86400000))/100:0
}
export function financeSummary(data:Pick<OpsData,'entries'|'documents'|'accounts'|'closings'>,month:string,asOf=mxToday()){
 const through=cutoff(month,asOf)
 const recognized=(e:Entry)=>e.evidence!=='planned'&&inMonth(e.recognition_date,month)&&e.recognition_date!<=through
 const cash=data.entries.filter(e=>e.currency==='MXN'&&e.evidence!=='planned'&&inMonth(e.cash_date,month)&&e.cash_date!<=through&&e.category!=='transfer')
 const inflow=sum(cash.filter(e=>e.direction==='income').map(e=>Number(e.cash_amount)))
 const outflow=sum(cash.filter(e=>e.direction==='expense').map(e=>Number(e.cash_amount)))
 const revenue=sum([...data.documents.map(d=>recognizedRevenue(d,month,through)),...data.entries.filter(e=>recognized(e)&&e.direction==='income'&&e.category==='revenue'&&!e.document_id).map(e=>inMxn(e.subtotal??0,e.currency,e.fx_rate))])
 const expense=(category:string)=>sum(data.entries.filter(e=>recognized(e)&&e.direction==='expense'&&e.category===category).map(e=>inMxn(e.subtotal??0,e.currency,e.fx_rate)))
 const cogs=expense('cogs'),opex=expense('opex'),depreciation=expense('depreciation'),interest=expense('interest'),tax=expense('income_tax')
 const closing=data.closings.find(c=>c.month.slice(0,7)===month)
 const serviceOverlaps=(d:Document)=>!!d.service_date&&d.service_date<=through&&(d.service_end??d.service_date)>=month+'-01'
 const unresolvedCurrency=data.entries.some(e=>recognized(e)&&e.currency!=='MXN'&&!e.fx_rate)||data.documents.some(d=>d.kind==='invoice'&&d.currency!=='MXN'&&!d.fx_rate&&serviceOverlaps(d))
 const incompleteAmounts=data.entries.some(e=>recognized(e)&&e.category!=='transfer'&&!e.document_id&&e.subtotal===null)
 const complete=!!closing?.revenue_complete&&!!closing?.costs_complete&&!unresolvedCurrency&&!incompleteAmounts&&month<asOf.slice(0,7)
 const gross=complete?sum([revenue,-cogs]):null,ebitda=complete?sum([revenue,-cogs,-opex]):null
 const net=complete&&closing?.taxes_complete?sum([revenue,-cogs,-opex,-depreciation,-interest,-tax]):null
 const receivable=sum(data.documents.filter(d=>isCollectible(d)&&d.currency==='MXN'&&d.issued_date<=asOf).map(d=>Math.max(0,Number(d.total)-Number(d.paid_amount))))
 const accountCheckpoint=(a:OpsData['accounts'][number])=>a.kind!=='provisional'&&a.balance_snapshot_amount!=null&&a.balance_snapshot_date&&a.balance_snapshot_source&&a.balance_snapshot_date<=through?{amount:Number(a.balance_snapshot_amount),date:a.balance_snapshot_date,reported:true}:a.opening_balance!==null&&a.opening_date&&a.opening_date<=through?{amount:Number(a.opening_balance),date:a.opening_date,reported:false}:null
 const accountBalance=(a:OpsData['accounts'][number])=>{
  const checkpoint=accountCheckpoint(a)
  if(!checkpoint)return null
  // cash_date has day precision: a reported balance replaces that day's cash;
  // only later dates adjust it. Opening balances still precede the day's cash.
  const movements=data.entries.filter(e=>e.account_id===a.id&&e.currency===a.currency&&e.evidence!=='planned'&&e.cash_date&&(checkpoint.reported?e.cash_date>checkpoint.date:e.cash_date>=checkpoint.date)&&e.cash_date<=through)
  return sum([checkpoint.amount,...movements.map(e=>Number(e.cash_amount)*(e.direction==='income'?1:-1))])
 }
 const realAccounts=data.accounts.filter(a=>a.currency==='MXN'&&a.kind!=='provisional')
 const checkpoints=realAccounts.map(accountCheckpoint)
 const balances=realAccounts.map(accountBalance)
 const missingAssignments=data.entries.some(e=>e.currency==='MXN'&&e.evidence!=='planned'&&e.cash_date&&e.cash_date<=through&&!e.account_id&&checkpoints.some(c=>c&&(c.reported?e.cash_date!>c.date:e.cash_date!>=c.date)))
 const verifiedBalance=balances.length&&!balances.includes(null)&&!missingAssignments?sum(balances as number[]):null
 const snapshot=data.accounts.find(a=>a.kind==='provisional'&&a.opening_date&&a.opening_date<=through&&a.opening_balance!==null&&!checkpoints.some(c=>c?.reported&&c.date>=a.opening_date!))
 // The snapshot includes all cash up to its date. Add only later native-MXN external movements.
 const afterSnapshot=snapshot?data.entries.filter(e=>e.evidence!=='planned'&&e.currency==='MXN'&&e.category!=='transfer'&&e.cash_date&&e.cash_date>snapshot.opening_date!&&e.cash_date<=through):[]
 const provisionalBalance=snapshot?sum([Number(snapshot.opening_balance),...afterSnapshot.map(e=>Number(e.cash_amount)*(e.direction==='income'?1:-1))]):null
 const balance=verifiedBalance??provisionalBalance
 const balanceProvisional=verifiedBalance===null&&provisionalBalance!==null
 const balanceReported=verifiedBalance!==null&&checkpoints.some(c=>c?.reported)
 const balanceDate=balanceProvisional?snapshot?.opening_date:balanceReported?checkpoints.filter(c=>c?.reported).map(c=>c!.date).sort()[0]:null
 return {inflow,outflow,netCash:sum([inflow,-outflow]),revenue,cogs,opex,depreciation,interest,tax,gross,ebitda,net,receivable,balance,balanceProvisional,balanceReported,balanceDate,complete,unresolvedCurrency,incompleteAmounts,accountBalances:data.accounts.map(a=>({...a,balance:accountBalance(a)})),grossMargin:gross===null?null:percentage(gross,revenue),ebitdaMargin:ebitda===null?null:percentage(ebitda,revenue),netMargin:net===null?null:percentage(net,revenue),closing}
}
