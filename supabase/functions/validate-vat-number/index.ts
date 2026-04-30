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

async function checkVies(country: string, number: string): Promise<{ valid: boolean; name?: string; address?: string }> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns1="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
<soap:Body>
<tns1:checkVat>
<tns1:countryCode>${country}</tns1:countryCode>
<tns1:vatNumber>${number}</tns1:vatNumber>
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
  try {
    const { vat } = await req.json();
    const norm = normalize(vat);
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
    return new Response(JSON.stringify({ valid: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
