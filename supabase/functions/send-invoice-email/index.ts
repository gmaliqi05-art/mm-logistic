import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, forbidden } from "../_shared/requireCaller.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const caller = await requireCaller(req, { corsHeaders });
  if (!caller.ok) return caller.response;

  // Declared outside the try so the catch block can use them to
  // release the K7 soft-lock if anything between claim and clear
  // throws.
  let invoice_id: string | undefined;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    invoice_id = body.invoice_id as string | undefined;
    const recipients = body.recipients;
    const locale = body.locale;
    if (
      !invoice_id ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "invoice_id and recipients are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch invoice with contact and bank account
    const { data: invoice } = await supabase
      .from("acc_invoices")
      .select(
        "*, contact:acc_contacts(name, email), bank_account:acc_bank_accounts(iban, bic, bank_name)"
      )
      .eq("id", invoice_id)
      .maybeSingle();

    if (!invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      caller.profile.role !== "super_admin" &&
      invoice.company_id !== caller.profile.company_id
    ) {
      return forbidden(corsHeaders, "Cross-tenant access denied");
    }

    // K7: soft-lock to prevent double-send race. Two parallel callers
    // (manual click + cron retry, two tabs, network retry) previously
    // both reached Resend and both UPDATEd acc_invoices afterwards,
    // sending the customer two emails and overwriting sent_at with
    // the second call's timestamp. We atomically claim the lock with
    // a conditional UPDATE: if another caller set email_send_started_at
    // in the last 60 seconds, the WHERE clause matches zero rows.
    const { data: lockRows, error: lockErr } = await supabase
      .from("acc_invoices")
      .update({ email_send_started_at: new Date().toISOString() })
      .eq("id", invoice_id)
      .or("email_send_started_at.is.null,email_send_started_at.lt." +
        new Date(Date.now() - 60_000).toISOString())
      .select("id");
    if (lockErr) {
      return new Response(
        JSON.stringify({ error: `Lock acquire failed: ${lockErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!lockRows || lockRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "send_in_progress", message: "Email-i per kete fature po dergohet tashme. Provo serish pas pak." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch company name
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", invoice.company_id)
      .maybeSingle();

    // Generate PDF via the generate-invoice-pdf function
    let pdfAttachment: { filename: string; content: string } | null = null;

    try {
      const pdfResp = await fetch(
        `${supabaseUrl}/functions/v1/generate-invoice-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ invoice_id }),
        }
      );

      if (pdfResp.ok) {
        const pdfData = await pdfResp.json();
        if (pdfData.pdf_base64) {
          pdfAttachment = {
            filename:
              pdfData.filename ||
              `${invoice.invoice_number || "invoice"}.pdf`,
            content: pdfData.pdf_base64,
          };
        }
      }
    } catch (pdfErr) {
      console.error("PDF generation failed:", pdfErr);
    }

    // Build template data
    const contact = invoice.contact as
      | { name: string; email: string }
      | null;
    const bank = invoice.bank_account as
      | { iban: string; bic: string; bank_name: string }
      | null;

    const templateData: Record<string, unknown> = {
      invoice_number: invoice.invoice_number || "-",
      total_formatted: formatCurrency(invoice.total, invoice.currency),
      amount: formatCurrency(invoice.total, invoice.currency),
      currency: invoice.currency || "EUR",
      due_date: fmtDate(invoice.due_date),
      issue_date: fmtDate(invoice.invoice_date),
      customer_name: contact?.name || "Klient",
      iban: bank?.iban || "-",
      bic: bank?.bic || "",
      bank_name: bank?.bank_name || "",
      company_name: company?.name || "",
    };

    // Load company email settings for template and CC preferences
    const { data: emailSettings } = await supabase
      .from("company_email_settings")
      .select("invoice_template_code, default_locale, cc_admin_on_invoice, cc_email")
      .eq("company_id", invoice.company_id)
      .maybeSingle();

    const templateCode = emailSettings?.invoice_template_code || "invoice_issued";
    const effectiveLocale = locale ?? emailSettings?.default_locale ?? "sq";

    const allRecipients = [...recipients];
    if (emailSettings?.cc_admin_on_invoice && emailSettings?.cc_email) {
      const ccEmail = emailSettings.cc_email.trim();
      if (ccEmail && !allRecipients.includes(ccEmail)) {
        allRecipients.push(ccEmail);
      }
    }

    // Send email via send-email function
    const sendUrl = `${supabaseUrl}/functions/v1/send-email`;
    const emailPayload: Record<string, unknown> = {
      template_code: templateCode,
      to: allRecipients,
      company_id: invoice.company_id,
      locale: effectiveLocale,
      data: templateData,
    };

    if (pdfAttachment) {
      emailPayload.attachments = [pdfAttachment];
    }

    const resp = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await resp.json().catch(() => ({} as Record<string, unknown>));

    // `send-email` returns HTTP 202 even when Resend/SMTP rejects the
    // message, so HTTP status alone cannot be trusted. The body carries
    // `{ ok: boolean }` reflecting actual provider success.
    const trueOk = resp.ok && (result as { ok?: boolean }).ok !== false;
    const pdfOk = !!pdfAttachment;

    if (trueOk) {
      await supabase
        .from("acc_invoices")
        .update({
          sent_at: new Date().toISOString(),
          email_recipients: recipients,
          status: "sent",
          email_send_started_at: null,
        })
        .eq("id", invoice_id);
    } else {
      // Record the attempt + recipients for audit, but keep the draft
      // status so the operator can retry. Also release the soft-lock
      // so the retry can proceed immediately rather than wait 60s.
      await supabase
        .from("acc_invoices")
        .update({
          email_recipients: recipients,
          email_send_started_at: null,
        })
        .eq("id", invoice_id);
    }

    return new Response(
      JSON.stringify({
        ok: trueOk,
        result,
        has_pdf: pdfOk,
      }),
      {
        status: resp.ok ? 200 : 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    // Best-effort lock release on unexpected failure so retries are
    // not blocked for the full 60-second stale-lock window. invoice_id
    // is in scope from the parsed body; if parsing itself failed we
    // never claimed the lock.
    if (invoice_id) {
      await supabase
        .from("acc_invoices")
        .update({ email_send_started_at: null })
        .eq("id", invoice_id)
        .then(() => undefined, () => undefined);
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
