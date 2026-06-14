/**
 * Cron-only edge function: alerts admins when a pallet account approaches
 * the §439 HGB 1-year limitation.
 *
 * Reads `v_pallet_account_aging` (added in migration 20260613190000),
 * picks rows where `oldest_open_txn_age_days` has crossed the warning
 * (300d), critical (330d) or expired (365d) threshold, and writes one
 * `notifications` row per (company_admin/accountant, account) pair —
 * de-duped so the same level is not raised twice in a row.
 *
 * Throttle: we track the highest level previously raised per account
 * via the `pallet_account_last_alarm_level` column (added in the
 * companion migration). The cron only escalates upward, never
 * downward, so:
 *   - first warning → emit
 *   - subsequent days (still warning) → silent
 *   - cross into critical → emit
 *   - drop back to warning after a signed Saldenbestätigung → silent
 *     (and the column resets to NULL on next cron tick).
 *
 * Triggered by pg_cron (daily). Service-role-only access enforced via
 * `isServiceRoleCall`.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type AlarmLevel = "warning" | "critical" | "expired";

const LEVEL_ORDER: Record<AlarmLevel, number> = {
  warning: 1,
  critical: 2,
  expired: 3,
};

const WARNING_DAYS = 300;
const CRITICAL_DAYS = 330;
const EXPIRED_DAYS = 365;

function levelFor(ageDays: number): AlarmLevel | null {
  if (ageDays >= EXPIRED_DAYS) return "expired";
  if (ageDays >= CRITICAL_DAYS) return "critical";
  if (ageDays >= WARNING_DAYS) return "warning";
  return null;
}

interface AgingRow {
  pallet_account_id: string;
  company_id: string;
  partner_contact_id: string;
  pallet_type: string;
  current_balance: number;
  oldest_open_txn_age_days: number | null;
}

interface PalletAccount {
  id: string;
  last_alarm_level: AlarmLevel | null;
}

interface Profile {
  id: string;
  company_id: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!isServiceRoleCall(req)) {
    return forbidden(corsHeaders, "Service-role required");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: agingRows, error: agingErr } = await supabase
      .from("v_pallet_account_aging")
      .select("pallet_account_id, company_id, partner_contact_id, pallet_type, current_balance, oldest_open_txn_age_days")
      .not("oldest_open_txn_age_days", "is", null)
      .gte("oldest_open_txn_age_days", WARNING_DAYS);

    if (agingErr) throw agingErr;
    const candidates = (agingRows ?? []) as AgingRow[];
    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, evaluated: 0, notified: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read the previous alarm level per account so we don't re-emit
    // the same level day after day.
    const accountIds = candidates.map((r) => r.pallet_account_id);
    const { data: accounts } = await supabase
      .from("pallet_accounts")
      .select("id, last_alarm_level")
      .in("id", accountIds);
    const prevLevel = new Map<string, AlarmLevel | null>(
      ((accounts ?? []) as PalletAccount[]).map((a) => [a.id, a.last_alarm_level])
    );

    const partnerIds = Array.from(
      new Set(candidates.map((r) => r.partner_contact_id).filter(Boolean))
    );
    const { data: partners } = await supabase
      .from("acc_contacts")
      .select("id, name")
      .in("id", partnerIds);
    const partnerName = new Map<string, string>(
      ((partners ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
    );

    // Resolve recipients per company once.
    const companyIds = Array.from(new Set(candidates.map((r) => r.company_id)));
    const { data: admins } = await supabase
      .from("profiles")
      .select("id, company_id")
      .in("company_id", companyIds)
      .in("role", ["company_admin", "accountant"])
      .eq("is_active", true);
    const recipientsByCompany = new Map<string, string[]>();
    for (const a of ((admins ?? []) as Profile[])) {
      const arr = recipientsByCompany.get(a.company_id) ?? [];
      arr.push(a.id);
      recipientsByCompany.set(a.company_id, arr);
    }

    let notified = 0;
    let escalated = 0;
    const now = new Date().toISOString();

    for (const row of candidates) {
      const lvl = levelFor(row.oldest_open_txn_age_days ?? 0);
      if (!lvl) continue;
      const prev = prevLevel.get(row.pallet_account_id) ?? null;
      // Skip if we have already alarmed at this level or higher.
      if (prev && LEVEL_ORDER[prev] >= LEVEL_ORDER[lvl]) continue;

      const recipients = recipientsByCompany.get(row.company_id) ?? [];
      if (recipients.length === 0) continue;

      const params = {
        partner: partnerName.get(row.partner_contact_id) ?? "—",
        days: String(row.oldest_open_txn_age_days ?? 0),
        balance: String(row.current_balance),
      };
      const titleKey = `notifications.templates.palletAging${lvl[0].toUpperCase()}${lvl.slice(1)}.title`;
      const messageKey = `notifications.templates.palletAging${lvl[0].toUpperCase()}${lvl.slice(1)}.body`;
      const fallback = `Pallet account with ${params.partner}: ${params.days} days since last reconciliation`;

      const inserts = recipients.map((userId) => ({
        user_id: userId,
        type: "system",
        title: fallback,
        message: fallback,
        reference_id: row.pallet_account_id,
        data: { titleKey, messageKey, params },
      }));

      const { error: insErr } = await supabase.from("notifications").insert(inserts);
      if (insErr) {
        console.error("notifications insert failed", insErr);
        continue;
      }
      notified += inserts.length;
      escalated += 1;

      await supabase
        .from("pallet_accounts")
        .update({ last_alarm_level: lvl, last_alarm_at: now })
        .eq("id", row.pallet_account_id);
    }

    return new Response(
      JSON.stringify({ ok: true, evaluated: candidates.length, escalated, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("check-pallet-account-aging failed", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
