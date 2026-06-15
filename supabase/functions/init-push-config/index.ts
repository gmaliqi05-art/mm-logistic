import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Setup-Token",
};

// Deprecated. The previous implementation wrote SUPABASE_SERVICE_ROLE_KEY
// into the public.app_config table in plain text, which the
// notifications_dispatch_push() trigger then read for every notification
// row. Audit finding KE1 — the table is reachable via SECURITY DEFINER
// helpers, so the master credential could escape through any
// unrelated RLS bypass.
//
// Migration 20260615120000_dispatch_push_use_vault_drop_app_config.sql
// switched the trigger to read from Vault. Operators must populate
// `vault.decrypted_secrets` with `SUPABASE_URL` and
// `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Database → Vault).
//
// The route is kept so existing scripts / CI that POST here get a
// clear 410 with migration instructions instead of a 404.
Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "deprecated",
      message:
        "init-push-config is removed. Push dispatch now reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from vault.decrypted_secrets. Configure them via the Supabase dashboard (Database → Vault) or with SELECT vault.create_secret('<value>', 'SUPABASE_URL') and SELECT vault.create_secret('<value>', 'SUPABASE_SERVICE_ROLE_KEY').",
      migration: "20260615120000_dispatch_push_use_vault_drop_app_config.sql",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
