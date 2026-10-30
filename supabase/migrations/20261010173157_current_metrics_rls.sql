-- Browser users can read only current-property metrics. Ingestion stays server-only.
revoke insert,update,delete on public.marketing_metrics_values from anon,authenticated;
create policy metrics_current_property on public.marketing_metrics_values as restrictive for select to authenticated
using(date<=current_date and exists(select 1 from public.marketing_connections c where c.id=marketing_metrics_values.connection_id and c.organization_id=marketing_metrics_values.organization_id and c.source=marketing_metrics_values.source and c.status='active'));
