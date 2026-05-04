import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const WANTED = new Set([
  "USD", "CHF", "GBP", "RON", "BGN", "PLN",
  "ALL", "RSD", "BAM", "MKD",
]);

const FALLBACK: Record<string, number> = {
  ALL: 98.5, RSD: 117.0, BAM: 1.955, MKD: 61.5,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
    const xml = await res.text();

    const dateMatch = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/);
    const validFrom = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

    const rateRx = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d\.]+)['"]/g;
    const rates: Record<string, number> = {};
    let m: RegExpExecArray | null;
    while ((m = rateRx.exec(xml))) {
      if (WANTED.has(m[1])) rates[m[1]] = parseFloat(m[2]);
    }

    for (const [ccy, fallback] of Object.entries(FALLBACK)) {
      if (!rates[ccy]) rates[ccy] = fallback;
    }

    const rows = Object.entries(rates).map(([ccy, rate]) => ({
      base_currency: "EUR",
      quote_currency: ccy,
      rate,
      valid_from: validFrom,
      source: FALLBACK[ccy] === rate ? "fallback" : "ECB",
    }));

    const { error } = await admin
      .from("exchange_rates")
      .upsert(rows, { onConflict: "base_currency,quote_currency,valid_from" });
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ success: true, valid_from: validFrom, count: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
