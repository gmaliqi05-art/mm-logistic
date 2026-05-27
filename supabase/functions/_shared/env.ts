import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function supabaseEnv() {
  return {
    url: requireEnv("SUPABASE_URL"),
    anonKey: requireEnv("SUPABASE_ANON_KEY"),
    serviceKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function adminClient(): SupabaseClient {
  const env = supabaseEnv();
  return createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClient(authHeader: string): SupabaseClient {
  const env = supabaseEnv();
  return createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function envError(corsHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: "Server misconfigured: missing environment variables" }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
