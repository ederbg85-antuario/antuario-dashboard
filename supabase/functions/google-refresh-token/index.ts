import {withMarketingAuth} from './marketing-auth.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

serve(withMarketingAuth(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { connection_id } = await req.json();

    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: "connection_id requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: "Secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente con service_role para leer tokens (bypassa RLS)
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Leer la conexión actual
    const { data: connection, error: fetchError } = await supabase
      .from("marketing_connections")
      .select("id, source, refresh_token, organization_id")
      .eq("id", connection_id)
      .single();

    if (fetchError || !connection) {
      return new Response(
        JSON.stringify({ error: "Conexión no encontrada", details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!connection.refresh_token) {
      await supabase
        .from("marketing_connections")
        .update({
          status: "error",
          last_error: "No hay refresh_token disponible. Requiere reconexión OAuth completa.",
        })
        .eq("id", connection_id);

      return new Response(
        JSON.stringify({ error: "No hay refresh_token. Requiere reconexión." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Llamar al token endpoint de Google para obtener nuevo access_token
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      const errorMsg = `Google rechazó el refresh: ${tokenData.error} - ${tokenData.error_description || ""}`;

      await supabase
        .from("marketing_connections")
        .update({
          status: "error",
          last_error: errorMsg,
        })
        .eq("id", connection_id);

      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcular nueva fecha de expiración
    const expiresIn = tokenData.expires_in || 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Actualizar en base de datos
    const { error: updateError } = await supabase
      .from("marketing_connections")
      .update({
        access_token: tokenData.access_token,
        token_expires_at: newExpiresAt,
        // Si Google devuelve nuevo refresh_token (rotación), actualizarlo también
        ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
        last_error: null,
        status: "active",
      })
      .eq("id", connection_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Error al guardar token", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        expires_at: newExpiresAt,
        connection_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
