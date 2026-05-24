import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // CRITICAL guard: this function irreversibly deletes every company
  // past its scheduled deletion date — ~40 tables wiped + auth.users
  // dropped for every member. It must be reachable ONLY by the cron
  // job (which calls with the service-role bearer). Without this
  // check, anyone holding the anon key — i.e. anyone who opened the
  // public homepage — could trigger a multi-tenant wipe.
  if (!isServiceRoleCall(req)) {
    return forbidden(corsHeaders, "Service-role required");
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date().toISOString();

    // Find companies scheduled for deletion
    const { data: companies } = await adminClient
      .from("companies")
      .select("id, name")
      .not("deletion_scheduled_for", "is", null)
      .lte("deletion_scheduled_for", now);

    let companiesDeleted = 0;
    let profilesDeleted = 0;

    for (const company of companies ?? []) {
      // Get all user IDs for this company
      const { data: members } = await adminClient
        .from("profiles")
        .select("id")
        .eq("company_id", company.id);

      const memberIds = (members ?? []).map((m: { id: string }) => m.id);

      // Delete company-scoped data from all related tables
      const companyTables = [
        "notifications",
        "push_subscriptions",
        "device_tokens",
        "notification_preferences",
        "email_deliveries",
        "audit_logs",
        "stock_alerts",
        "scan_events",
        "partner_flow_events",
        "webhook_events",
        "webhooks",
        "company_api_keys",
        "pallet_account_transactions",
        "pallet_accounts",
        "held_stock_movements",
        "held_stock",
        "delivery_proofs",
        "acc_bank_statement_lines",
        "acc_bank_statements",
        "acc_bank_accounts",
        "acc_transactions",
        "acc_journal_entries",
        "acc_scanned_documents",
        "acc_invoice_sequences",
        "acc_client_prices",
        "acc_fixed_assets",
        "acc_expense_categories",
        "acc_imports",
        "acc_chart_of_accounts",
        "acc_purchases",
        "acc_invoices",
        "acc_contacts",
        "acc_products",
        "acc_product_categories",
        "acc_delivery_notes",
        "acc_company_settings",
        "fleet_scanned_documents",
        "compliance_reminders",
        "vehicle_assignments",
        "vehicle_taxes",
        "vehicle_insurance",
        "vehicle_inspections",
        "vehicles",
        "driver_identity_documents",
        "driver_locations",
        "driver_route_plans",
        "shift_sessions",
        "route_extension_requests",
        "trailer_loads",
        "depot_repairs",
        "stock_movements",
        "stock",
        "delivery_notes",
        "sorting_batches",
        "sorting_batch_items",
        "category_products",
        "product_categories",
        "documents",
        "chat_messages",
        "chat_participants",
        "chat_rooms",
        "depots",
        "company_features",
        "company_subscriptions",
        "company_email_settings",
        "tracking_prompts",
      ];

      for (const table of companyTables) {
        try {
          await adminClient.from(table).delete().eq("company_id", company.id);
        } catch {
          // Some tables may not exist or have different column names
        }
      }

      // Delete user-scoped data
      for (const table of ["push_subscriptions", "device_tokens", "notification_preferences"]) {
        try {
          if (memberIds.length > 0) {
            await adminClient.from(table).delete().in("user_id", memberIds);
          }
        } catch { /* skip */ }
      }

      // Deactivate and delete auth users
      for (const memberId of memberIds) {
        try {
          await adminClient
            .from("profiles")
            .update({ is_active: false })
            .eq("id", memberId);
          await adminClient.auth.admin.deleteUser(memberId);
          profilesDeleted++;
        } catch { /* continue with next */ }
      }

      // Delete company itself
      try {
        await adminClient.from("companies").delete().eq("id", company.id);
        companiesDeleted++;
      } catch { /* log but continue */ }
    }

    // Find individual profiles scheduled for deletion (non-company-admin)
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, company_id, role")
      .not("deletion_scheduled_for", "is", null)
      .lte("deletion_scheduled_for", now)
      .neq("role", "company_admin");

    for (const prof of profiles ?? []) {
      try {
        // Delete user-scoped data
        for (const table of ["notifications", "push_subscriptions", "device_tokens", "notification_preferences", "driver_locations", "driver_route_plans", "shift_sessions"]) {
          try {
            await adminClient.from(table).delete().eq("user_id", prof.id);
          } catch { /* skip */ }
        }

        // For drivers, clear driver_id references
        if (prof.role === "driver") {
          try {
            await adminClient
              .from("delivery_notes")
              .update({ driver_id: null })
              .eq("driver_id", prof.id);
          } catch { /* skip */ }
        }

        await adminClient
          .from("profiles")
          .update({ is_active: false })
          .eq("id", prof.id);

        await adminClient.auth.admin.deleteUser(prof.id);
        profilesDeleted++;
      } catch { /* continue */ }
    }

    return new Response(
      JSON.stringify({
        success: true,
        companies_deleted: companiesDeleted,
        profiles_deleted: profilesDeleted,
        executed_at: now,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
