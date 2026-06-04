import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  const jsonResponse = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Mungon autorizimi" }, 401);
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !caller) {
      return jsonResponse(
        { error: "Token i pavlefshem", details: authError?.message },
        401
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile, error: profileFetchError } =
      await supabaseAdmin
        .from("profiles")
        .select("role, company_id, is_active")
        .eq("id", caller.id)
        .maybeSingle();

    if (profileFetchError) {
      return jsonResponse(
        { error: "Gabim gjate leximit te profilit", details: profileFetchError.message },
        500
      );
    }

    if (!callerProfile) {
      return jsonResponse({ error: "Profili nuk u gjet" }, 403);
    }

    // Anything other than an explicit `true` is treated as disabled. The
    // previous strict `=== false` check let through profiles where the
    // column was null (e.g. during a migration window).
    if (callerProfile.is_active !== true) {
      return jsonResponse({ error: "Llogaria juaj eshte c'aktivizuar" }, 403);
    }

    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Body JSON i pavlefshem" }, 400);
      }

      const {
        email,
        password,
        full_name,
        role,
        company_id,
        depot_id,
        phone,
        worker_category,
        username,
        create_login,
      } = body;

      // A worker can be created in three modes:
      //  1. email-based login (driver, accountant, depoist) — supply email + password
      //  2. username-based login (reparature with credentials) — supply username + password
      //  3. profile-only (reparature without credentials) — neither; create_login=false
      const wantsAuthAccount =
        create_login === false ? false : (!!email || !!username);
      const usingUsername = !!username && !email;

      if (!full_name || !role) {
        return jsonResponse(
          {
            error: "Fushat e detyrueshme: full_name, role",
            received: { full_name: !!full_name, role: !!role },
          },
          400
        );
      }

      if (wantsAuthAccount) {
        if (!password) {
          return jsonResponse({ error: "Fjalekalimi eshte i detyrueshem kur krijoni llogari" }, 400);
        }
        if (!email && !username) {
          return jsonResponse({ error: "Duhet ose email ose username" }, 400);
        }
      }

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email !== undefined && email !== null && email !== "") {
        if (typeof email !== "string" || !emailRe.test(email) || email.length > 254) {
          return jsonResponse({ error: "Email i pavlefshem" }, 400);
        }
      }
      const usernameRe = /^[a-zA-Z0-9._-]+$/;
      if (username !== undefined && username !== null && username !== "") {
        if (typeof username !== "string" || username.length < 3 || username.length > 32 || !usernameRe.test(username)) {
          return jsonResponse({ error: "Username duhet 3-32 karaktere (vetem shkronja, numra, . _ -)" }, 400);
        }
      }
      if (wantsAuthAccount && (typeof password !== "string" || password.length < 8 || password.length > 128)) {
        return jsonResponse({ error: "Fjalekalimi duhet 8-128 karaktere" }, 400);
      }
      if (typeof full_name !== "string" || full_name.trim().length === 0 || full_name.length > 200) {
        return jsonResponse({ error: "Emri i plote i pavlefshem" }, 400);
      }
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (company_id !== undefined && company_id !== null && (typeof company_id !== "string" || !uuidRe.test(company_id))) {
        return jsonResponse({ error: "company_id i pavlefshem" }, 400);
      }
      if (depot_id !== undefined && depot_id !== null && (typeof depot_id !== "string" || !uuidRe.test(depot_id))) {
        return jsonResponse({ error: "depot_id i pavlefshem" }, 400);
      }
      if (phone !== undefined && phone !== null && (typeof phone !== "string" || phone.length > 50)) {
        return jsonResponse({ error: "Telefoni i pavlefshem" }, 400);
      }
      // worker_category must be one of the gated values used by the
      // depot_worker route partition (depoist | reparature). Any other
      // string would let a depot_worker bypass the inner
      // <ProtectedRoute workerCategories=...> in src/App.tsx.
      const validWorkerCategories = ["depoist", "reparature"];
      if (worker_category !== undefined && worker_category !== null) {
        if (typeof worker_category !== "string" || !validWorkerCategories.includes(worker_category)) {
          return jsonResponse({ error: "worker_category i pavlefshem" }, 400);
        }
      }
      if (role === "depot_worker" && (!worker_category || !validWorkerCategories.includes(worker_category as string))) {
        return jsonResponse({ error: "depot_worker kerkon worker_category 'depoist' ose 'reparature'" }, 400);
      }

      const validRoles = ["driver", "depot_worker", "company_admin", "accountant"];
      if (!validRoles.includes(role)) {
        return jsonResponse(
          { error: `Roli '${role}' nuk eshte i vlefshem. Rolet: ${validRoles.join(", ")}` },
          400
        );
      }

      if (callerProfile.role === "company_admin") {
        if (role === "super_admin" || role === "company_admin") {
          return jsonResponse(
            { error: "Nuk keni te drejte te krijoni kete rol" },
            403
          );
        }
      } else if (callerProfile.role !== "super_admin") {
        return jsonResponse(
          { error: "Vetem adminat mund te krijojne perdorues" },
          403
        );
      }

      const effectiveCompanyId =
        callerProfile.role === "company_admin"
          ? callerProfile.company_id
          : company_id || null;

      // Build the synthetic email when the caller supplied a username so
      // we can satisfy Supabase Auth's email requirement. The synthetic
      // email is never shown to humans.
      const companyIdShort = (effectiveCompanyId || "").replace(/-/g, "").slice(0, 12);
      const finalEmail = usingUsername
        ? `${companyIdShort}-${(username as string).toLowerCase()}@workers.local`
        : email;

      let createdUserId: string | null = null;

      if (wantsAuthAccount) {
        const { data: newUser, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email: finalEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name, ...(username ? { username } : {}) },
          });

        if (createError) {
          return jsonResponse(
            { error: createError.message, step: "create_auth_user" },
            400
          );
        }
        createdUserId = newUser.user.id;
      }

      const profileData: Record<string, unknown> = {
        full_name,
        role,
        company_id: effectiveCompanyId,
        depot_id: depot_id || null,
        phone: phone || "",
        is_active: true,
      };
      if (createdUserId) {
        profileData.id = createdUserId;
        profileData.email = finalEmail;
      }
      if (username) {
        profileData.username = (username as string).toLowerCase();
      }
      if (worker_category) {
        profileData.worker_category = worker_category;
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert(profileData);

      if (profileError) {
        if (createdUserId) {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        }
        return jsonResponse(
          { error: profileError.message, step: "create_profile", code: profileError.code },
          400
        );
      }

      // Only attempt the invitation email when we have a real, human-readable
      // email (the username-only and profile-only paths skip this — workers
      // without an email obviously cannot receive an invite).
      if (createdUserId && !usingUsername && email) {
        try {
          const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          let companyName = "";
          if (effectiveCompanyId) {
            const { data: c } = await supabaseAdmin
              .from("companies")
              .select("name")
              .eq("id", effectiveCompanyId)
              .maybeSingle();
            companyName = c?.name ?? "";
          }
          const roleLabels: Record<string, string> = {
            driver: "Shofer",
            accountant: "Kontabilist",
            depot_worker: "Punetor depoje",
            logistics_admin: "Admin logjistike",
            company_admin: "Admin kompanie",
            super_admin: "Super admin",
          };
          await fetch(sendUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              template_code: "invite_user",
              to: email,
              user_id: createdUserId,
              company_id: effectiveCompanyId,
              locale: "sq",
              data: {
                full_name: full_name || email,
                company_name: companyName,
                role_label: roleLabels[role] || role,
                inviter_name: "Admini",
                setup_url: "",
              },
            }),
          });
        } catch (_e) {
          // best-effort
        }
      }

      return jsonResponse(
        { user: { id: createdUserId, email: createdUserId ? finalEmail : null, username: username || null, full_name, role } },
        201
      );
    }

    if (req.method === "DELETE") {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Body JSON i pavlefshem" }, 400);
      }

      const { user_id, hard_delete, delete_company } = body as {
        user_id?: string;
        hard_delete?: boolean;
        delete_company?: boolean;
      };

      if (!user_id) {
        return jsonResponse({ error: "user_id eshte i detyrueshem" }, 400);
      }

      if (callerProfile.role !== "super_admin") {
        return jsonResponse(
          { error: "Vetem super admin mund te fshije perdorues" },
          403
        );
      }

      if (user_id === caller.id) {
        return jsonResponse(
          { error: "Nuk mund te fshini veten tuaj" },
          400
        );
      }

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, role, company_id")
        .eq("id", user_id)
        .maybeSingle();

      if (!targetProfile) {
        return jsonResponse({ error: "Perdoruesi nuk u gjet" }, 404);
      }

      if (!hard_delete) {
        // Soft delete: deactivate + remove auth (original behaviour)
        await supabaseAdmin
          .from("profiles")
          .update({ is_active: false })
          .eq("id", user_id);

        const { error: deleteError } =
          await supabaseAdmin.auth.admin.deleteUser(user_id);

        if (deleteError) {
          return jsonResponse({ error: deleteError.message }, 400);
        }

        return jsonResponse({ success: true }, 200);
      }

      // --- Hard delete path ---
      let tablesCleaned = 0;
      const errors: string[] = [];
      const companyId = targetProfile.company_id;
      let deletedCompanyName = "";

      async function cleanTable(table: string, column: string, value: string) {
        const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
        if (error) {
          errors.push(`${table}: ${error.message}`);
        } else {
          tablesCleaned++;
        }
      }

      if (delete_company && companyId) {
        // Fetch company name for audit log
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("name")
          .eq("id", companyId)
          .maybeSingle();
        deletedCompanyName = company?.name ?? "";

        // Fetch all members of this company (including the target user)
        const { data: members } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("company_id", companyId);
        const memberIds = (members || []).map((m: { id: string }) => m.id);

        // --- Clean all company-scoped tables ---
        // Notifications & push
        for (const mid of memberIds) {
          await cleanTable("notifications", "user_id", mid);
          await cleanTable("push_subscriptions", "user_id", mid);
          await cleanTable("notification_preferences", "user_id", mid);
          await cleanTable("scan_events", "user_id", mid);
          await cleanTable("unsubscribe_tokens", "user_id", mid);
        }

        // HR
        await cleanTable("work_hours_log", "company_id", companyId);
        await cleanTable("work_schedules", "company_id", companyId);
        await cleanTable("attendance_records", "company_id", companyId);
        await cleanTable("employee_leave_balances", "company_id", companyId);
        await cleanTable("leave_requests", "company_id", companyId);
        await cleanTable("hr_notifications", "company_id", companyId);

        // Email
        await cleanTable("email_deliveries", "company_id", companyId);
        await cleanTable("email_campaign_recipients", "company_id", companyId);
        await cleanTable("email_campaigns", "company_id", companyId);

        // Audit & logs
        await cleanTable("audit_logs", "company_id", companyId);
        await cleanTable("stock_alerts", "company_id", companyId);
        await cleanTable("scanner_perf_logs", "company_id", companyId);

        // Partners & flows
        await cleanTable("partner_flow_events", "company_id", companyId);

        // API & webhooks
        await cleanTable("webhook_events", "company_id", companyId);
        await cleanTable("webhooks", "company_id", companyId);
        await cleanTable("company_api_keys", "company_id", companyId);

        // Pallet accounts
        await cleanTable("pallet_account_transactions", "company_id", companyId);
        await cleanTable("pallet_accounts", "company_id", companyId);

        // Held stock
        await cleanTable("held_stock_movements", "company_id", companyId);
        await cleanTable("held_stock", "company_id", companyId);

        // Delivery proofs
        const { data: dns } = await supabaseAdmin
          .from("delivery_notes")
          .select("id")
          .eq("company_id", companyId);
        if (dns) {
          for (const dn of dns) {
            await cleanTable("delivery_proofs", "delivery_note_id", dn.id);
          }
        }

        // Delivery note items
        if (dns) {
          for (const dn of dns) {
            await cleanTable("delivery_note_items", "delivery_note_id", dn.id);
          }
        }

        // Accounting
        await cleanTable("acc_bank_statement_lines", "company_id", companyId);
        await cleanTable("acc_bank_statements", "company_id", companyId);
        await cleanTable("acc_bank_accounts", "company_id", companyId);
        await cleanTable("acc_transactions", "company_id", companyId);
        await cleanTable("acc_journal_entries", "company_id", companyId);
        await cleanTable("acc_scanned_documents", "company_id", companyId);
        await cleanTable("acc_invoice_sequences", "company_id", companyId);
        await cleanTable("acc_client_prices", "company_id", companyId);
        await cleanTable("acc_fixed_assets", "company_id", companyId);
        await cleanTable("acc_expense_categories", "company_id", companyId);
        await cleanTable("acc_imports", "company_id", companyId);
        await cleanTable("acc_stock_movements", "company_id", companyId);
        await cleanTable("acc_delivery_notes", "company_id", companyId);
        await cleanTable("acc_purchases", "company_id", companyId);
        await cleanTable("acc_invoices", "company_id", companyId);
        await cleanTable("acc_contacts", "company_id", companyId);
        await cleanTable("acc_products", "company_id", companyId);
        await cleanTable("acc_product_categories", "company_id", companyId);
        await cleanTable("acc_chart_of_accounts", "company_id", companyId);
        await cleanTable("acc_company_settings", "company_id", companyId);

        // Fleet
        await cleanTable("fleet_scanned_documents", "company_id", companyId);
        await cleanTable("compliance_reminders", "company_id", companyId);
        await cleanTable("vehicle_assignments", "company_id", companyId);
        await cleanTable("vehicle_taxes", "company_id", companyId);
        await cleanTable("vehicle_insurance", "company_id", companyId);
        await cleanTable("vehicle_inspections", "company_id", companyId);
        await cleanTable("vehicles", "company_id", companyId);

        // Driver data
        for (const mid of memberIds) {
          await cleanTable("driver_identity_documents", "driver_id", mid);
          await cleanTable("driver_licenses", "driver_id", mid);
          await cleanTable("driver_medical", "driver_id", mid);
          await cleanTable("driver_qualifications", "driver_id", mid);
          await cleanTable("driver_locations", "driver_id", mid);
          await cleanTable("driver_route_plans", "driver_id", mid);
          await cleanTable("shift_sessions", "driver_id", mid);
          await cleanTable("route_extension_requests", "driver_id", mid);
          await cleanTable("route_traffic_alerts", "driver_id", mid);
          await cleanTable("tracking_prompts", "driver_id", mid);
          await cleanTable("vehicle_assignments", "driver_id", mid);
        }

        // Trailer loads
        await cleanTable("trailer_loads", "company_id", companyId);

        // Depot repairs & stock damage
        await cleanTable("stock_damage_reports", "company_id", companyId);
        await cleanTable("depot_repair_reports", "company_id", companyId);
        await cleanTable("depot_repairs", "company_id", companyId);

        // Stock
        await cleanTable("stock_movements", "company_id", companyId);
        await cleanTable("stock", "company_id", companyId);

        // Delivery notes
        await cleanTable("delivery_notes", "company_id", companyId);

        // Sorting
        await cleanTable("pallet_sorting_batch_items", "company_id", companyId);
        await cleanTable("pallet_sorting_batches", "company_id", companyId);

        // Products & categories
        await cleanTable("category_products", "company_id", companyId);
        await cleanTable("product_categories", "company_id", companyId);

        // Documents
        await cleanTable("document_recipients", "company_id", companyId);
        await cleanTable("documents", "company_id", companyId);

        // Chat
        const { data: rooms } = await supabaseAdmin
          .from("chat_rooms")
          .select("id")
          .eq("company_id", companyId);
        if (rooms) {
          for (const room of rooms) {
            await cleanTable("chat_messages", "room_id", room.id);
            await cleanTable("chat_participants", "room_id", room.id);
          }
        }
        await cleanTable("chat_rooms", "company_id", companyId);

        // Support
        const { data: tickets } = await supabaseAdmin
          .from("support_tickets")
          .select("id")
          .eq("company_id", companyId);
        if (tickets) {
          for (const t of tickets) {
            await cleanTable("support_messages", "ticket_id", t.id);
          }
        }
        await cleanTable("support_tickets", "company_id", companyId);

        // Legal documents
        await cleanTable("legal_documents", "company_id", companyId);

        // Company settings and features
        await cleanTable("company_email_settings", "company_id", companyId);
        await cleanTable("company_features", "company_id", companyId);
        await cleanTable("company_accounting_sync_log", "company_id", companyId);

        // Subscriptions & payments
        await cleanTable("payment_transactions", "company_id", companyId);
        await cleanTable("subscription_checkout_sessions", "company_id", companyId);
        await cleanTable("company_subscriptions", "company_id", companyId);

        // Depots
        await cleanTable("depots", "company_id", companyId);

        // Password reset codes for all members
        for (const mid of memberIds) {
          await cleanTable("password_reset_codes", "user_id", mid);
        }

        // Delete all member profiles and auth users
        for (const mid of memberIds) {
          if (mid === user_id) continue; // delete target last
          await supabaseAdmin.from("profiles").delete().eq("id", mid);
          await supabaseAdmin.auth.admin.deleteUser(mid).catch(() => {});
        }

        // Delete the company
        await cleanTable("companies", "id", companyId);
      } else {
        // Hard delete user only — clean user-specific data
        // FK constraints with ON DELETE CASCADE handle most,
        // but clean explicitly to be thorough
        await cleanTable("notifications", "user_id", user_id);
        await cleanTable("push_subscriptions", "user_id", user_id);
        await cleanTable("notification_preferences", "user_id", user_id);
        await cleanTable("scan_events", "user_id", user_id);
        await cleanTable("unsubscribe_tokens", "user_id", user_id);
        await cleanTable("password_reset_codes", "user_id", user_id);
        await cleanTable("driver_locations", "driver_id", user_id);
        await cleanTable("driver_route_plans", "driver_id", user_id);
        await cleanTable("shift_sessions", "driver_id", user_id);
        await cleanTable("route_extension_requests", "driver_id", user_id);
        await cleanTable("route_traffic_alerts", "driver_id", user_id);
        await cleanTable("tracking_prompts", "driver_id", user_id);
        await cleanTable("driver_identity_documents", "driver_id", user_id);
        await cleanTable("driver_licenses", "driver_id", user_id);
        await cleanTable("driver_medical", "driver_id", user_id);
        await cleanTable("driver_qualifications", "driver_id", user_id);
        await cleanTable("vehicle_assignments", "driver_id", user_id);
      }

      // Delete the target profile
      const { error: profileDelErr } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", user_id);
      if (profileDelErr) {
        errors.push(`profiles: ${profileDelErr.message}`);
      } else {
        tablesCleaned++;
      }

      // Delete from auth.users
      const { error: authDelErr } =
        await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (authDelErr) {
        errors.push(`auth.users: ${authDelErr.message}`);
      }

      // Write audit log
      await supabaseAdmin.from("admin_deletion_log").insert({
        deleted_by: caller.id,
        deleted_user_id: user_id,
        deleted_user_email: targetProfile.email,
        deleted_user_name: targetProfile.full_name,
        deleted_user_role: targetProfile.role,
        deleted_company_id: delete_company ? companyId : null,
        deleted_company_name: delete_company ? deletedCompanyName : null,
        deletion_type: delete_company ? "user_and_company" : "user_only",
        tables_cleaned: tablesCleaned,
        details: errors.length > 0 ? { errors } : {},
      });

      if (errors.length > 0) {
        return jsonResponse({
          success: true,
          partial: true,
          tables_cleaned: tablesCleaned,
          errors,
        }, 207);
      }

      return jsonResponse({ success: true, tables_cleaned: tablesCleaned }, 200);
    }

    return jsonResponse({ error: "Metoda nuk suportohet" }, 405);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Gabim i papritur" },
      500
    );
  }
});
