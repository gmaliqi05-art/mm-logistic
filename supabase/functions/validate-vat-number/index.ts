import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireCaller } from "../_shared/requireCaller.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VAT_REGEX: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/, BE: /^BE0\d{9}$/, BG: /^BG\d{9,10}$/, HR: /^HR\d{11}$/,
  CY: /^CY\d{8}[A-Z]$/, CZ: /^CZ\d{8,10}$/, DK: /^DK\d{8}$/, EE: /^EE\d{9}$/,
  FI: /^FI\d{8}$/, FR: /^FR[A-Z0-9]{2}\d{9}$/, DE: /^DE\d{9}$/, EL: /^EL\d{9}$/,
  HU: /^HU\d{8}$/, IE: /^IE\d{7}[A-Z]{1,2}$/, IT: /^IT\d{11}$/, LV: /^LV\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/, LU: /^LU\d{8}$/, MT: /^MT\d{8}$/, NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/, PT: /^PT\d{9}$/, RO: /^RO\d{2,10}$/, SK: /^SK\d{10}$/,
  SI: /^SI\d{8}$/, ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, SE: /^SE\d{12}$/,
};

function normalize(v: string): string {
  return (v || "").toUpperCase().replace(/[\s.-]/g, "");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function checkVies(country: string, number: string): Promise<{ valid: boolean; name?: string; address?: string }> {
  // Inputs are already format-validated against VAT_REGEX (alphanumerics
  // only), so XML injection is not possible today. xmlEscape is cheap
  // defense in depth in case the regex set is ever relaxed.
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns1="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
<soap:Body>
<tns1:checkVat>
<tns1:countryCode>${xmlEscape(country)}</tns1:countryCode>
<tns1:vatNumber>${xmlEscape(number)}</tns1:vatNumber>
</tns1:checkVat>
</soap:Body>
</soap:Envelope>`;

  try {
    const res = await fetch("https://ec.europa.eu/taxation_customs/vies/services/checkVatService", {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", "SOAPAction": "" },
      body: soapBody,
    });
    const text = await res.text();
    const valid = /<valid>true<\/valid>/i.test(text);
    const nameMatch = text.match(/<name>([^<]*)<\/name>/i);
    const addrMatch = text.match(/<address>([^<]*)<\/address>/i);
    return { valid, name: nameMatch?.[1], address: addrMatch?.[1] };
  } catch {
    return { valid: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // VIES is a shared EU resource. Previously this endpoint was wide
  // open: anyone with the anon key could spam it, exfiltrate EU
  // company names+addresses for any VAT number, or get the project
  // IP banned by VIES. Gate on authenticated user, then per-user
  // rate-limit (60/min — generous enough for invoice/partner edit
  // flows, tight enough to block abuse). Both legitimate callers
  // (InvoiceBuilder, Partners) already pass a user session.
  const caller = await requireCaller(req, { corsHeaders });
  if (!caller.ok) return caller.response;

  const rl = await checkRateLimit(`vat-validate:user=${caller.profile.id}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

  try {
    const { vat } = await req.json();
    const norm = normalize(typeof vat === "string" ? vat : "");
    if (norm.length < 4) {
      return new Response(JSON.stringify({ valid: false, reason: "too_short" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const prefix = norm.slice(0, 2);
    const regex = VAT_REGEX[prefix];
    const formatValid = regex ? regex.test(norm) : false;
    if (!formatValid) {
      return new Response(JSON.stringify({ valid: false, format_valid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const country = prefix === "EL" ? "EL" : prefix;
    const number = norm.slice(2);
    const vies = await checkVies(country, number);
    return new Response(JSON.stringify({
      valid: vies.valid, format_valid: true, country, number,
      name: vies.name, address: vies.address,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("validate-vat-number error", e);
    return new Response(JSON.stringify({ valid: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
