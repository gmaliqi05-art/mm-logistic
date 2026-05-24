import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCall, forbidden } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function formatCurrency(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  const n = Number(value ?? 0);
  const code = currency || "EUR";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: code,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function daysBetween(dateStr: string, now: Date): number {
  const d = new Date(dateStr);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Cron-only endpoint (pg_cron via http_post with service-role bearer).
  if (!isServiceRoleCall(req)) return forbidden(corsHeaders, "Service-role required");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Load company email settings for all companies
    const { data: allSettings } = await supabase
      .from("company_email_settings")
      .select("company_id, auto_reminder_enabled, reminder_day_0, reminder_day_7, reminder_day_14, reminder_template_code, default_locale");

    const settingsMap = new Map<string, any>();
    for (const s of (allSettings || []) as any[]) {
      settingsMap.set(s.company_id, s);
    }

    // Find invoices that are sent/overdue with a due_date set
    const { data: invoices, error: fetchErr } = await supabase
      .from("acc_invoices")
      .select(
        "id, company_id, invoice_number, invoice_date, due_date, total, currency, status, language_code, contact:acc_contacts(name, email, preferred_locale), bank_account:acc_bank_accounts(iban, bic, bank_name)"
      )
      .in("status", ["sent", "overdue"])
      .not("due_date", "is", null)
      .lte("due_date", todayStr);

    if (fetchErr || !invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          processed: 0,
          message: fetchErr?.message || "No overdue invoices found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing reminders for these invoices
    const invoiceIds = invoices.map((i: any) => i.id);
    const { data: existingReminders } = await supabase
      .from("acc_invoice_reminders")
      .select("invoice_id, reminder_level")
      .in("invoice_id", invoiceIds);

    const reminderSet = new Set(
      (existingReminders || []).map(
        (r: any) => `${r.invoice_id}:${r.reminder_level}`
      )
    );

    let sentCount = 0;
    const sendUrl = `${supabaseUrl}/functions/v1/send-email`;

    for (const invoice of invoices as any[]) {
      const contact = invoice.contact;
      const bank = invoice.bank_account;

      if (!contact?.email) continue;

      // Check company automation settings
      const companySettings = settingsMap.get(invoice.company_id);
      if (companySettings && companySettings.auto_reminder_enabled === false) continue;

      const daysOverdue = daysBetween(invoice.due_date, now);

      // Determine which reminder level to send
      // Level 0: on due date (0 days overdue)
      // Level 1: 7 days past due
      // Level 2: 14 days past due
      // Check which reminder days are enabled for this company
      const day0Enabled = companySettings?.reminder_day_0 !== false;
      const day7Enabled = companySettings?.reminder_day_7 !== false;
      const day14Enabled = companySettings?.reminder_day_14 !== false;

      let levelToSend: number | null = null;

      if (daysOverdue >= 14 && day14Enabled && !reminderSet.has(`${invoice.id}:2`)) {
        levelToSend = 2;
      } else if (daysOverdue >= 7 && day7Enabled && !reminderSet.has(`${invoice.id}:1`)) {
        levelToSend = 1;
      } else if (daysOverdue >= 0 && day0Enabled && !reminderSet.has(`${invoice.id}:0`)) {
        levelToSend = 0;
      }

      if (levelToSend === null) continue;

      // Update status to overdue if not already
      const statusFlipped = invoice.status !== "overdue" && daysOverdue > 0;
      if (statusFlipped) {
        await supabase
          .from("acc_invoices")
          .update({ status: "overdue" })
          .eq("id", invoice.id);

        // First time an invoice crosses into overdue, post in-app notifications
        // to every active company_admin so the bell icon reflects it without
        // having to wait for the customer-facing email side effect. We only
        // do this on the status flip — not every time the cron re-runs on a
        // still-overdue invoice — to avoid spamming the bell.
        try {
          const { data: admins } = await supabase
            .from("profiles")
            .select("id")
            .eq("company_id", invoice.company_id)
            .eq("role", "company_admin")
            .eq("is_active", true);
          const adminIds = (admins || []).map((a: { id: string }) => a.id);
          if (adminIds.length > 0) {
            const customerName = contact?.name || "Klient";
            const amount = formatCurrency(invoice.total, invoice.currency);
            const rows = adminIds.map((uid: string) => ({
              user_id: uid,
              type: "system",
              title: "Fatura vonohet",
              message: `Fatura ${invoice.invoice_number || ""} (${amount}) per ${customerName} ka kaluar afatin.`,
              reference_id: invoice.id,
              data: {
                titleKey: "notifications.templates.invoiceOverdue.title",
                messageKey: "notifications.templates.invoiceOverdue.body",
                params: {
                  number: String(invoice.invoice_number || ""),
                  amount,
                  customer: String(customerName),
                  days: String(daysOverdue),
                },
              },
            }));
            await supabase.from("notifications").insert(rows);
          }
        } catch {
          // Notification insert is best-effort; don't fail the reminder run
        }
      }

      // Send reminder email
      const templateData: Record<string, unknown> = {
        invoice_number: invoice.invoice_number || "-",
        amount: formatCurrency(invoice.total, invoice.currency),
        total_formatted: formatCurrency(invoice.total, invoice.currency),
        currency: invoice.currency || "EUR",
        due_date: fmtDate(invoice.due_date),
        issue_date: fmtDate(invoice.invoice_date),
        days_overdue: String(daysOverdue),
        customer_name: contact.name || "Klient",
        iban: bank?.iban || "-",
      };

      try {
        const resp = await fetch(sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_code: companySettings?.reminder_template_code || "invoice_overdue",
            to: [contact.email],
            company_id: invoice.company_id,
            // Pick the customer's preferred locale: invoice.language_code
            // wins (the invoice was prepared in that language), else the
            // contact's preferred_locale, else the company default, else sq.
            locale: invoice.language_code
                  || contact.preferred_locale
                  || companySettings?.default_locale
                  || "sq",
            data: templateData,
          }),
        });

        const result = await resp.json().catch(() => ({}));

        // Record the reminder
        await supabase.from("acc_invoice_reminders").insert({
          invoice_id: invoice.id,
          reminder_level: levelToSend,
          sent_at: now.toISOString(),
          email_delivery_id: result?.id || null,
        });

        sentCount++;
      } catch {
        // Skip this invoice on error, continue with others
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: invoices.length,
        reminders_sent: sentCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
