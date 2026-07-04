// Per-request CORS header builder.
//
// Previously every edge function shipped `Access-Control-Allow-Origin: *`.
// With Bearer-token auth that's not directly exploitable (an attacker
// without the JWT can't read tenant data), but it removes a layer of
// defense: a stolen JWT can be used from ANY origin, error-page text
// can leak to third-party JS, and browser CORS noise hides intent.
//
// `buildCorsHeaders(req)` reflects the request's Origin only if it
// appears in APP_ALLOWED_ORIGINS (comma-separated). If the env var is
// not set, falls back to `*` and warn-logs once per cold start so the
// gap is visible in function logs but dev environments don't break.
//
// USAGE — replace module-scope corsHeaders with a per-request build:
//
//   // old:
//   // const corsHeaders = { "Access-Control-Allow-Origin": "*", ... };
//
//   import { buildCorsHeaders } from "../_shared/cors.ts";
//
//   Deno.serve(async (req) => {
//     const corsHeaders = buildCorsHeaders(req, {
//       methods: "POST, DELETE, OPTIONS",
//     });
//     // ... rest of handler unchanged
//   });

let warnedAboutMissingAllowlist = false;

export interface CorsOptions {
  /** Methods string, e.g. "GET, POST, OPTIONS". Defaults to "GET, POST, OPTIONS". */
  methods?: string;
  /** Headers string. Defaults to the standard Supabase set. */
  headers?: string;
  /** Whether to send Vary: Origin (recommended when echoing Origin). Default true. */
  vary?: boolean;
}

function parseAllowlist(): Set<string> {
  const raw = Deno.env.get("APP_ALLOWED_ORIGINS") ?? "";
  const set = new Set<string>();
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      set.add(new URL(entry).origin);
    } catch {
      // Ignore malformed entries — operator will see the warning.
    }
  }
  return set;
}

export function buildCorsHeaders(
  req: Request,
  opts: CorsOptions = {},
): Record<string, string> {
  const methods = opts.methods ?? "GET, POST, OPTIONS";
  const headers = opts.headers ?? "Content-Type, Authorization, X-Client-Info, Apikey";

  const allowlist = parseAllowlist();
  const reqOrigin = req.headers.get("Origin");

  let allowOrigin: string;
  if (allowlist.size === 0) {
    if (!warnedAboutMissingAllowlist) {
      console.warn(
        "buildCorsHeaders: APP_ALLOWED_ORIGINS not set — falling back to '*'. Set this in production.",
      );
      warnedAboutMissingAllowlist = true;
    }
    allowOrigin = "*";
  } else if (reqOrigin && allowlist.has(reqOrigin)) {
    allowOrigin = reqOrigin;
  } else {
    // Request from a non-allowlisted origin (or no Origin header). Pick the
    // first allowlisted origin so preflight can still complete cleanly for
    // legitimate same-origin / native-app callers, and so a misconfigured
    // browser request gets a clear CORS error instead of a confusing 500.
    allowOrigin = allowlist.values().next().value as string;
  }

  const out: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": headers,
  };
  if (opts.vary !== false && allowOrigin !== "*") {
    out["Vary"] = "Origin";
  }
  return out;
}
