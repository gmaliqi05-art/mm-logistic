import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, isServiceRoleCall } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AudienceFilter {
  roles?: string[];
  business_types?: string[];
  locales?: string[];
  company_ids?: string[];
  subscription_statuses?: string[];
  active_only?: boolean;
  marketing_opt_in_only?: boolean;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

async function resolveAudience(filter: AudienceFilter): Promise<{ id: string; email: string; locale: string }[]> {
  let q = supabase.from("profiles").select("id, email, locale, role, company_id, is_active");
  if (filter.active_only !== false) q = q.eq("is_active", true);
  if (filter.roles && filter.roles.length > 0) q = q.in("role", filter.roles);
  if (filter.locales && filter.locales.length > 0) q = q.in("locale", filter.locales);
  if (filter.company_ids && filter.company_ids.length > 0) q = q.in("company_id", filter.company_ids);

  const { data: profiles } = await q;
  let rows = (profiles ?? []).filter((p) => !!p.email);

  if (filter.business_types && filter.business_types.length > 0) {
    const companyIds = Array.from(new Set(rows.map((p) => p.company_id).filter(Boolean)));
    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from("companies")
        .select("id, business_type")
        .in("id", companyIds);
      const allowed = new Set((companies ?? []).filter((c) => filter.business_types!.includes(c.business_type)).map((c) => c.id));
      rows = rows.filter((p) => p.company_id && allowed.has(p.company_id));
    } else {
      rows = [];
    }
  }

  if (filter.subscription_statuses && filter.subscription_statuses.length > 0) {
    const companyIds = Array.from(new Set(rows.map((p) => p.company_id).filter(Boolean)));
    if (companyIds.length > 0) {
      const { data: subs } = await supabase
        .from("company_subscriptions")
        .select("company_id, status")
        .in("company_id", companyIds);
      const allowed = new Set((subs ?? []).filter((s) => filter.subscription_statuses!.includes(s.status)).map((s) => s.company_id));
      rows = rows.filter((p) => p.company_id && allowed.has(p.company_id));
    } else {
      rows = [];
    }
  }

  if (filter.marketing_opt_in_only) {
    const ids = rows.map((p) => p.id);
    if (ids.length > 0) {
      const { data: unsubs } = await supabase
        .from("unsubscribe_tokens")
        .select("user_id, used_at, channel_code")
        .in("user_id", ids)
        .in("channel_code", ["all", "marketing"]);
      const unsubscribed = new Set((unsubs ?? []).filter((u) => u.used_at).map((u) => u.user_id));
      rows = rows.filter((p) => !unsubscribed.has(p.id));
    }
  }

  const seen = new Set<string>();
  return rows
    .filter((p) => {
      const k = String(p.email).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((p) => ({ id: p.id, email: String(p.email), locale: p.locale || "sq" }));
}

async function runCampaign(campaignId: string): Promise<{ ok: boolean; sent: number; failed: number }> {
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, sent: 0, failed: 0 };

  await supabase
    .from("email_campaigns")
    .update({ status: "sending", started_at: new Date().toISOString() })
    .eq("id", campaignId);

  const audience = await resolveAudience(campaign.audience_filter || {});

  await supabase.from("email_campaign_recipients").delete().eq("campaign_id", campaignId);
  if (audience.length > 0) {
    const rows = audience.map((a) => ({
      campaign_id: campaignId,
      user_id: a.id,
      email: a.email,
      locale: campaign.locale_mode === "fixed" ? campaign.fixed_locale : a.locale,
      status: "pending",
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from("email_campaign_recipients").insert(rows.slice(i, i + 500));
    }
  }

  await supabase
    .from("email_campaigns")
    .update({ total_recipients: audience.length })
    .eq("id", campaignId);

  const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let sent = 0, failed = 0;

  const templateCode = campaign.template_code || "admin_broadcast";
  const adHoc = campaign.ad_hoc_content || {};

  for (let i = 0; i < audience.length; i += 1) {
    const r = audience[i];
    const locale = campaign.locale_mode === "fixed" ? campaign.fixed_locale : r.locale;

    const data: Record<string, unknown> = { ...adHoc };

    try {
      const resp = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_code: templateCode,
          to: r.email,
          user_id: r.id,
          locale,
          data,
          campaign_id: campaignId,
        }),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok && j.ok) {
        sent++;
        await supabase
          .from("email_campaign_recipients")
          .update({ status: "sent", provider_id: j.id ?? null, sent_at: new Date().toISOString() })
          .eq("campaign_id", campaignId).eq("email", r.email);
      } else {
        failed++;
        await supabase
          .from("email_campaign_recipients")
          .update({ status: "failed", error: j.error ?? `HTTP ${resp.status}` })
          .eq("campaign_id", campaignId).eq("email", r.email);
      }
    } catch (e) {
      failed++;
      await supabase
        .from("email_campaign_recipients")
        .update({ status: "failed", error: String(e) })
        .eq("campaign_id", campaignId).eq("email", r.email);
    }

    if (i % 10 === 9) {
      await supabase
        .from("email_campaigns")
        .update({ sent_count: sent, failed_count: failed })
        .eq("id", campaignId);
    }
    await new Promise((res) => setTimeout(res, 150));
  }

  await supabase
    .from("email_campaigns")
    .update({
      status: failed > 0 && sent === 0 ? "failed" : "completed",
      sent_count: sent,
      failed_count: failed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return { ok: true, sent, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const tick = url.searchParams.get("tick");

    // Auth gate: cron uses service-role bearer; UI uses super_admin
    // session. Without this guard anyone with the anon key (shipped to
    // every browser) can leak audiences and trigger campaigns.
    if (!isServiceRoleCall(req)) {
      const caller = await requireCaller(req, { roles: ["super_admin"], corsHeaders });
      if (!caller.ok) return caller.response;
    }

    if (tick === "1") {
      const { data: due } = await supabase
        .from("email_campaigns")
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(5);
      const results: Array<{ id: string; ok: boolean; sent: number; failed: number }> = [];
      for (const c of due ?? []) {
        const r = await runCampaign(c.id);
        results.push({ id: c.id, ...r });
      }
      return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { campaign_id, audience_only } = body;
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audience_only) {
      const { data: campaign } = await supabase
        .from("email_campaigns")
        .select("audience_filter")
        .eq("id", campaign_id)
        .maybeSingle();
      const audience = await resolveAudience(campaign?.audience_filter || {});
      return new Response(JSON.stringify({ count: audience.length, sample: audience.slice(0, 20) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await runCampaign(campaign_id);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
