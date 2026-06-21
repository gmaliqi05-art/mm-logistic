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
import { requireEnv } from "../_shared/env.ts";

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
  suggested_kind: "purchase" | "expense" | "investment" | "sale" | "delivery_out" | "delivery_in" | "carrier_service" | "custody_service" | "internal_transfer" | "pending_review" | "unknown";
  our_role: OurRole;
  partner_to_register: "consignor" | "consignee" | "goods_owner" | "none";
  matched_contact_id: string | null;
  matched_contact_name: string | null;
  matched_contact_type: string | null;
  match_reason: string;
  confidence: number;
  ambiguity_flag: boolean;
  direction_confidence: number;
  consignor_is_known_contact: boolean;
  consignee_is_known_contact: boolean;
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

// Byte-sniff the first 12 bytes against the standard file signatures.
// Returns null for unrecognised content so the caller can decide what to
// do (we reject anything not in the allowlist).
function sniffMime(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PDF: %PDF (25 50 44 46)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  // WEBP: RIFF....WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  // HEIC/HEIF: ....ftypheic / ftypheif / ftypmif1 / ftypmsf1
  if (buf.length >= 12 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (["heic", "heix", "heif", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

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

CRITICAL - LETTERHEAD / HEADER DETECTION (read carefully):
On a typical European delivery note (Lieferschein), the LAYOUT is:
- TOP-RIGHT or TOP area: The company LOGO, company name in large/bold font, full address block with phone/fax/email/IBAN/website. This is the CONSIGNOR (document issuer = the sender of goods).
- LEFT or CENTER-LEFT, below the logo area: A postal address block (often in a window envelope format) with a company name and address. This is the CONSIGNEE (receiver of goods). It may be preceded by "An:", "Lieferschein an:", or have no label at all.

IMPORTANT: Do NOT confuse the postal recipient address (left side, consignee) with the header company (top/right side, consignor). The company that has a LOGO, website URL, IBAN, bank details, or "Geschäftsführer" line is the document ISSUER = CONSIGNOR. The company that appears in the simple address block without these details is the CONSIGNEE.

If a company name appears BOTH in the logo/header AND as the "Warenempfänger" / recipient signature area at the bottom, it is still the CONSIGNEE at the bottom (confirming receipt).

GERMAN DOCUMENT KEYWORDS:
- "Lieferschein" = Delivery Note (the header/logo company is the sender)
- "Lieferschein an:" / "An:" / "Warenempfänger:" = the CONSIGNEE (receiver), NOT the sender
- "Auftraggeber" = the ordering party (usually the CONSIGNOR or goods owner)
- "Empfänger" / "Warenempfänger" = CONSIGNEE (receiver)
- "Absender" = CONSIGNOR (sender)
- "Anlieferung erfolgt durch:" / "Im Auftrag von:" / "Spedition:" / "Frachtführer:" = CARRIER (transporter)
- "KFZ-Kennzeichen" / "Anhänger" = vehicle/trailer plate = belongs to CARRIER
- "Besteller" / "Bestellnr." = ordering party reference
- "Warenübernahme unter Vorbehalt" / "Firmenstempel" = receipt confirmation area (the company signing here is the CONSIGNEE confirming receipt)

CARRIER DETECTION HINTS:
Company names containing "TRANS", "CARGO", "SPEDITION", "LOGISTIK", "TRANSPORT", "FREIGHT" are likely carriers unless they appear in the document header/letterhead.

CRITICAL - COMPANY NAME COMPLETENESS:
Always extract the FULL legal company name including its legal form suffix. European company names often end with legal form abbreviations that are part of the official name:
- Polish: "SP Z O O" (= Sp. z o.o.), "SPÓŁKA KOMANDYTOWA" (= S.K.), "SPÓŁKA AKCYJNA" (= S.A.)
- German: "GmbH", "GmbH & Co. KG", "AG", "e.K.", "OHG", "KG"
- French: "SARL", "SAS", "SA", "EURL"
- Italian: "S.R.L.", "S.P.A."
- Albanian: "SHPK", "SH.A."
If a company is "TRANS CARGO GROUP SP Z O O SPÓŁKA KOMANDYTOWA", that is ONE company name, not two separate companies. Never split a company name at its legal form suffix.

GOODS FLOW DIRECTION HINTS:
Look for keywords that indicate the physical direction of goods movement:
- OUTBOUND (goods leaving): "Warenausgang", "Ausgang", "Auslieferung", "Versand", "Abgang", "Ausgangslager", "Dispatch", "Shipment out"
- INBOUND (goods arriving): "Wareneingang", "Eingang", "Anlieferung", "Empfang", "Eingangslager", "Receiving", "Goods in"
- PICKUP (goods collected from): "Abholung", "Abgeholt", "Pick-up", "Collected from", "Terheqje"
- DELIVERY (goods delivered to): "Zustellung", "Zugestellt", "Delivered to", "Geliefert an", "Dorzim"
Set document_nature_guess accordingly: if outbound from consignor perspective = "sale", if inbound to consignee = "purchase".

CRITICAL for document_number: Extract the delivery note / consignment note number as the primary document identifier. Look for these labels in ANY language:
- German: "Lieferschein Nr.", "LS Nr.", "LS-Nr.", "Lieferschein-Nr."
- English: "Delivery Note No.", "DN No.", "Consignment No.", "Packing Slip No."
- Albanian: "Nr. Fletedergeses", "Fletedergesa Nr."
- French: "Bon de livraison No.", "BL No."
- Italian: "DDT Nr.", "Bolla No."
- Also look for: "Bestellnr.", "Bestell-Nr." (order number as fallback)
The document_number should be the NUMBER ONLY (e.g. "12658"), not the label. Prioritize the Lieferschein/delivery note number over invoice or order numbers.

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

  // Match each party against existing contacts (needed by role detection)
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
    // None of the 3 parties match us directly.
    // Scenarios:
    //   A) We received goods from partner's client -> brought to our depot (incoming)
    //   B) We took goods from our depot -> delivered to partner's client (outgoing)
    //   C) We picked up from partner's client -> delivered to our partner (transport)
    //   D) Document is ambiguous -- direction unclear
    const consignorIsKnown = consignorMatch && consignorMatch.score >= 0.55;
    const consigneeIsKnown = consigneeMatch && consigneeMatch.score >= 0.55;

    our_role = "unknown";

    if (consignorIsKnown && consigneeIsKnown) {
      // Both parties are known contacts -- ambiguous: could be in either direction
      partner_to_register = "consignor";
      suggested_kind = "pending_review";
    } else if (consignorIsKnown) {
      partner_to_register = "consignor";
      suggested_kind = "pending_review";
    } else if (consigneeIsKnown) {
      partner_to_register = "consignee";
      suggested_kind = "pending_review";
    } else if (ex.consignor_name) {
      // Neither party known: register the document issuer (consignor)
      partner_to_register = "consignor";
      suggested_kind = "pending_review";
    } else {
      suggested_kind = "unknown";
      partner_to_register = "none";
    }
  }

  // Track whether the direction is ambiguous (our company not on document)
  let ambiguity_flag = our_role === "unknown" && suggested_kind === "pending_review";
  let direction_confidence = our_role !== "unknown" ? 0.9 : 0.3;

  // Override by explicit driver/depot context: physical movement always wins
  // over accounting nature (sale/purchase) when the user is a driver or the
  // delivery direction is provided. The partner_to_register is preserved
  // from the role detection above.
  if (docDirection === "in") {
    suggested_kind = "delivery_in";
    ambiguity_flag = false;
    direction_confidence = 1.0;
    if (our_role === "unknown") {
      our_role = "consignee";
      if (partner_to_register === "none" && ex.consignor_name) {
        partner_to_register = "consignor";
      }
    }
  } else if (docDirection === "out") {
    suggested_kind = "delivery_out";
    ambiguity_flag = false;
    direction_confidence = 1.0;
    if (our_role === "unknown") {
      our_role = "consignor";
      if (partner_to_register === "none" && ex.consignee_name) {
        partner_to_register = "consignee";
      }
    }
  } else if (role === "depot" && !docDirection && ambiguity_flag) {
    // Depot without explicit direction: likely incoming but flag for review
    suggested_kind = "pending_review";
    direction_confidence = 0.5;
  } else if (role === "driver" && !docDirection && ambiguity_flag) {
    // Driver without explicit direction: could be pickup or delivery
    suggested_kind = "pending_review";
    direction_confidence = 0.4;
  }

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
  else {
    if (ambiguity_flag) {
      reasonParts.push("Kompania jone nuk gjendet ne dokument — drejtimi i mallit eshte i paqarte. Nevojitet konfirmim manual");
    } else if (partner_to_register !== "none") {
      reasonParts.push("Kompania jone nuk gjendet ne dokument — dokumenti eshte mes paleve te treta. Pala A (derguesi) regjistrohet si partner/klient");
    } else {
      reasonParts.push("Rolet nuk u njohen automatikisht");
    }
  }

  if (partner_to_register === "consignor" && ex.consignor_name) {
    reasonParts.push(`Partneri per regjistrim: ${ex.consignor_name} (derguesi)`);
  } else if (partner_to_register === "consignee" && ex.consignee_name) {
    reasonParts.push(`Partneri per regjistrim: ${ex.consignee_name} (marresi)`);
  } else if (partner_to_register === "none") {
    reasonParts.push("Asnje partner nuk regjistrohet (klient i klientit ose transfer i brendshem)");
  }

  let routingDecision: Routing["routing_decision"];
  if (ambiguity_flag) routingDecision = "pending_confirmation";
  else if (bestContact && bestContact.score >= 0.8) routingDecision = "auto_saved";
  else if (topCandidates.length > 0) routingDecision = "pending_confirmation";
  else if (partner_to_register === "none") routingDecision = "auto_saved";
  else routingDecision = "new_company_required";

  const consignorIsKnownContact = !!(consignorMatch && consignorMatch.score >= 0.55);
  const consigneeIsKnownContact = !!(consigneeMatch && consigneeMatch.score >= 0.55);

  return {
    suggested_kind,
    our_role,
    partner_to_register,
    matched_contact_id: bestContact?.id ?? null,
    matched_contact_name: bestContact?.name ?? null,
    matched_contact_type: bestContact?.type ?? null,
    match_reason: reasonParts.join(". "),
    confidence: Math.min(1, (ex.confidence || 0.5) + (bestContact ? 0.15 : 0) + (our_role !== "unknown" ? 0.1 : 0)),
    ambiguity_flag,
    direction_confidence,
    consignor_is_known_contact: consignorIsKnownContact,
    consignee_is_known_contact: consigneeIsKnownContact,
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
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: auth } } }
    );
    const adminSb = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
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

    // Per-caller rate limit on top of the IP gate above: a single IP behind
    // NAT or a shared egress can otherwise burn another tenant's budget.
    const callerRl = await checkRateLimit(
      `scan-document:co=${profile.company_id}:u=${userData.user.id}`,
      10,
      60_000,
    );
    if (!callerRl.allowed) return rateLimitResponse(callerRl, corsHeaders);

    // The caller-supplied `role` only affects routing suggestions in the
    // returned response, but we still pin it to the profile so a driver
    // can't request the company_admin routing path.
    let effectiveRole: ScanPayload["role"] = role;
    if (profile.role === "driver") effectiveRole = "driver";
    else if (profile.role === "depot_worker") effectiveRole = "depot";
    else if (!effectiveRole) effectiveRole = "company_admin";

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

    // Server-side validation of MIME + size. The client-written
    // scan.file_mime is advisory only — we trust the byte sniff and a
    // strict allowlist. Anthropic vision pricing makes large blobs
    // expensive, so cap at 20 MB.
    const MAX_BYTES = 20 * 1024 * 1024;
    if (buf.byteLength > MAX_BYTES) {
      await adminSb
        .from("acc_scanned_documents")
        .update({ status: "failed", error_message: "File too large (max 20 MB)", updated_at: new Date().toISOString() })
        .eq("id", scanId);
      return new Response(JSON.stringify({ error: "File too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sniffedMime = sniffMime(buf);
    const claimedMime = (scan.file_mime as string | null) || "application/octet-stream";
    const mime = sniffedMime ?? claimedMime;

    const ALLOWED_MIMES = [
      "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
      "application/pdf",
    ];
    if (!ALLOWED_MIMES.includes(mime)) {
      await adminSb
        .from("acc_scanned_documents")
        .update({ status: "failed", error_message: `Unsupported file type: ${mime}`, updated_at: new Date().toISOString() })
        .eq("id", scanId);
      return new Response(JSON.stringify({ error: `Unsupported file type: ${mime}` }), {
        status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const useVision = IMAGE_MIMES.includes(mime) || mime === "application/pdf";
    const base64 = useVision ? bufferToBase64(buf) : undefined;
    const rawText = useVision ? "" : await extractRawText(buf, mime);

    const extracted = await callAi(rawText, base64, mime);
    const routing = await decideRouting(
      extracted,
      company || { id: profile.company_id, name: "", vat_number: null },
      contacts || [],
      effectiveRole,
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
