import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";
import { requireEnv } from "../_shared/env.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, {
    methods: "GET, POST, PUT, DELETE, OPTIONS",
  });
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
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

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
    // GDPR compliance: track every failure so we never report
    // "deleted" while data lingers. If any per-table delete fails
    // we keep going for the remaining tables (best-effort), but
    // surface the failures in the response and SKIP the final
    // auth.users wipe + companies.delete so the cron can retry
    // and the operator can clean up the orphans.
    const failures: Array<{ scope: string; table?: string; id: string; error: string }> = [];
    const noteFailure = (scope: string, id: string, error: unknown, table?: string) => {
      const msg = error instanceof Error ? error.message : String(error);
      failures.push({ scope, table, id, error: msg });
      console.error(`execute-account-deletion ${scope} ${table ?? ''} ${id}`, msg);
    };

    for (const company of companies ?? []) {
      const initialFailureCount = failures.length;
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
        const { error } = await adminClient.from(table).delete().eq("company_id", company.id);
        if (error) noteFailure("company-table", company.id, error, table);
      }

      // Delete user-scoped data
      for (const table of ["push_subscriptions", "device_tokens", "notification_preferences"]) {
        if (memberIds.length > 0) {
          const { error } = await adminClient.from(table).delete().in("user_id", memberIds);
          if (error) noteFailure("user-table", company.id, error, table);
        }
      }

      // If anything above failed, do NOT proceed to delete auth.users
      // or the companies row — the operator needs to clean up the
      // orphans first. The cron will retry on the next tick.
      if (failures.length > initialFailureCount) {
        console.warn(`execute-account-deletion: skipping company ${company.id} cleanup due to ${failures.length - initialFailureCount} prior failures`);
        continue;
      }

      // Deactivate and delete auth users
      for (const memberId of memberIds) {
        const { error: deactErr } = await adminClient
          .from("profiles")
          .update({ is_active: false })
          .eq("id", memberId);
        if (deactErr) {
          noteFailure("profile-deactivate", memberId, deactErr);
          continue;
        }
        try {
          await adminClient.auth.admin.deleteUser(memberId);
          profilesDeleted++;
        } catch (authErr) {
          noteFailure("auth-delete", memberId, authErr);
        }
      }

      // Delete company itself
      const { error: coErr } = await adminClient.from("companies").delete().eq("id", company.id);
      if (coErr) {
        noteFailure("company-delete", company.id, coErr);
      } else {
        companiesDeleted++;
      }
    }

    // Find individual profiles scheduled for deletion (non-company-admin)
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, company_id, role")
      .not("deletion_scheduled_for", "is", null)
      .lte("deletion_scheduled_for", now)
      .neq("role", "company_admin");

    for (const prof of profiles ?? []) {
      const initialProfFailures = failures.length;
      // Delete user-scoped data
      for (const table of ["notifications", "push_subscriptions", "device_tokens", "notification_preferences", "driver_locations", "driver_route_plans", "shift_sessions"]) {
        const { error } = await adminClient.from(table).delete().eq("user_id", prof.id);
        if (error) noteFailure("profile-user-table", prof.id, error, table);
      }

      // For drivers, clear driver_id references
      if (prof.role === "driver") {
        const { error } = await adminClient
          .from("delivery_notes")
          .update({ driver_id: null })
          .eq("driver_id", prof.id);
        if (error) noteFailure("profile-driver-clear", prof.id, error, "delivery_notes");
      }

      // Skip auth.users wipe if any prerequisite cleanup failed.
      if (failures.length > initialProfFailures) continue;

      const { error: deactErr } = await adminClient
        .from("profiles")
        .update({ is_active: false })
        .eq("id", prof.id);
      if (deactErr) {
        noteFailure("profile-deactivate", prof.id, deactErr);
        continue;
      }

      try {
        await adminClient.auth.admin.deleteUser(prof.id);
        profilesDeleted++;
      } catch (authErr) {
        noteFailure("auth-delete", prof.id, authErr);
      }
    }

    // Cron uses status === 200 + success === true as "this row was
    // fully cleaned up". Surface partial-failure as success: false
    // so the next cron tick retries the un-deleted rows.
    const success = failures.length === 0;
    return new Response(
      JSON.stringify({
        success,
        companies_deleted: companiesDeleted,
        profiles_deleted: profilesDeleted,
        failures: failures.length === 0 ? undefined : failures,
        executed_at: now,
      }),
      {
        status: success ? 200 : 207, // 207 Multi-Status when partial
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
