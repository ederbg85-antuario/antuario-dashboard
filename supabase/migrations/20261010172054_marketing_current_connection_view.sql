create or replace view public.marketing_daily_summary with(security_invoker=true) as
select v.organization_id,v.source,v.date,v.metric_key,sum(v.value) as daily_total,avg(v.value) as daily_avg
from public.marketing_metrics_values v join public.marketing_connections c on c.id=v.connection_id and c.organization_id=v.organization_id and c.source=v.source
where v.dimension_type='global' and c.status='active' and v.date<=current_date
group by v.organization_id,v.source,v.date,v.metric_key;
