/**
 * Resend webhook receiver. Populates public.email_suppression on
 * permanent failures so we stop emailing dead/complaining addresses.
 *
 * Set this URL in Resend dashboard → Webhooks:
 *   {SUPABASE_URL}/functions/v1/resend-webhook
 *
 * Configure RESEND_WEBHOOK_SECRET (the Svix signing secret Resend
 * exposes when you create the webhook) in the function env.
 *
 * Events handled:
 *   email.bounced     → suppression { source: 'bounce' } only for
 *                        permanent bounces. Soft bounces (transient)
 *                        are recorded in email_deliveries but not
 *                        suppressed.
 *   email.complained  → suppression { source: 'complaint' }
 *   email.delivered / .opened / .clicked → ignored.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, svix-id, svix-timestamp, svix-signature",
};

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    complaint?: { type?: string };
  };
};

// Constant-time string compare to dodge timing oracle on the signature
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifySvixSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  // Resend uses Svix, which prefixes the secret with "whsec_". Strip it.
  const secretClean = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(secretClean), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Header looks like "v1,base64sig v1,base64sig2" — any may match.
  for (const part of svixSignature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    if (timingSafeEqual(sig, expected)) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "RESEND_WEBHOOK_SECRET not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const svixId = req.headers.get("svix-id") || "";
  const svixTimestamp = req.headers.get("svix-timestamp") || "";
  const svixSignature = req.headers.get("svix-signature") || "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response(JSON.stringify({ error: "Missing svix headers" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Replay-attack guard: reject events whose svix-timestamp is more
  // than 5 minutes off the current time. Without this, a captured
  // signed payload could be replayed indefinitely (the HMAC itself
  // doesn't expire).
  const tsSeconds = Number(svixTimestamp);
  if (!Number.isFinite(tsSeconds)) {
    return new Response(JSON.stringify({ error: "Invalid svix-timestamp" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > 5 * 60) {
    return new Response(JSON.stringify({ error: "Timestamp outside tolerance" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = await req.text();
  const valid = await verifySvixSignature(
    payload,
    svixId,
    svixTimestamp,
    svixSignature,
    secret,
  );
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const recipients = event.data?.to ?? [];
  const handled: string[] = [];

  switch (event.type) {
    case "email.bounced": {
      // Only suppress on permanent bounces. Resend reports the subtype.
      const bounceType = String(event.data?.bounce?.type ?? "").toLowerCase();
      const subType = String(event.data?.bounce?.subType ?? "").toLowerCase();
      const isPermanent =
        bounceType === "permanent" ||
        subType === "general" ||
        subType === "nosuchuser" ||
        subType === "suppressed";
      if (isPermanent) {
        for (const addr of recipients) {
          await supabase.from("email_suppression").upsert(
            {
              email: addr.toLowerCase(),
              source: "bounce",
              reason: event.data?.bounce?.message ?? "Permanent bounce",
              payload: event,
            },
            { onConflict: "email" },
          );
          handled.push(addr);
        }
      }
      break;
    }
    case "email.complained": {
      for (const addr of recipients) {
        await supabase.from("email_suppression").upsert(
          {
            email: addr.toLowerCase(),
            source: "complaint",
            reason: "Marked as spam",
            payload: event,
          },
          { onConflict: "email" },
        );
        handled.push(addr);
      }
      break;
    }
    case "email.delivered":
    case "email.opened":
    case "email.clicked":
    case "email.sent":
      // Just observed; nothing to do.
      break;
    default:
      // Unknown event type — log and accept so Resend doesn't retry.
      break;
  }

  // Reflect any matching delivery row.
  if (event.data?.email_id) {
    const statusByType: Record<string, string> = {
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
    };
    const newStatus = statusByType[event.type];
    if (newStatus) {
      await supabase
        .from("email_deliveries")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("provider_id", event.data.email_id);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, handled, event_type: event.type }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
