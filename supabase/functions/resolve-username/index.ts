/**
 * Resolve a username to a synthetic auth email so depot workers and
 * drivers can sign in with a username instead of an email.
 *
 * The DB has a SECURITY DEFINER RPC `resolve_username_to_email` that
 * does the lookup. We expose it through this edge function so we can
 * apply rate limiting by IP — the bare RPC, left callable by anon,
 * would let an attacker enumerate every username -> email mapping
 * the company has created. After this is shipped, the RPC's anon
 * EXECUTE grant is revoked and the only path is through this
 * endpoint.
 *
 * Rate limit: 10 calls per minute per IP. A real user types a
 * username at most a few times per minute; 10/min is conservative
 * and still throttles enumeration to ~14k/day, which is detectable
 * in logs and not enough to scan a real-world tenant base.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  username?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST only" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(`resolve-username:ip=${ip}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!username || username.length < 3 || username.length > 64 || !/^[a-z0-9._-]+$/.test(username)) {
    // Constant-shape response so a probe cannot distinguish "invalid format"
    // from "valid format but no match".
    return new Response(
      JSON.stringify({ email: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase.rpc("resolve_username_to_email", {
    p_username: username,
  });

  if (error) {
    // Don't leak error details — the only thing a caller needs to know is
    // whether they got an email back.
    return new Response(
      JSON.stringify({ email: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ email: (data as string | null) ?? null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
