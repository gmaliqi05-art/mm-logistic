// Updated scan-document edge function for 3-party CMR logistics
// Replaces: supabase/functions/scan-document/index.ts
//
// Key changes from previous version:
// 1. Extracted interface now has 3 parties: consignor, carrier, consignee
// 2. AI system prompt instructs detection of all 3 parties
// 3. decideRouting returns our_role + which party to register as partner
// 4. Partner registration logic respects 3-party model:
//    - We carrier_only: register CONSIGNOR (consignee is client-of-client, skipped)

import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.8.0";
import * as XLSX from "npm:xlsx@0.18.5";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScanPayload {
  scanId: string;
  role?: "accountant" | "driver" | "depot" | "company_admin";
  docDirection?: "in" | "out";
}

type OurRole = "consignor" | "carrier" | "consignee" | "custodian_in" | "custodian_out" | "internal_transfer" | "unknown";

interface Routing {
  suggested_kind: "purchase" | "expense" | "investment" | "sale" | "delivery_out" | "delivery_in" | "carrier_service" | "custody_service" | "internal_transfer" | "unknown";
  our_role: OurRole;
  partner_to_register: "consignor" | "consignee" | "goods_owner" | "none";
  matched_contact_id: string | null;
  matched_contact_name: string | null;
  matched_contact_type: string | null;
  match_reason: string;
  confidence: number;
  three_parties: {
    consignor: { name: string; vat: string; matched_company: boolean; matched_contact_id: string | null };
    carrier: { name: string; vat: string; matched_company: boolean; matched_contact_id: string | null };
    consignee: { name: string; vat: string; matched_company: boolean; matched_contact_id: string | null };
  };
  routing_decision: "auto_saved" | "pending_confirmation" | "new_company_required";
  candidates: Array<{ id: string; name: string; score: number; vat_number: string | null; contact_type: string }>;
}

interface ExtractedLine {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
}

interface Extracted {
  document_nature_guess: "purchase" | "sale" | "transport_only" | "custody_in" | "custody_out" | "internal_transfer" | "unknown";

  // 3 CMR parties
  consignor_name: string;
  consignor_vat: string;
  consignor_address: string;
  consignor_city: string;
  consignor_country: string;
  consignor_email: string;
  consignor_phone: string;

  carrier_name: string;
  carrier_vat: string;
  carrier_vehicle_plate: string;

  consignee_name: string;
  consignee_vat: string;
  consignee_address: string;
  consignee_city: string;
  consignee_country: string;
  consignee_email: string;
  consignee_phone: string;

  // Document details
  document_number: string;
  document_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  line_items: ExtractedLine[];
  confidence: number;
  notes: string;
}

function emptyExtracted(): Extracted {
  return {
    document_nature_guess: "unknown",
    consignor_name: "", consignor_vat: "", consignor_address: "",
    consignor_city: "", consignor_country: "", consignor_email: "", consignor_phone: "",
    carrier_name: "", carrier_vat: "", carrier_vehicle_plate: "",
    consignee_name: "", consignee_vat: "", consignee_address: "",
    consignee_city: "", consignee_country: "", consignee_email: "", consignee_phone: "",
    document_number: "", document_date: "", due_date: "",
    currency: "EUR", subtotal: 0, vat_amount: 0, total: 0,
    payment_method: "", line_items: [],
    confidence: 0.5, notes: "",
  };
}

// String similarity (Jaro-Winkler simplified)
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return 1;
  if (sa.includes(sb) || sb.includes(sa)) return 0.85;

  const tokens = (s: string) => s.split(/[\s,.\-/]+/).filter(Boolean);
  const ta = new Set(tokens(sa));
  const tb = new Set(tokens(sb));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

