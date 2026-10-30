import test from 'node:test'
import assert from 'node:assert/strict'
import {analyticsSummary,searchSummary,weightedMetric} from '../lib/marketing-math'

test('Search CTR uses clicks over impressions instead of an unweighted daily mean',()=>{
 const rows=[{date:'2026-10-01',metric_key:'clicks',value:1},{date:'2026-10-01',metric_key:'impressions',value:10},{date:'2026-10-01',metric_key:'position',value:2},
 {date:'2026-10-02',metric_key:'clicks',value:9},{date:'2026-10-02',metric_key:'impressions',value:990},{date:'2026-10-02',metric_key:'average_position',value:12}]
 const result=searchSummary(rows)
 assert.equal(result.ctr,.01)
 assert.equal(result.position,11.9)
})
test('GA rates follow session volume; distinct daily users are only a daily average',()=>{
 const rows=[{date:'2026-10-01',metric_key:'sessions',value:100},{date:'2026-10-01',metric_key:'engagement_rate',value:.8},{date:'2026-10-01',metric_key:'active_users',value:80},
 {date:'2026-10-02',metric_key:'sessions',value:900},{date:'2026-10-02',metric_key:'engagement_rate',value:.2},{date:'2026-10-02',metric_key:'active_users',value:600}]
 const result=analyticsSummary(rows)
 assert.equal(result.engagement,.26)
 assert.equal(result.dailyActiveUsers,340)
 assert.equal(result.keyEventRate,null)
})
test('An incomplete weighted series is unavailable; preferred position keys do not double-count',()=>{
 const rows=[{date:'2026-10-01',metric_key:'impressions',value:100},{date:'2026-10-01',metric_key:'position',value:5},{date:'2026-10-01',metric_key:'average_position',value:50}]
 assert.equal(weightedMetric(rows,['position','average_position'],'impressions'),5)
 assert.equal(weightedMetric([...rows,{date:'2026-10-02',metric_key:'impressions',value:10}],['position','average_position'],'impressions'),null)
 assert.equal(searchSummary([]).ctr,null)
})
