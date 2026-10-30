-- All summaries obey caller RLS and the currently active property.
create or replace function public.get_marketing_summary(p_org_id bigint,p_source text,p_date_from date,p_date_to date)
returns table(metric_key text,total_value numeric,avg_value numeric,data_points integer)
language sql security invoker set search_path=public,pg_temp as $$
 with current_values as (
 select v.* from public.marketing_metrics_values v
 join public.marketing_connections c on c.id=v.connection_id and c.organization_id=v.organization_id and c.source=v.source and c.status='active'
 where v.organization_id=p_org_id and v.source=p_source and v.date between p_date_from and least(p_date_to,current_date) and v.dimension_type='global'
 )
 select v.metric_key,
 case when v.metric_key in ('ctr','position','bounce_rate','engagement_rate','users','active_users','followers','fans') then null else sum(v.value) end::numeric,
 avg(v.value)::numeric,count(*)::integer
 from current_values v group by v.metric_key;
$$;
comment on function public.get_marketing_summary(bigint,text,date,date) is 'Additive totals only; avg_value is a daily average, not period-unique users or a weighted period rate.';
create or replace function public.get_marketing_top_dimensions(p_org_id bigint,p_source text,p_metric_key text,p_dimension_type text,p_date_from date,p_date_to date,p_limit integer default 20)
returns table(dimension_value text,total_value numeric,data_points integer)
language sql security invoker set search_path=public,pg_temp as $$
 select v.dimension_value,sum(v.value)::numeric,count(*)::integer
 from public.marketing_metrics_values v
 join public.marketing_connections c on c.id=v.connection_id and c.organization_id=v.organization_id and c.source=v.source and c.status='active'
 where v.organization_id=p_org_id and v.source=p_source and v.metric_key=p_metric_key and v.dimension_type=p_dimension_type
 and v.date between p_date_from and least(p_date_to,current_date) and v.dimension_value is not null
 and v.metric_key not in ('ctr','position','bounce_rate','engagement_rate','users','active_users','followers','fans')
 group by v.dimension_value order by sum(v.value) desc limit greatest(1,least(p_limit,100));
$$;