function normalize(s: string): string {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function isOwn(candidateName: string, candidateVat: string, ourName: string, ourVat: string): boolean {
  if (!candidateName && !candidateVat) return false;
  if (ourVat && candidateVat && normalize(ourVat) === normalize(candidateVat)) return true;
  if (!candidateName) return false;
  const cn = normalize(candidateName.split("/")[0]);
  const on = normalize(ourName.split("/")[0]);
  return cn === on || cn.startsWith(on) || on.startsWith(cn);
}

function stripOwn(name: string, ourName: string, ourVat: string): string {
  if (!name) return name;
  // If contains slash, take part that's NOT our name
  if (name.includes("/")) {
    const parts = name.split("/").map(p => p.trim()).filter(Boolean);
    const nonOwn = parts.filter(p => !isOwn(p, "", ourName, ourVat));
    if (nonOwn.length > 0) return nonOwn.join(" / ");
  }
  if (isOwn(name, "", ourName, ourVat)) return "";
  return name;
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function bufferToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

async function extractRawText(buf: Uint8Array, mime: string): Promise<string> {
  try {
    if (mime.includes("wordprocessingml") || mime === "application/msword") {
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value || "";
    }
    if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") {
      const wb = XLSX.read(buf, { type: "array" });
      let text = "";
      for (const name of wb.SheetNames) {
        text += XLSX.utils.sheet_to_csv(wb.Sheets[name]) + "\n";
      }
      return text;
    }
    if (mime.startsWith("text/")) {
      return new TextDecoder().decode(buf);
    }
  } catch (err) {
    console.error("extractRawText failed:", err);
  }
  return "";
}

async function callAi(rawText: string, base64?: string, mime?: string): Promise<Extracted> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    return emptyExtracted();
  }

  const systemPrompt = `You are an expert at extracting structured data from European transport and trade documents (CMR consignment notes, invoices, delivery notes, packing lists, bills of lading).

CRITICAL: European transport documents have THREE distinct parties:
1. CONSIGNOR (Shipper/Sender): the party that hands over the goods. Look for: "From", "Sender", "Shipper", "Mittente", "Absender", "Expéditeur", "Mbitten", "Derguesi"
2. CARRIER (Transporter): the party physically transporting the goods. Look for: "Carrier", "Spediteur", "Vettore", "Transporteur", "Transportues", vehicle plate numbers
3. CONSIGNEE (Receiver): the party receiving the goods. Look for: "To", "Consignee", "Empfänger", "Destinatario", "Destinataire", "Marrësi"

Extract ALL THREE parties even if some are missing. Do NOT confuse them.

Return strict JSON matching this shape (no comments, no markdown):
{
  "document_nature_guess": "purchase|sale|transport_only|custody_in|custody_out|internal_transfer|unknown",
  "consignor_name": "", "consignor_vat": "", "consignor_address": "", "consignor_city": "", "consignor_country": "", "consignor_email": "", "consignor_phone": "",
  "carrier_name": "", "carrier_vat": "", "carrier_vehicle_plate": "",
  "consignee_name": "", "consignee_vat": "", "consignee_address": "", "consignee_city": "", "consignee_country": "", "consignee_email": "", "consignee_phone": "",
  "document_number": "", "document_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD",
  "currency": "EUR", "subtotal": 0, "vat_amount": 0, "total": 0, "payment_method": "",
  "line_items": [{"description":"","quantity":0,"unit":"","unit_price":0,"vat_rate":0,"line_total":0}],
  "confidence": 0.0,
  "notes": ""
}

If a party is missing from the document, leave its fields as empty strings. Never guess.`;

  try {
    const useVision = !!base64 && !!mime && (IMAGE_MIMES.includes(mime) || mime === "application/pdf");
    const userContent: unknown = useVision
      ? [
          { type: mime === "application/pdf" ? "document" : "image", source: { type: "base64", media_type: mime, data: base64 } },
          { type: "text", text: "Extract structured data from this document according to the schema in the system prompt. Return strict JSON only." },
        ]
      : `Document content:\n\n${rawText || "(no text extracted)"}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic API error:", resp.status, errText.slice(0, 300));
      return emptyExtracted();
    }
    const data = await resp.json();
    const text = data?.content?.[0]?.text || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : cleaned;
    return { ...emptyExtracted(), ...JSON.parse(jsonStr) };
  } catch (err) {
    console.error("AI extraction failed:", err);
    return emptyExtracted();
  }
}

async function decideRouting(
  ex: Extracted,
  company: { id: string; name: string; vat_number: string | null },
  contacts: Array<{ id: string; name: string; vat_number: string | null; contact_type: string }>,
  role: string | undefined,
  docDirection: string | undefined
): Promise<Routing> {
  const ourName = company.name || "";
  const ourVat = company.vat_number || "";

  // Clean own company from extracted fields (handles "SAL PAL / Owner Name")
  const consignorName = stripOwn(ex.consignor_name, ourName, ourVat);
  const carrierName = stripOwn(ex.carrier_name, ourName, ourVat);
  const consigneeName = stripOwn(ex.consignee_name, ourName, ourVat);

  // Detect which role(s) we play
  const weAreConsignor =
    (!consignorName && !!ex.consignor_name) ||
    isOwn(ex.consignor_name, ex.consignor_vat, ourName, ourVat) ||
    similarity(ex.consignor_name, ourName) > 0.7;

  const weAreCarrier =
    (!carrierName && !!ex.carrier_name) ||
    isOwn(ex.carrier_name, ex.carrier_vat, ourName, ourVat) ||
    similarity(ex.carrier_name, ourName) > 0.7;

  const weAreConsignee =
    (!consigneeName && !!ex.consignee_name) ||
    isOwn(ex.consignee_name, ex.consignee_vat, ourName, ourVat) ||
    similarity(ex.consignee_name, ourName) > 0.7;

  // Determine our_role
  let our_role: OurRole = "unknown";
  let partner_to_register: "consignor" | "consignee" | "goods_owner" | "none" = "none";
  let suggested_kind: Routing["suggested_kind"] = "unknown";

  if (weAreConsignor && weAreConsignee) {
    // Both depots are ours = internal transfer
    our_role = "internal_transfer";
    suggested_kind = "internal_transfer";
    partner_to_register = "none";
  } else if (weAreConsignor && !weAreConsignee) {
    // We send -> consignee is customer
    our_role = "consignor";
    suggested_kind = "sale";
    partner_to_register = "consignee";
  } else if (!weAreConsignor && weAreConsignee) {
    // We receive -> consignor is supplier
    our_role = "consignee";
    suggested_kind = "purchase";
    partner_to_register = "consignor";
  } else if (weAreCarrier && !weAreConsignor && !weAreConsignee) {
    // We only transport
    // Consignor is our paying client; consignee is client-of-client (skip)
    our_role = "carrier";
    suggested_kind = "carrier_service";
    partner_to_register = "consignor";
  } else {
    // None of the 3 parties match us - external document
    our_role = "unknown";
    suggested_kind = "unknown";
    partner_to_register = "none";
  }

  // Override by explicit driver/depot context: physical movement always wins
  // over accounting nature (sale/purchase) when the user is a driver or the
  // delivery direction is provided. The partner_to_register is preserved
  // from the role detection above.
  if (docDirection === "in" || (role === "depot" && !docDirection)) {
    suggested_kind = "delivery_in";
    if (our_role === "unknown") {
      our_role = "consignee";
      partner_to_register = "consignor";
    }
  } else if (docDirection === "out" || (role === "driver" && !docDirection)) {
    suggested_kind = "delivery_out";
    if (our_role === "unknown") {
      our_role = "consignor";
      partner_to_register = "consignee";
    }
  }

  // Match each party against existing contacts
  const matchContact = (name: string, vat: string): { id: string; name: string; type: string; score: number; vat_number: string | null } | null => {
    if (!name && !vat) return null;
    let best: { id: string; name: string; type: string; score: number; vat_number: string | null } | null = null;
    for (const c of contacts) {
      let score = similarity(name, c.name);
      if (vat && c.vat_number && normalize(vat) === normalize(c.vat_number)) {
        score = Math.max(score, 0.95);
      }
      if (!best || score > best.score) {
        best = { id: c.id, name: c.name, type: c.contact_type, score, vat_number: c.vat_number };
      }
    }
    return best && best.score >= 0.55 ? best : null;
  };

  const consignorMatch = matchContact(ex.consignor_name, ex.consignor_vat);
  const carrierMatch = matchContact(ex.carrier_name, ex.carrier_vat);
  const consigneeMatch = matchContact(ex.consignee_name, ex.consignee_vat);

  // Pick the partner to register based on partner_to_register
  let bestContact: { id: string; name: string; type: string; score: number; vat_number: string | null } | null = null;
  if (partner_to_register === "consignor") bestContact = consignorMatch;
  else if (partner_to_register === "consignee") bestContact = consigneeMatch;

  // Build top candidates list
  const scored = [consignorMatch, carrierMatch, consigneeMatch].filter(Boolean) as Array<{ id: string; name: string; type: string; score: number; vat_number: string | null }>;
  const topCandidates = scored
    .filter(s => s.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Reason
  const reasonParts: string[] = [];
  if (our_role === "consignor") reasonParts.push("Kompania jone eshte derguesi (consignor)");
  else if (our_role === "consignee") reasonParts.push("Kompania jone eshte marresi (consignee)");
  else if (our_role === "carrier") reasonParts.push("Kompania jone eshte vetem spedicion (carrier)");
  else if (our_role === "internal_transfer") reasonParts.push("Transfer i brendshem mes depove tona");
  else reasonParts.push("Rolet nuk u njohen automatikisht");

  if (partner_to_register === "consignor" && ex.consignor_name) {
    reasonParts.push(`Partneri per regjistrim: ${ex.consignor_name} (derguesi)`);
  } else if (partner_to_register === "consignee" && ex.consignee_name) {
    reasonParts.push(`Partneri per regjistrim: ${ex.consignee_name} (marresi)`);
  } else if (partner_to_register === "none") {
    reasonParts.push("Asnje partner nuk regjistrohet (klient i klientit ose transfer i brendshem)");
  }

  let routingDecision: Routing["routing_decision"];
  if (bestContact && bestContact.score >= 0.8) routingDecision = "auto_saved";
  else if (topCandidates.length > 0) routingDecision = "pending_confirmation";
  else if (partner_to_register === "none") routingDecision = "auto_saved";
  else routingDecision = "new_company_required";

  return {
    suggested_kind,
    our_role,
    partner_to_register,
    matched_contact_id: bestContact?.id ?? null,
    matched_contact_name: bestContact?.name ?? null,
    matched_contact_type: bestContact?.type ?? null,
    match_reason: reasonParts.join(". "),
    confidence: Math.min(1, (ex.confidence || 0.5) + (bestContact ? 0.15 : 0) + (our_role !== "unknown" ? 0.1 : 0)),
    three_parties: {
      consignor: {
        name: ex.consignor_name,
        vat: ex.consignor_vat,
        matched_company: weAreConsignor,
        matched_contact_id: consignorMatch?.id ?? null,
      },
      carrier: {
        name: ex.carrier_name,
        vat: ex.carrier_vat,
        matched_company: weAreCarrier,
        matched_contact_id: carrierMatch?.id ?? null,
      },
      consignee: {
        name: ex.consignee_name,
        vat: ex.consignee_vat,
        matched_company: weAreConsignee,
        matched_contact_id: consigneeMatch?.id ?? null,
      },
    },
    routing_decision: routingDecision,
    candidates: topCandidates.map(c => ({
      id: c.id, name: c.name, score: Math.round(c.score * 1000) / 1000,
      vat_number: c.vat_number, contact_type: c.type
    })),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`scan-document:ip=${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const adminSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { scanId, role, docDirection } = (await req.json()) as ScanPayload;
    if (!scanId) {
      return new Response(JSON.stringify({ error: "scanId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get user, company, contacts
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: profile } = await sb
      .from("profiles")
      .select("company_id, role")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: company } = await adminSb
      .from("companies")
      .select("id, name, vat_number")
      .eq("id", profile.company_id)
      .single();

    const { data: contacts } = await adminSb
      .from("acc_contacts")
      .select("id, name, vat_number, contact_type")
      .eq("company_id", profile.company_id)
      .eq("is_active", true);

    const { data: scan, error: scanErr } = await adminSb
      .from("acc_scanned_documents")
      .select("*")
      .eq("id", scanId)
      .maybeSingle();

    if (scanErr || !scan) {
      return new Response(JSON.stringify({ error: "Scan not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (scan.company_id !== profile.company_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    await adminSb
      .from("acc_scanned_documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", scanId);

    const { data: fileData, error: fileErr } = await adminSb.storage
      .from("acc-scans")
      .download(scan.storage_path);
    if (fileErr || !fileData) {
      await adminSb
        .from("acc_scanned_documents")
        .update({ status: "failed", error_message: "File download failed", updated_at: new Date().toISOString() })
        .eq("id", scanId);
      return new Response(JSON.stringify({ error: "File download failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const buf = new Uint8Array(await fileData.arrayBuffer());
    const mime = scan.file_mime || "application/octet-stream";

    const useVision = IMAGE_MIMES.includes(mime) || mime === "application/pdf";
    const base64 = useVision ? bufferToBase64(buf) : undefined;
    const rawText = useVision ? "" : await extractRawText(buf, mime);

    const extracted = await callAi(rawText, base64, mime);
    const routing = await decideRouting(
      extracted,
      company || { id: profile.company_id, name: "", vat_number: null },
      contacts || [],
      role,
      docDirection
    );

    await adminSb
      .from("acc_scanned_documents")
      .update({
        extracted_json: extracted,
        routing_decision: routing.routing_decision,
        raw_ocr_text: rawText || null,
        suggested_contact_name: routing.matched_contact_name,
        match_confidence: routing.confidence,
        status: "parsed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    return new Response(
      JSON.stringify({ success: true, extracted, routing }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("scan-document error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
