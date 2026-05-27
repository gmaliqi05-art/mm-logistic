import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let _admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  _admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowMs);

  const admin = getAdmin();
  const { data: existing } = await admin
    .from("rate_limit_buckets")
    .select("key, count, window_start")
    .eq("key", key)
    .maybeSingle();

  if (!existing || new Date(existing.window_start as string) < windowStartCutoff) {
    await admin.from("rate_limit_buckets").upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
    });
    return { allowed: true, retryAfter: 0, remaining: maxRequests - 1 };
  }

  const count = (existing.count as number) ?? 0;
  if (count >= maxRequests) {
    const elapsed = now.getTime() - new Date(existing.window_start as string).getTime();
    const retryAfter = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
    return { allowed: false, retryAfter, remaining: 0 };
  }

  await admin
    .from("rate_limit_buckets")
    .update({ count: count + 1 })
    .eq("key", key);

  return { allowed: true, retryAfter: 0, remaining: maxRequests - count - 1 };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Please slow down." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter),
      },
    },
  );
}
