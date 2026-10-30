import {withMarketingAuth} from './marketing-auth.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(withMarketingAuth(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { connection_id, external_id, external_name } = body;
    if (body.ping) return new Response(JSON.stringify({ ok: true, ping: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!connection_id || !external_id) {
      return new Response(
        JSON.stringify({ error: "connection_id y external_id son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verificar que la conexión existe y tiene tokens
    const { data: connection, error: fetchError } = await supabase
      .from("marketing_connections")
      .select("id, source, access_token, refresh_token, status, organization_id")
      .eq("id", connection_id)
      .single();

    if (fetchError || !connection) {
      return new Response(
        JSON.stringify({ error: "Conexión no encontrada", details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar que tiene tokens mínimos para ser funcional
    const hasTokens = connection.access_token || connection.refresh_token;
    const newStatus = hasTokens ? "active" : "error";
    const newError = hasTokens ? null : "Sin tokens OAuth. Requiere reconexión completa.";

    // Actualizar la conexión con la propiedad seleccionada
    const { error: updateError } = await supabase
      .from("marketing_connections")
      .update({
        external_id: external_id,
        external_name: external_name || external_id,
        status: newStatus,
        last_error: newError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Error al guardar selección", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        success: true,
        connection_id,
        active_connection_id: connection_id,
        source: connection.source,
        external_id,
        external_name: external_name || external_id,
        status: newStatus,
        message: newStatus === "active"
          ? "Conexión activada correctamente. Lista para sincronización."
          : "Propiedad guardada pero la conexión requiere reconexión OAuth.",
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
