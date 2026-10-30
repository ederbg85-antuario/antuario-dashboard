import {withMarketingAuth} from './marketing-auth.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: get a valid access token (refreshing if needed)
async function getValidToken(supabase: any, connectionId: string): Promise<{ token: string | null; error: string | null }> {
  const { data: conn, error } = await supabase
    .from("marketing_connections")
    .select("id, access_token, refresh_token, token_expires_at, status")
    .eq("id", connectionId)
    .single();

  if (error || !conn) return { token: null, error: "Conexión no encontrada" };
  if (!conn.access_token && !conn.refresh_token) return { token: null, error: "Sin tokens. Requiere reconexión OAuth." };

  // Check if token needs refresh (expired or expires in next 5 min)
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);

  if (needsRefresh && conn.refresh_token) {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: conn.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      await supabase.from("marketing_connections").update({
        status: "error",
        last_error: `Token refresh falló: ${tokenData.error} - ${tokenData.error_description || ""}`,
      }).eq("id", connectionId);
      return { token: null, error: `Refresh falló: ${tokenData.error}` };
    }
    const newExpires = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
    await supabase.from("marketing_connections").update({
      access_token: tokenData.access_token,
      token_expires_at: newExpires,
      ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
      last_error: null,
    }).eq("id", connectionId);
    return { token: tokenData.access_token, error: null };
  }

  return { token: conn.access_token, error: null };
}

serve(withMarketingAuth(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { connection_id, source } = await req.json();
    if (!connection_id || !source) {
      return new Response(
        JSON.stringify({ error: "connection_id y source son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { token, error: tokenError } = await getValidToken(supabase, connection_id);
    if (!token) {
      return new Response(
        JSON.stringify({ error: tokenError }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let properties: any[] = [];

    if (source === "search_console") {
      const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Search Console API error: ${JSON.stringify(data).substring(0, 300)}`);
      properties = (data.siteEntry || []).map((s: any) => ({
        external_id: s.siteUrl,
        external_name: s.siteUrl,
        permission_level: s.permissionLevel,
      }));

    } else if (source === "ga4") {
      const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`GA4 Admin API error: ${JSON.stringify(data).substring(0, 300)}`);
      properties = [];
      for (const account of (data.accountSummaries || [])) {
        for (const prop of (account.propertySummaries || [])) {
          properties.push({
            external_id: prop.property,
            external_name: prop.displayName,
            account_name: account.displayName,
            account_id: account.account,
          });
        }
      }

    } else if (source === "google_business_profile") {
      // Step 1: List accounts
      const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || res.statusText;
        console.error(`GBP accounts API ${res.status}: ${errMsg}`);
        // Return empty with error info instead of throwing
        return new Response(
          JSON.stringify({
            success: true,
            source,
            properties: [],
            count: 0,
            error: `Google Business Profile API ${res.status}: ${errMsg}. Verifica que la API esté habilitada en Google Cloud Console.`
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const accounts = data.accounts || [];
      properties = [];

      for (const account of accounts) {
        try {
          const locRes = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (!locRes.ok) {
            console.warn(`GBP locations API ${locRes.status} for ${account.name}`);
            // Add account itself as fallback instead of throwing
            properties.push({
              external_id: account.name,
              external_name: account.accountName || account.name,
              account_name: account.accountName,
              account_id: account.name,
            });
            continue;
          }

          const locData = await locRes.json();
          const locations = locData.locations || [];

          if (locations.length > 0) {
            for (const loc of locations) {
              properties.push({
                external_id: loc.name,
                external_name: loc.title || loc.name,
                account_name: account.accountName,
                account_id: account.name,
              });
            }
          } else {
            // No locations found, add account as option
            properties.push({
              external_id: account.name,
              external_name: account.accountName || account.name,
              account_name: account.accountName,
              account_id: account.name,
            });
          }
        } catch (locErr) {
          console.warn(`Error fetching locations for ${account.name}:`, locErr);
          // Add account as fallback
          properties.push({
            external_id: account.name,
            external_name: account.accountName || account.name,
            account_name: account.accountName,
            account_id: account.name,
          });
        }
      }

    } else if (source === "google_ads") {
      const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
      if (!developerToken) {
        return new Response(
          JSON.stringify({
            success: true,
            source,
            properties: [],
            count: 0,
            error: "GOOGLE_ADS_DEVELOPER_TOKEN no configurado en Supabase. Esta integración requiere un Developer Token de Google Ads."
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const res = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", {
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": developerToken,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Google Ads API error: ${JSON.stringify(data).substring(0, 300)}`);
      properties = (data.resourceNames || []).map((name: string) => ({
        external_id: name,
        external_name: name.replace("customers/", "Customer ID: "),
      }));
    } else {
      return new Response(
        JSON.stringify({ error: `Source '${source}' no soportado` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, source, properties, count: properties.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("google-list-properties error:", err.message);
    return new Response(
      JSON.stringify({ error: "Error interno", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
