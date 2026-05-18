import { createClient } from "npm:@supabase/supabase-js@2";

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Find invoices that are sent/overdue with a due_date set
    const { data: invoices, error: fetchErr } = await supabase
      .from("acc_invoices")
      .select(
        "id, company_id, invoice_number, invoice_date, due_date, total, currency, status, contact:acc_contacts(name, email), bank_account:acc_bank_accounts(iban, bic, bank_name)"
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

      const daysOverdue = daysBetween(invoice.due_date, now);

      // Determine which reminder level to send
      // Level 0: on due date (0 days overdue)
      // Level 1: 7 days past due
      // Level 2: 14 days past due
      let levelToSend: number | null = null;

      if (daysOverdue >= 14 && !reminderSet.has(`${invoice.id}:2`)) {
        levelToSend = 2;
      } else if (
        daysOverdue >= 7 &&
        !reminderSet.has(`${invoice.id}:1`)
      ) {
        levelToSend = 1;
      } else if (
        daysOverdue >= 0 &&
        !reminderSet.has(`${invoice.id}:0`)
      ) {
        levelToSend = 0;
      }

      if (levelToSend === null) continue;

      // Update status to overdue if not already
      if (invoice.status !== "overdue" && daysOverdue > 0) {
        await supabase
          .from("acc_invoices")
          .update({ status: "overdue" })
          .eq("id", invoice.id);
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
            template_code: "invoice_overdue",
            to: [contact.email],
            company_id: invoice.company_id,
            locale: "sq",
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
