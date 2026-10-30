import {withMarketingAuth} from './marketing-auth.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureValidToken(supabase: any, connection: any): Promise<{ token: string | null; error: string | null }> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  const needsRefresh = !connection.access_token || !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);
  if (!needsRefresh) return { token: connection.access_token, error: null };
  if (!connection.refresh_token) return { token: null, error: "Sin refresh_token. Requiere reconexión OAuth." };
  const GID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GS = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GID || !GS) return { token: null, error: "Secrets GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET no configurados." };
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GID, client_secret: GS, refresh_token: connection.refresh_token, grant_type: "refresh_token" }),
  });
  const td = await tokenRes.json();
  if (!tokenRes.ok || td.error) {
    const msg = `Refresh falló: ${td.error} - ${td.error_description || ""}`;
    await supabase.from("marketing_connections").update({ status: "error", last_error: msg }).eq("id", connection.id);
    return { token: null, error: msg };
  }
  const newExp = new Date(Date.now() + (td.expires_in || 3600) * 1000).toISOString();
  await supabase.from("marketing_connections").update({ access_token: td.access_token, token_expires_at: newExp, ...(td.refresh_token ? { refresh_token: td.refresh_token } : {}), last_error: null, status: "active" }).eq("id", connection.id);
  return { token: td.access_token, error: null };
}

async function syncSearchConsole(token: string, conn: any, dateFrom: string, dateTo: string) {
 const endpoint='https://searchconsole.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(conn.external_id)+'/searchAnalytics/query';
 const query=async(dimensions:string[])=>{const res=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({startDate:dateFrom,endDate:dateTo,dimensions,dataState:'final',rowLimit:25000})});const data=await res.json();if(!res.ok)throw new Error('Search Console API '+res.status+': '+(data.error?.message??'No disponible'));return data.rows??[]};
 const [daily,keywords]=await Promise.all([query(['date']),query(['date','query'])]);const metrics:any[]=[];
 const push=(date:string,key:string,value:number,dimension='global',detail:string|null=null)=>metrics.push({organization_id:conn.organization_id,connection_id:conn.id,source:'search_console',metric_key:key,date,value,dimension_type:dimension,dimension_value:detail});
 for(const row of daily){const date=row.keys[0];push(date,'clicks',row.clicks);push(date,'impressions',row.impressions);push(date,'ctr',row.ctr);push(date,'position',row.position)}
 // Top keyword rows are a subset; never use them to reconstruct global totals.
 for(const row of keywords){push(row.keys[0],'clicks',row.clicks,'keyword',row.keys[1]);push(row.keys[0],'impressions',row.impressions,'keyword',row.keys[1]);push(row.keys[0],'position',row.position,'keyword',row.keys[1]);push(row.keys[0],'ctr',row.ctr,'keyword',row.keys[1])}
 return metrics;
}

async function syncGA4(token: string, conn: any, dateFrom: string, dateTo: string) {
 const id=String(conn.external_id).replace('properties/','');if(!/^\d+$/.test(id))throw new Error('Propiedad GA4 inválida');
 const names=['sessions','activeUsers','newUsers','bounceRate','averageSessionDuration','screenPageViews','keyEvents','engagementRate','sessionKeyEventRate','engagedSessions'];const keys=['sessions','active_users','new_users','bounce_rate','avg_session_duration','pageviews','conversions','engagement_rate','conversion_rate','engaged_sessions'];
 const report=async(dimensions:string[],metrics:string[])=>{const res=await fetch('https://analyticsdata.googleapis.com/v1beta/properties/'+id+':runReport',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({dateRanges:[{startDate:dateFrom,endDate:dateTo}],dimensions:dimensions.map(name=>({name})),metrics:metrics.map(name=>({name})),limit:10000})});const data=await res.json();if(!res.ok)throw new Error('GA4 API '+res.status+': '+(data.error?.message??'No disponible'));return data.rows??[]};
 const [daily,channels,pages]=await Promise.all([report(['date'],names),report(['date','sessionDefaultChannelGroup'],['sessions']),report(['date','pagePath'],['screenPageViews','keyEvents'])]);const result:any[]=[];
 const date=(raw:string)=>raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8);
 const push=(d:string,key:string,value:number,dimension='global',detail:string|null=null)=>result.push({organization_id:conn.organization_id,connection_id:conn.id,source:'ga4',metric_key:key,date:d,value,dimension_type:dimension,dimension_value:detail});
 // Provider's daily totals retain distinct users and weighted rates.
 for(const row of daily){const d=date(row.dimensionValues[0].value);row.metricValues.forEach((v:any,i:number)=>push(d,keys[i],Number(v.value)))}
 for(const row of channels){const d=date(row.dimensionValues[0].value),channel=row.dimensionValues[1].value;push(d,'sessions',Number(row.metricValues[0].value),'channel',channel)}
 for(const row of pages){const d=date(row.dimensionValues[0].value),path=row.dimensionValues[1].value;push(d,'pageviews',Number(row.metricValues[0].value),'page',path);push(d,'conversions',Number(row.metricValues[1].value),'page',path)}
 return result;
}

