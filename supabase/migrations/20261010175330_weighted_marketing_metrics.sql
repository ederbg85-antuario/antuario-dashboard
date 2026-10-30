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
 case when v.metric_key in ('ctr','position','average_position','bounce_rate','engagement_rate','conversion_rate','avg_session_duration','users','active_users','new_users','followers','fans') then null else sum(v.value) end::numeric,
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
 and v.metric_key not in ('ctr','position','average_position','bounce_rate','engagement_rate','conversion_rate','avg_session_duration','users','active_users','new_users','followers','fans')
 group by v.dimension_value order by sum(v.value) desc limit greatest(1,least(p_limit,100));
$$;

create or replace function public.get_search_console_keywords(p_org_id bigint,p_date_from date,p_date_to date,p_limit integer default 30)
returns table(keyword text,clicks numeric,impressions numeric,ctr numeric,average_position numeric)
language sql security invoker set search_path=public,pg_temp as $$
 with daily as (
 select v.dimension_value as keyword,v.date,
 sum(v.value) filter(where v.metric_key='clicks') as clicks,
 sum(v.value) filter(where v.metric_key='impressions') as impressions,
 coalesce(max(v.value) filter(where v.metric_key='position'),max(v.value) filter(where v.metric_key='average_position')) as avg_position
 from public.marketing_metrics_values v
 join public.marketing_connections c on c.id=v.connection_id and c.organization_id=v.organization_id and c.source=v.source and c.status='active'
 where v.organization_id=p_org_id and v.source='search_console' and v.dimension_type='keyword' and v.dimension_value is not null
 and v.date between p_date_from and least(p_date_to,current_date)
 group by v.dimension_value,v.date
 )
 select d.keyword,coalesce(sum(d.clicks),0),coalesce(sum(d.impressions),0),sum(d.clicks)/nullif(sum(d.impressions),0),
 case when count(*) filter(where d.impressions>0 and d.avg_position is null)>0 then null else sum(d.avg_position*d.impressions)/nullif(sum(d.impressions),0) end
 from daily d group by d.keyword order by sum(d.clicks) desc nulls last,sum(d.impressions) desc nulls last
 limit greatest(1,least(p_limit,100));
$$;
revoke execute on function public.get_search_console_keywords(bigint,date,date,integer) from public,anon;
grant execute on function public.get_search_console_keywords(bigint,date,date,integer) to authenticated,service_role;
