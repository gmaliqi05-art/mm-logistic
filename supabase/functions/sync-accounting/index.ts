import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncRequest {
  company_id?: string;
  sync_type?: "manual" | "automatic";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let body: SyncRequest = {};
    try {
      body = await req.json();
    } catch {
      /* ignore */
    }
    const syncType = body.sync_type ?? "manual";

    const companyIds: string[] = [];
    if (body.company_id) {
      companyIds.push(body.company_id);
    } else {
      const { data } = await supabase
        .from("company_sync_settings")
        .select("company_id")
        .eq("auto_sync_enabled", true);
      for (const r of data ?? []) companyIds.push((r as any).company_id);
    }

    const results: Array<{ company_id: string; counts: Record<string, number>; status: string; error?: string }> = [];

    for (const companyId of companyIds) {
      try {
        await supabase
          .from("company_sync_settings")
          .update({ last_sync_status: "running" })
          .eq("company_id", companyId);

        const counts = {
          invoices: 0,
          purchases: 0,
          stock_movements: 0,
          delivery_notes: 0,
        };

        const { data: invoices } = await supabase
          .from("acc_invoices")
          .select("id, updated_at")
          .eq("company_id", companyId)
          .in("status", ["sent", "paid"]);
        counts.invoices = invoices?.length ?? 0;

        const { data: purchases } = await supabase
          .from("acc_purchases")
          .select("id, updated_at")
          .eq("company_id", companyId)
          .in("status", ["received", "paid"]);
        counts.purchases = purchases?.length ?? 0;

        const { data: dn } = await supabase
          .from("delivery_notes")
          .select("id")
          .eq("company_id", companyId)
          .eq("process_closed", true);
        counts.delivery_notes = dn?.length ?? 0;

        const { data: mov } = await supabase
          .from("stock_movements")
          .select("id")
          .eq("company_id", companyId);
        counts.stock_movements = mov?.length ?? 0;

        const logRows = [
          { entity_type: "invoices", count: counts.invoices },
          { entity_type: "purchases", count: counts.purchases },
          { entity_type: "delivery_notes", count: counts.delivery_notes },
          { entity_type: "stock_movements", count: counts.stock_movements },
        ].map((r) => ({
          company_id: companyId,
          entity_type: r.entity_type,
          sync_type: syncType,
          status: "success" as const,
          details: { count: r.count },
        }));

        await supabase.from("company_accounting_sync_log").insert(logRows);

        await supabase
          .from("company_sync_settings")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
            last_sync_error: null,
            last_sync_counts: counts,
          })
          .eq("company_id", companyId);

        results.push({ company_id: companyId, counts, status: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase
          .from("company_sync_settings")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "failed",
            last_sync_error: message,
          })
          .eq("company_id", companyId);
        await supabase.from("company_accounting_sync_log").insert({
          company_id: companyId,
          entity_type: "sync_run",
          sync_type: syncType,
          status: "failed",
          error_message: message,
        });
        results.push({ company_id: companyId, counts: {}, status: "failed", error: message });
      }
    }

    const aggregated = results.reduce(
      (acc, r) => {
        for (const k of Object.keys(r.counts)) {
          acc[k] = (acc[k] ?? 0) + (r.counts[k] ?? 0);
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        companies_processed: results.length,
        counts: aggregated,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
