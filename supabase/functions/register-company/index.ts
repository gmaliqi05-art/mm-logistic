import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { requireEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RegisterPayload {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  country?: string;
  city?: string;
  postalCode?: string;
  website?: string;
  vatNumber?: string;
  taxNumber?: string;
  commercialRegister?: string;
  legalForm?: string;
  registrationCourt?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planId?: string;
  planName?: string;
  businessType?: "logistics" | "accounting";
  accountingEnabled?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`register-company:ip=${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const payload: RegisterPayload = await req.json();
    const {
      companyName,
      companyEmail,
      companyPhone,
      companyAddress,
      country,
      city,
      postalCode,
      website,
      vatNumber,
      taxNumber,
      commercialRegister,
      legalForm,
      registrationCourt,
      adminName,
      adminEmail,
      adminPassword,
      planId,
      planName,
    } = payload;
    const businessType = payload.businessType === "accounting" ? "accounting" : "logistics";
    const accountingEnabled = payload.accountingEnabled === true;
    const primaryRole = businessType === "accounting" ? "accountant" : "company_admin";

    if (!companyName || !adminEmail || !adminPassword || (!planId && !planName)) {
      throw new Error("Fushat e detyrueshme mungojne");
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof adminEmail !== "string" || !emailRe.test(adminEmail) || adminEmail.length > 254) {
      throw new Error("Email i pavlefshem");
    }
    if (typeof adminPassword !== "string" || adminPassword.length < 8 || adminPassword.length > 128) {
      throw new Error("Fjalekalimi duhet te kete 8 deri 128 karaktere");
    }
    if (typeof companyName !== "string" || companyName.trim().length === 0 || companyName.length > 200) {
      throw new Error("Emri i kompanise i pavlefshem");
    }
    if (planId) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof planId !== "string" || !uuidRe.test(planId)) {
        throw new Error("Plani i pavlefshem");
      }
    } else if (typeof planName !== "string" || planName.length > 100) {
      throw new Error("Plani i pavlefshem");
    }
    const optionalStringMax = (v: unknown, max: number, label: string) => {
      if (v === undefined || v === null || v === "") return;
      if (typeof v !== "string" || v.length > max) {
        throw new Error(`${label} i pavlefshem`);
      }
    };
    optionalStringMax(adminName, 200, "Emri i adminit");
    optionalStringMax(companyEmail, 254, "Email-i i kompanise");
    optionalStringMax(companyPhone, 50, "Telefoni");
    optionalStringMax(companyAddress, 500, "Adresa");
    optionalStringMax(country, 100, "Shteti");
    optionalStringMax(city, 100, "Qyteti");
    optionalStringMax(postalCode, 20, "Kodi postar");
    optionalStringMax(website, 500, "Faqja web");
    optionalStringMax(vatNumber, 50, "VAT");
    optionalStringMax(taxNumber, 50, "Tax");
    optionalStringMax(commercialRegister, 100, "Regjistri tregtar");
    optionalStringMax(legalForm, 100, "Forma ligjore");
    optionalStringMax(registrationCourt, 200, "Gjykata");

    const supabaseAdmin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    // Check if email was verified via the verification code flow
    const normalizedEmail = adminEmail.trim().toLowerCase();
    const { data: verifiedCode } = await supabaseAdmin
      .from("email_verification_codes")
      .select("id")
      .eq("email", normalizedEmail)
      .not("verified_at", "is", null)
      .gte("expires_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verifiedCode) {
      throw new Error("Emaili nuk eshte verifikuar. Ju lutem verifikoni emailin tuaj perpara regjistrimit.");
    }

    // Check if email already exists in profiles (duplicate guard)
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      throw new Error("Ky email eshte i regjistruar tashme");
    }

    // Check if email already used as company email
    const { data: existingCompany } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingCompany) {
      throw new Error("Ky email eshte i regjistruar tashme");
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });

    if (authError) throw new Error(authError.message);
    const userId = authData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email: adminEmail,
        full_name: adminName,
        role: primaryRole,
        company_id: null,
        phone: companyPhone || "",
        avatar_url: "",
        is_active: true,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    const { data: companyData, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: companyName,
        email: companyEmail || adminEmail,
        phone: companyPhone || "",
        address: companyAddress || "",
        country: country || null,
        city: city || null,
        postal_code: postalCode || null,
        website: website || null,
        vat_number: vatNumber || null,
        tax_number: taxNumber || null,
        commercial_register: commercialRegister || null,
        legal_form: legalForm || null,
        registration_court: registrationCourt || null,
        business_type: accountingEnabled ? "both" : businessType,
        accounting_enabled: accountingEnabled || businessType === "accounting",
        created_by: userId,
      })
      .select("id")
      .single();

    if (companyError) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(companyError.message);
    }

    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({ company_id: companyData.id })
      .eq("id", userId);

    if (updateProfileError) {
      await supabaseAdmin.from("companies").delete().eq("id", companyData.id);
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(updateProfileError.message);
    }

    let planQuery = supabaseAdmin
      .from("subscription_plans")
      .select("id, name, trial_days, price_monthly");
    if (planId) {
      planQuery = planQuery.eq("id", planId);
    } else {
      planQuery = planQuery.eq("name", planName!);
    }
    const { data: planData, error: planError } = await planQuery.maybeSingle();

    if (planError || !planData) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.from("companies").delete().eq("id", companyData.id);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Plani i zgjedhur nuk u gjet");
    }

    const now = new Date();
    const isTrial = planData.trial_days > 0 || Number(planData.price_monthly) === 0;
    const periodEnd = new Date(
      now.getTime() +
        (isTrial ? (planData.trial_days || 30) : 30) * 24 * 60 * 60 * 1000
    );

    const isPaidPlan = !isTrial;

    const { error: subError } = await supabaseAdmin
      .from("company_subscriptions")
      .insert({
        company_id: companyData.id,
        plan_id: planData.id,
        status: isTrial ? "trial" : (isPaidPlan ? "pending_payment" : "active"),
        trial_start: isTrial ? now.toISOString() : null,
        trial_end: isTrial ? periodEnd.toISOString() : null,
        current_period_start: now.toISOString(),
        current_period_end: isPaidPlan ? null : periodEnd.toISOString(),
        payment_method: isPaidPlan ? "stripe" : "free",
      });

    if (subError) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.from("companies").delete().eq("id", companyData.id);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(subError.message);
    }

    try {
      await supabaseAdmin.rpc("seed_company_coa", {
        p_company_id: companyData.id,
        p_country_code: (country ?? "").toUpperCase(),
      });
    } catch (_e) {
      // Chart of accounts seeding is best-effort; do not fail registration.
    }

    // For paid plans, the welcome email is sent by the stripe-webhook after
    // payment is confirmed. Only send it here for free/trial plans.
    if (!isPaidPlan) {
      try {
        const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        await fetch(sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_code: "welcome_company",
            to: adminEmail,
            user_id: userId,
            company_id: companyData.id,
            locale: "sq",
            data: { full_name: adminName || adminEmail, company_name: companyName },
          }),
        });
        if (isTrial) {
          await fetch(sendUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              template_code: "trial_ending_soon",
              to: adminEmail,
              user_id: userId,
              company_id: companyData.id,
              locale: "sq",
              data: { days_remaining: planData.trial_days },
            }),
          });
        }
      } catch (_e) {
        // Email is best-effort; do not fail registration if email sending fails.
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        companyId: companyData.id,
        businessType,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gabim i panjohur";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
