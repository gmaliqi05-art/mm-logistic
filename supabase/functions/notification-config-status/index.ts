import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const has = (name: string) => {
    const v = Deno.env.get(name);
    return typeof v === "string" && v.length > 0;
  };

  const status = {
    web: {
      configured: has("VAPID_PUBLIC_KEY") && has("VAPID_PRIVATE_KEY"),
      vapid_public_key: has("VAPID_PUBLIC_KEY"),
      vapid_private_key: has("VAPID_PRIVATE_KEY"),
      vapid_subject: has("VAPID_SUBJECT"),
    },
    android: {
      configured: has("FCM_SERVICE_ACCOUNT_JSON"),
      fcm_service_account_json: has("FCM_SERVICE_ACCOUNT_JSON"),
    },
    ios: {
      configured:
        has("APNS_KEY_P8") &&
        has("APNS_KEY_ID") &&
        has("APNS_TEAM_ID") &&
        has("APNS_BUNDLE_ID"),
      apns_key_p8: has("APNS_KEY_P8"),
      apns_key_id: has("APNS_KEY_ID"),
      apns_team_id: has("APNS_TEAM_ID"),
      apns_bundle_id: has("APNS_BUNDLE_ID"),
    },
    email: {
      configured: has("RESEND_API_KEY"),
      resend_api_key: has("RESEND_API_KEY"),
    },
  };

  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
