export type MarketingValue = {metric_key:string;value:number;date?:string}

export function metricSum(rows:MarketingValue[],key:string){
  return rows.filter(r=>r.metric_key===key&&Number.isFinite(Number(r.value))).reduce((s,r)=>s+Number(r.value),0)
}

// Rates and positions are weighted by their denominator on the same day.
// An incomplete series cannot be presented as a complete period KPI.
export function weightedMetric(rows:MarketingValue[],keys:string[],denominator:string):number|null{
  const days=new Map<string,MarketingValue[]>()
  for(const r of rows){if(!r.date)continue;const day=days.get(r.date)??[];day.push(r);days.set(r.date,day)}
  let numerator=0,weight=0
  for(const day of days.values()){
    const n=metricSum(day,denominator)
    if(n<=0)continue
    const row=keys.map(key=>day.find(r=>r.metric_key===key)).find(Boolean)
    if(!row||!Number.isFinite(Number(row.value)))return null
    numerator+=Number(row.value)*n;weight+=n
  }
  return weight>0?numerator/weight:null
}

export function searchSummary(rows:MarketingValue[]){
  const clicks=metricSum(rows,'clicks'),impressions=metricSum(rows,'impressions')
  return {clicks,impressions,ctr:impressions>0?clicks/impressions:null,position:weightedMetric(rows,['position','average_position'],'impressions')}
}

export function analyticsSummary(rows:MarketingValue[]){
  const sessions=metricSum(rows,'sessions')
  const users=rows.filter(r=>r.metric_key==='active_users')
  return {sessions,keyEvents:metricSum(rows,'conversions'),engagedSessions:metricSum(rows,'engaged_sessions'),
    // Daily distinct users cannot be added to claim period-distinct people.
    dailyActiveUsers:users.length?metricSum(users,'active_users')/users.length:null,
    engagement:weightedMetric(rows,['engagement_rate'],'sessions'),
    keyEventRate:weightedMetric(rows,['conversion_rate'],'sessions'),
    duration:weightedMetric(rows,['avg_session_duration'],'sessions')}
}
