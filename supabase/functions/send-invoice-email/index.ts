import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function formatCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(value ?? 0);
  const code = currency || "EUR";
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: code }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const { invoice_id, recipients, locale } = await req.json();
    if (!invoice_id || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "invoice_id and recipients are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: invoice } = await supabase
      .from("acc_invoices")
      .select("id, company_id, invoice_number, total, currency, due_date")
      .eq("id", invoice_id)
      .maybeSingle();

    if (!invoice) {
      return new Response(JSON.stringify({ error: "invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const resp = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_code: "invoice_issued",
        to: recipients,
        company_id: invoice.company_id,
        locale: locale ?? "sq",
        data: {
          invoice_number: invoice.invoice_number,
          total_formatted: formatCurrency(invoice.total, invoice.currency),
          due_date: invoice.due_date ?? "-",
        },
      }),
    });
    const result = await resp.json().catch(() => ({}));

    await supabase
      .from("acc_invoices")
      .update({
        sent_at: new Date().toISOString(),
        email_recipients: recipients,
        status: "sent",
      })
      .eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: resp.ok, result }), {
      status: resp.ok ? 200 : 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
