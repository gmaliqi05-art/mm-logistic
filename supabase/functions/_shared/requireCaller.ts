/**
 * Caller authentication + tenant isolation helpers shared across edge
 * functions. Every endpoint that holds a service-role key MUST run the
 * incoming request through `requireCaller()` before touching another
 * tenant's data — otherwise the anon-key bundle shipped to browsers is
 * a free pass to the entire database.
 *
 * Usage:
 *
 *   import { requireCaller, forbidden } from "../_shared/requireCaller.ts";
 *
 *   const caller = await requireCaller(req, { roles: ["company_admin", "accountant"] });
 *   if (!caller.ok) return caller.response;
 *
 *   // caller.profile.company_id is the only tenant id the caller may read
 *   if (bodyCompanyId !== caller.profile.company_id && caller.profile.role !== "super_admin") {
 *     return forbidden(corsHeaders, "cross-tenant access denied");
 *   }
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface CallerProfile {
  id: string;
  company_id: string | null;
  role: string;
  is_active: boolean;
  full_name: string | null;
  email: string | null;
}

export type CallerOk = {
  ok: true;
  user: { id: string; email?: string | null };
  profile: CallerProfile;
  admin: SupabaseClient;
};

export type CallerFail = {
  ok: false;
  response: Response;
};

export type CallerResult = CallerOk | CallerFail;

export interface RequireCallerOptions {
  /** When set, the caller's `profiles.role` must be one of these. */
  roles?: string[];
  /** Whether to allow `is_active = false` profiles. Default false. */
  allowInactive?: boolean;
  /**
   * CORS headers to attach to the rejection response. Pass the same
   * `corsHeaders` your handler uses so the browser doesn't see a CORS
   * error in addition to the 401/403.
   */
  corsHeaders?: Record<string, string>;
}

function buildClients() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "edge function misconfigured: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return { url, anonKey, serviceKey };
}

function jsonError(
  status: number,
  message: string,
  corsHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

export function unauthorized(
  corsHeaders: Record<string, string> = {},
  message = "Unauthorized",
): Response {
  return jsonError(401, message, corsHeaders);
}

export function forbidden(
  corsHeaders: Record<string, string> = {},
  message = "Forbidden",
): Response {
  return jsonError(403, message, corsHeaders);
}

export async function requireCaller(
  req: Request,
  opts: RequireCallerOptions = {},
): Promise<CallerResult> {
  const corsHeaders = opts.corsHeaders ?? {};
  let env;
  try {
    env = buildClients();
  } catch (err) {
    return {
      ok: false,
      response: jsonError(
        500,
        err instanceof Error ? err.message : "Server misconfigured",
        corsHeaders,
      ),
    };
  }

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, response: unauthorized(corsHeaders, "Missing bearer token") };
  }

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, response: unauthorized(corsHeaders, "Invalid session") };
  }

  const admin = createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, company_id, role, is_active, full_name, email")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return { ok: false, response: unauthorized(corsHeaders, "Profile not found") };
  }

  if (!opts.allowInactive && profile.is_active === false) {
    return { ok: false, response: forbidden(corsHeaders, "Account disabled") };
  }

  if (opts.roles && opts.roles.length > 0 && !opts.roles.includes(profile.role)) {
    return {
      ok: false,
      response: forbidden(corsHeaders, `Role '${profile.role}' is not permitted`),
    };
  }

  return {
    ok: true,
    user: { id: userData.user.id, email: userData.user.email ?? null },
    profile: profile as CallerProfile,
    admin,
  };
}

/**
 * Convenience guard for "this body claims to operate on company X — is
 * that the caller's own company, or are they a super_admin?".
 * Returns null on success, a Response on rejection (status 403).
 */
export function assertOwnCompany(
  caller: CallerOk,
  requestedCompanyId: string | null | undefined,
  corsHeaders: Record<string, string> = {},
): Response | null {
  if (!requestedCompanyId) return null;
  if (caller.profile.role === "super_admin") return null;
  if (caller.profile.company_id === requestedCompanyId) return null;
  return forbidden(corsHeaders, "Cross-tenant access denied");
}

/**
 * Setup-token guard for bootstrap endpoints (create-super-admin,
 * seed-demo-users, create-demo-accountant). When `SETUP_TOKEN` is set
 * in the environment, requests must include `X-Setup-Token` matching
 * that value. If the env var is not set the endpoint is BLOCKED — no
 * accidental world-writable boot endpoints.
 */
export function requireSetupToken(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Response | null {
  const expected = Deno.env.get("SETUP_TOKEN");
  if (!expected) {
    return jsonError(
      503,
      "Bootstrap endpoint is disabled. Set SETUP_TOKEN to enable.",
      corsHeaders,
    );
  }
  const provided = req.headers.get("X-Setup-Token") || req.headers.get("x-setup-token") || "";
  if (provided !== expected) {
    return jsonError(401, "Invalid setup token", corsHeaders);
  }
  return null;
}

/**
 * Returns true when the request carries an Authorization bearer that
 * matches SUPABASE_SERVICE_ROLE_KEY exactly. Used to allow cron jobs
 * and inter-function calls (which carry the service-role bearer)
 * through endpoints that otherwise require a user session.
 *
 * Never expose service-role bearers to the browser bundle — they grant
 * full DB access. This check is for trusted server-to-server callers
 * only (pg_cron via http_post, edge function calling edge function).
 */
export function isServiceRoleCall(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return false;
  const header = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  return token === serviceKey;
}

/**
 * Build a service-role Supabase client. Use only AFTER verifying the
 * caller via requireCaller() or isServiceRoleCall() — this client
 * bypasses RLS.
 */
export function adminClient(): SupabaseClient {
  const env = buildClients();
  return createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
