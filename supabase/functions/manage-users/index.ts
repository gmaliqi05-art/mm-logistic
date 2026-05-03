import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin =
    ALLOWED_ORIGINS.length === 0
      ? "*"
      : ALLOWED_ORIGINS.includes(origin)
        ? origin
        : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
        .select("role, company_id")
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
      } = body;

      if (!email || !password || !full_name || !role) {
        return jsonResponse(
          {
            error: "Fushat e detyrueshme: email, password, full_name, role",
            received: { email: !!email, password: !!password, full_name: !!full_name, role: !!role },
          },
          400
        );
      }

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email !== "string" || !emailRe.test(email) || email.length > 254) {
        return jsonResponse({ error: "Email i pavlefshem" }, 400);
      }
      if (typeof password !== "string" || password.length < 8 || password.length > 128) {
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
      if (worker_category !== undefined && worker_category !== null && (typeof worker_category !== "string" || worker_category.length > 100)) {
        return jsonResponse({ error: "worker_category i pavlefshem" }, 400);
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

      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });

      if (createError) {
        return jsonResponse(
          { error: createError.message, step: "create_auth_user" },
          400
        );
      }

      const profileData: Record<string, unknown> = {
        id: newUser.user.id,
        email,
        full_name,
        role,
        company_id: effectiveCompanyId,
        depot_id: depot_id || null,
        phone: phone || "",
        is_active: true,
      };
      if (worker_category) {
        profileData.worker_category = worker_category;
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert(profileData);

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return jsonResponse(
          { error: profileError.message, step: "create_profile", code: profileError.code },
          400
        );
      }

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
            user_id: newUser.user.id,
            company_id: effectiveCompanyId,
            locale: "sq",
            data: {
              full_name: full_name || email,
              company_name: companyName,
              role_label: roleLabels[role] || role,
              inviter_name: callerProfile.full_name || "Admini",
              setup_url: "",
            },
          }),
        });
      } catch (_e) {
        // best-effort
      }

      return jsonResponse(
        { user: { id: newUser.user.id, email, full_name, role } },
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

      const { user_id } = body;

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

    return jsonResponse({ error: "Metoda nuk suportohet" }, 405);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Gabim i papritur" },
      500
    );
  }
});
