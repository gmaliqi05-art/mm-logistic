import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const { invoice_id, recipients, subject, body } = await req.json();
    if (!invoice_id || !recipients || !recipients.length) {
      return new Response(JSON.stringify({ error: "invoice_id and recipients are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: invoice } = await supabase
      .from("acc_invoices")
      .select("id, company_id, invoice_number, total, currency")
      .eq("id", invoice_id)
      .maybeSingle();

    if (!invoice) {
      return new Response(JSON.stringify({ error: "invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    let delivered = false;
    if (resendKey) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "invoices@margroup.app",
          to: recipients,
          subject: subject ?? `Invoice ${invoice.invoice_number}`,
          html: body ?? `<p>Please find invoice <strong>${invoice.invoice_number}</strong> attached.</p>`,
        }),
      });
      delivered = r.ok;
    }

    await supabase
      .from("acc_invoices")
      .update({
        sent_at: new Date().toISOString(),
        email_recipients: recipients,
        status: "sent",
      })
      .eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: true, delivered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
