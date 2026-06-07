import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireCaller } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Payload {
  action: "activate" | "cancel" | "extend";
  subscription_id: string;
  reason?: string;
  days?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Only super_admin can hit any of the admin subscription RPCs. Before
    // this edge function existed they were callable from PostgREST as
    // SECURITY DEFINER RPCs with an internal role check — Supabase advisor
    // 0029 flagged them as authenticated-exposed. Moving the surface here
    // shuts the PostgREST entrypoint completely (the RPCs themselves had
    // EXECUTE revoked from authenticated in the companion migration); the
    // only way to reach the RPC is now via this gated edge function.
    const caller = await requireCaller(req, {
      roles: ["super_admin"],
      corsHeaders,
    });
    if (!caller.ok) return caller.response;

    const body = await req.json() as Payload;
    const { action, subscription_id, reason, days } = body;

    if (!subscription_id || typeof subscription_id !== "string") {
      return jsonRes({ error: "subscription_id required" }, 400);
    }
    if (!["activate", "cancel", "extend"].includes(action)) {
      return jsonRes({ error: "action must be activate, cancel, or extend" }, 400);
    }

    let result;
    if (action === "activate") {
      const r = await caller.admin.rpc("admin_activate_subscription", {
        p_subscription_id: subscription_id,
        p_reason: reason ?? "",
      });
      result = r;
    } else if (action === "cancel") {
      const r = await caller.admin.rpc("admin_cancel_subscription", {
        p_subscription_id: subscription_id,
        p_reason: reason ?? "",
      });
      result = r;
    } else {
      const dd = Number(days);
      if (!Number.isFinite(dd) || dd <= 0 || dd > 3650) {
        return jsonRes({ error: "days must be between 1 and 3650" }, 400);
      }
      const r = await caller.admin.rpc("admin_extend_subscription", {
        p_subscription_id: subscription_id,
        p_days: Math.floor(dd),
        p_reason: reason ?? "",
      });
      result = r;
    }

    if (result.error) {
      return jsonRes({ error: result.error.message }, 400);
    }
    return jsonRes({ ok: true, data: result.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonRes({ error: msg }, 500);
  }
});
