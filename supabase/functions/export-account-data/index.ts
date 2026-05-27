import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function toCsv(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );
  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Mungon autorizimi" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token i pavlefshem" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, company_id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Profili nuk u gjet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zip = new JSZip();
    const companyId = profile.company_id;

    if (profile.role === "company_admin" && companyId) {
      const tables: { name: string; table: string; select?: string; filter?: Record<string, string> }[] = [
        { name: "kompania", table: "companies", filter: { id: companyId } },
        { name: "perdoruesit", table: "profiles", select: "id, email, full_name, phone, role, is_active, created_at" },
        { name: "faturat", table: "acc_invoices" },
        { name: "blerjet", table: "acc_purchases" },
        { name: "kontaktet", table: "acc_contacts" },
        { name: "produktet", table: "acc_products" },
        { name: "transaksionet", table: "acc_transactions" },
        { name: "llogarite_bankare", table: "acc_bank_accounts" },
        { name: "fletengarkesat", table: "delivery_notes" },
        { name: "stoku", table: "stock" },
        { name: "levizjet_stokut", table: "stock_movements" },
        { name: "automjetet", table: "vehicles" },
        { name: "depoiste", table: "depots" },
        { name: "kategorite_produkteve", table: "product_categories" },
        { name: "llogarite_paletave", table: "pallet_accounts" },
        { name: "transaksionet_paletave", table: "pallet_account_transactions" },
        { name: "riparime_depot", table: "depot_repairs" },
        { name: "dokumentet", table: "documents" },
      ];

      for (const t of tables) {
        try {
          let query;
          if (t.filter) {
            const [key, val] = Object.entries(t.filter)[0];
            query = adminClient.from(t.table).select(t.select || "*").eq(key, val);
          } else {
            query = adminClient.from(t.table).select(t.select || "*").eq("company_id", companyId);
          }
          const { data } = await query.limit(10000);
          if (data && data.length > 0) {
            zip.file(`${t.name}.csv`, toCsv(data as Record<string, unknown>[]));
          }
        } catch {
          // skip tables that don't exist or fail
        }
      }
    } else {
      zip.file(
        "profili.csv",
        toCsv([{
          id: user.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          company_id: profile.company_id,
        }])
      );

      if (companyId) {
        try {
          const { data: deliveries } = await adminClient
            .from("delivery_notes")
            .select("*")
            .eq("company_id", companyId)
            .eq("driver_id", user.id)
            .limit(5000);
          if (deliveries && deliveries.length > 0) {
            zip.file("fletengarkesat_e_mia.csv", toCsv(deliveries as Record<string, unknown>[]));
          }
        } catch { /* skip */ }

        try {
          const { data: locations } = await adminClient
            .from("driver_locations")
            .select("*")
            .eq("driver_id", user.id)
            .limit(5000);
          if (locations && locations.length > 0) {
            zip.file("lokacionet_e_mia.csv", toCsv(locations as Record<string, unknown>[]));
          }
        } catch { /* skip */ }
      }
    }

    const metadata = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      email: user.email,
      role: profile.role,
      company_id: companyId,
    };
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));

    const zipContent = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="eksport_te_dhenat_${new Date().toISOString().split("T")[0]}.zip"`,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