async function syncGBP(token: string, conn: any, dateFrom: string, dateTo: string) {
  if (!conn.external_id) throw new Error("external_id (location name) no configurado. Ej: accounts/xxx/locations/yyy");
  const [y1, m1, d1] = dateFrom.split("-");
  const [y2, m2, d2] = dateTo.split("-");
  const params = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS","BUSINESS_IMPRESSIONS_DESKTOP_SEARCH","BUSINESS_IMPRESSIONS_MOBILE_MAPS","BUSINESS_IMPRESSIONS_MOBILE_SEARCH","BUSINESS_DIRECTION_REQUESTS","CALL_CLICKS","WEBSITE_CLICKS"]
    .map(m => `dailyMetric=${m}`).join("&");
  const url = `https://businessprofileperformance.googleapis.com/v1/${conn.external_id}:fetchMultiDailyMetricsTimeSeries?${params}&dailyRange.start_date.year=${y1}&dailyRange.start_date.month=${parseInt(m1)}&dailyRange.start_date.day=${parseInt(d1)}&dailyRange.end_date.year=${y2}&dailyRange.end_date.month=${parseInt(m2)}&dailyRange.end_date.day=${parseInt(d2)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`GBP API ${res.status}: ${JSON.stringify(data).substring(0, 200)}`);
  const metricMap: Record<string, string> = {
    BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "impressions_desktop_maps",
    BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "impressions_desktop_search",
    BUSINESS_IMPRESSIONS_MOBILE_MAPS: "impressions_mobile_maps",
    BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "impressions_mobile_search",
    BUSINESS_DIRECTION_REQUESTS: "direction_requests",
    CALL_CLICKS: "call_clicks",
    WEBSITE_CLICKS: "website_clicks",
  };
  const metrics: any[] = [];
  for (const series of (data.multiDailyMetricTimeSeries || [])) {
    for (const ts of (series.dailyMetricTimeSeries || [])) {
      const mk = metricMap[ts.dailyMetric] || ts.dailyMetric.toLowerCase();
      for (const pt of (ts.timeSeries?.datedValues || [])) {
        const dd = pt.date;
        metrics.push({ organization_id: conn.organization_id, connection_id: conn.id, source: "google_business_profile", metric_key: mk, date: `${dd.year}-${String(dd.month).padStart(2,"0")}-${String(dd.day).padStart(2,"0")}`, value: parseInt(pt.value) || 0, dimension_type: "global", dimension_value: null });
      }
    }
  }
  return metrics;
}

serve(withMarketingAuth(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startTime = Date.now();
  let syncJobId: string | null = null;
  let supabase: any = null;

  try {
    const body = await req.json();
    const { connection_id, source, date_from, date_to } = body;
    if (!connection_id || !source) return new Response(JSON.stringify({ error: "connection_id y source requeridos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const today = new Date();
    const d30 = new Date(today.getTime() - 30 * 86400000);
    const dateFrom = date_from || d30.toISOString().split("T")[0];
    const dateTo = date_to || today.toISOString().split("T")[0];

    const { data: conn, error: connErr } = await supabase.from("marketing_connections").select("*").eq("id", connection_id).eq("source", source).single();
    if (connErr || !conn) return new Response(JSON.stringify({ error: "Conexión no encontrada", details: connErr?.message }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (["revoked", "inactive"].includes(conn.status)) return new Response(JSON.stringify({ error: `Conexión en estado '${conn.status}'` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: sj } = await supabase.from("marketing_sync_jobs").insert({ organization_id: conn.organization_id, connection_id, source, status: "running", date_from: dateFrom, date_to: dateTo, started_at: new Date().toISOString() }).select("id").single();
    if (sj) syncJobId = sj.id;

    const { token, error: tokErr } = await ensureValidToken(supabase, conn);
    if (!token) {
      if (syncJobId) await supabase.from("marketing_sync_jobs").update({ status: "error", error_message: tokErr, completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime }).eq("id", syncJobId);
      await supabase.from("marketing_connections").update({ last_error: tokErr }).eq("id", connection_id);
      return new Response(JSON.stringify({ error: tokErr }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: freshConn } = await supabase.from("marketing_connections").select("*").eq("id", connection_id).single();
    const activeConn = freshConn || conn;

    let metrics: any[] = [];
    if (source === "search_console") metrics = await syncSearchConsole(token, activeConn, dateFrom, dateTo);
    else if (source === "ga4") metrics = await syncGA4(token, activeConn, dateFrom, dateTo);
    else if (source === "google_business_profile") metrics = await syncGBP(token, activeConn, dateFrom, dateTo);
    else throw new Error(`Source '${source}' no implementado. Soportados: search_console, ga4, google_business_profile`);

    if (metrics.length === 0) {
      if (syncJobId) await supabase.from("marketing_sync_jobs").update({ status: "completed", records_fetched: 0, records_inserted: 0, completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime }).eq("id", syncJobId);
      await supabase.from("marketing_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connection_id);
      return new Response(JSON.stringify({ success: true, records_fetched: 0, message: "API retornó 0 métricas para el período." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use RPC function for upsert (handles COALESCE index correctly)
    const { data: upsertResult, error: upsertErr } = await supabase.rpc("upsert_marketing_metrics", { p_metrics: metrics });
    if (upsertErr) throw new Error(`Error en upsert: ${upsertErr.message}`);

    const inserted = upsertResult?.inserted || metrics.length;
    const duration = Date.now() - startTime;

    if (syncJobId) await supabase.from("marketing_sync_jobs").update({ status: "completed", records_fetched: metrics.length, records_inserted: inserted, completed_at: new Date().toISOString(), duration_ms: duration }).eq("id", syncJobId);
    await supabase.from("marketing_connections").update({ last_sync_at: new Date().toISOString(), last_error: null, status: "active" }).eq("id", connection_id);

    return new Response(JSON.stringify({ success: true, source, connection_id, date_from: dateFrom, date_to: dateTo, records_fetched: metrics.length, records_inserted: inserted, duration_ms: duration, sync_job_id: syncJobId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err.message || "Error desconocido";
    if (syncJobId && supabase) await supabase.from("marketing_sync_jobs").update({ status: "error", error_message: msg, completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime }).eq("id", syncJobId);
    return new Response(JSON.stringify({ error: "Error en sync", details: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}));
