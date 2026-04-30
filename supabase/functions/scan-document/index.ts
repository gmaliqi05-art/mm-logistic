import { createClient } from "npm:@supabase/supabase-js@2";
import mammoth from "npm:mammoth@1.8.0";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScanPayload {
  scanId: string;
  role?: "accountant" | "driver" | "depot" | "company_admin";
}

interface Routing {
  suggested_kind: "purchase" | "expense" | "investment" | "sale" | "delivery_out" | "delivery_in" | "unknown";
  matched_contact_id: string | null;
  matched_contact_name: string | null;
  matched_contact_type: string | null;
  match_reason: string;
  confidence: number;
  company_match: boolean;
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
  document_nature_guess: "purchase" | "expense" | "investment" | "sale" | "unknown";
  supplier_name: string;
  supplier_vat: string;
  supplier_tax: string;
  supplier_iban: string;
  supplier_bic: string;
  supplier_email: string;
  supplier_phone: string;
  supplier_address: string;
  supplier_city: string;
  supplier_postal_code: string;
  supplier_country: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
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
    supplier_name: "",
    supplier_vat: "",
    supplier_tax: "",
    supplier_iban: "",
    supplier_bic: "",
    supplier_email: "",
    supplier_phone: "",
    supplier_address: "",
    supplier_city: "",
    supplier_postal_code: "",
    supplier_country: "",
    customer_name: "",
    invoice_number: "",
    invoice_date: "",
    due_date: "",
    currency: "EUR",
    subtotal: 0,
    vat_amount: 0,
    total: 0,
    payment_method: "",
    line_items: [],
    confidence: 0,
    notes: "",
  };
}

function regexExtract(text: string): Extracted {
  const result = emptyExtracted();
  if (!text) return result;

  const totalMatch = text.match(/(?:Gesamt|Total|Summe|Betrag)[^\d]{0,30}([\d.,]+)/i);
  if (totalMatch) result.total = parseFloat(totalMatch[1].replace(/\./g, "").replace(",", "."));

  const netMatch = text.match(/(?:Netto|Zwischensumme|Subtotal)[^\d]{0,30}([\d.,]+)/i);
  if (netMatch) result.subtotal = parseFloat(netMatch[1].replace(/\./g, "").replace(",", "."));

  const vatMatch = text.match(/(?:USt|MwSt|VAT)[^\d]{0,30}([\d.,]+)/i);
  if (vatMatch) result.vat_amount = parseFloat(vatMatch[1].replace(/\./g, "").replace(",", "."));

  const invMatch = text.match(/(?:Rechnung|Invoice|Beleg|Nr\.?)[ \-#:]*([A-Z0-9\-\/]{3,20})/i);
  if (invMatch) result.invoice_number = invMatch[1];

  const dateMatch = text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
  if (dateMatch) {
    const parts = dateMatch[1].split(/[./-]/);
    if (parts.length === 3) {
      const y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
      result.invoice_date = `${y}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }

  const ibanMatch = text.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/);
  if (ibanMatch) result.supplier_iban = ibanMatch[1];

  const vatIdMatch = text.match(/\b(DE\d{9}|[A-Z]{2}\d{8,12})\b/);
  if (vatIdMatch) result.supplier_vat = vatIdMatch[1];

  result.confidence = result.total > 0 ? 0.4 : 0.1;
  result.document_nature_guess = "expense";
  result.notes = "Fallback regex extraction (no AI key)";
  return result;
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function extractTextFromBuffer(buf: Uint8Array, mime: string, filename: string): Promise<string> {
  const name = (filename || "").toLowerCase();
  try {
    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) {
      const res = await mammoth.extractRawText({ buffer: buf });
      return res.value || "";
    }
    if (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel" ||
      name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")
    ) {
      const wb = XLSX.read(buf, { type: "array" });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        parts.push(`### Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`);
      }
      return parts.join("\n\n");
    }
    if (mime === "text/plain" || mime === "text/csv" || name.endsWith(".txt") || name.endsWith(".csv")) {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }
  } catch (err) {
    console.error("text extraction failed", err);
  }
  return "";
}

async function aiExtractFromText(text: string): Promise<Extracted> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("NO_AI_KEY");
  const prompt = buildPrompt() + `\n\nDocument text content:\n\n${text.slice(0, 60000)}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error: ${resp.status} ${errText.slice(0, 200)}`);
  }
  const json = await resp.json();
  const content = json.content?.[0]?.text ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response not JSON");
  return { ...emptyExtracted(), ...JSON.parse(match[0]) };
}

function buildPrompt(): string {
  return `You extract structured data from business documents (German and English). Reply with ONLY valid JSON matching this TypeScript type exactly (no prose, no markdown):

{
  "document_nature_guess": "purchase" | "expense" | "investment" | "sale" | "unknown",
  "supplier_name": string,
  "supplier_vat": string,
  "supplier_tax": string,
  "supplier_iban": string,
  "supplier_bic": string,
  "supplier_email": string,
  "supplier_phone": string,
  "supplier_address": string,
  "supplier_city": string,
  "supplier_postal_code": string,
  "supplier_country": string,
  "customer_name": string,
  "invoice_number": string,
  "invoice_date": "YYYY-MM-DD" | "",
  "due_date": "YYYY-MM-DD" | "",
  "currency": "EUR" | "CHF" | "USD",
  "subtotal": number,
  "vat_amount": number,
  "total": number,
  "payment_method": string,
  "line_items": [{"description": string, "quantity": number, "unit": string, "unit_price": number, "vat_rate": number, "line_total": number}],
  "confidence": number between 0 and 1,
  "notes": string
}

Guidance for document_nature_guess:
- "purchase": supplier invoice for goods/inventory
- "expense": receipts, services, utilities, small operational costs
- "investment": fixed asset purchase (machines, vehicles, IT hardware over 800 EUR net, furniture, software)
- "sale": outgoing sales invoice issued by us to a customer
- "unknown": cannot determine

Numbers must be plain numbers (no currency symbol, no thousands separator). Use dot for decimals. Dates must be ISO.`;
}

async function aiExtract(base64: string, mime: string): Promise<Extracted> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("NO_AI_KEY");

  const prompt = buildPrompt();

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: mime === "application/pdf" ? "document" : "image",
              source: { type: "base64", media_type: mime, data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const json = await resp.json();
  const content = json.content?.[0]?.text ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response not JSON");

  const parsed = JSON.parse(match[0]);
  return { ...emptyExtracted(), ...parsed };
}

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9äöüßàâçéèêëîïôûùüÿñ]+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const tokensA = new Set(na.split(/\s+/).filter((t) => t.length > 2));
  const tokensB = new Set(nb.split(/\s+/).filter((t) => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  return (2 * shared) / (tokensA.size + tokensB.size);
}

async function computeRouting(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  ex: Extracted,
  role?: ScanPayload["role"]
): Promise<Routing> {
  const { data: company } = await supabase
    .from("companies")
    .select("name, vat_number, tax_number")
    .eq("id", companyId)
    .maybeSingle();

  const { data: contacts } = await supabase
    .from("acc_contacts")
    .select("id, name, vat_number, contact_type")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const supplierName = ex.supplier_name || "";
  const customerName = ex.customer_name || "";
  const vat = ex.supplier_vat || "";

  const ourName = company?.name || "";
  const ourVat = (company as any)?.vat_number || "";

  const supplierMatchesUs = similarity(supplierName, ourName) > 0.7 || (ourVat && vat && ourVat === vat);
  const customerMatchesUs = similarity(customerName, ourName) > 0.7;

  const scored: Array<{ id: string; name: string; type: string; score: number; vat_number: string | null }> = [];
  for (const c of (contacts as Array<{ id: string; name: string; vat_number: string | null; contact_type: string }>) || []) {
    let score = similarity(supplierName, c.name);
    score = Math.max(score, similarity(customerName, c.name));
    if (vat && c.vat_number && vat === c.vat_number) score = Math.max(score, 0.95);
    scored.push({ id: c.id, name: c.name, type: c.contact_type, score, vat_number: c.vat_number });
  }
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.filter((s) => s.score >= 0.45).slice(0, 3);
  let bestContact = scored[0] && scored[0].score >= 0.55 ? scored[0] : null;
  const bestScore = bestContact?.score ?? 0;

  let suggested: Routing["suggested_kind"] = ex.document_nature_guess || "unknown";

  if (role === "driver") suggested = "delivery_out";
  else if (role === "depot") suggested = "delivery_in";
  else if (customerMatchesUs && !supplierMatchesUs) {
    if (suggested === "sale" || suggested === "unknown") suggested = "purchase";
  } else if (supplierMatchesUs && !customerMatchesUs) {
    if (suggested === "purchase" || suggested === "unknown") suggested = "sale";
  }

  const reasonParts: string[] = [];
  if (bestContact) reasonParts.push(`Kontakti "${bestContact.name}" u njoh nga ${vat && bestContact.score >= 0.95 ? "nr. TVSH" : "emri"}`);
  if (customerMatchesUs) reasonParts.push("Emri ne pozicionin e klientit perputhet me kompanine tone (dokument hyres)");
  if (supplierMatchesUs) reasonParts.push("Emri ne pozicionin e furnitorit perputhet me kompanine tone (dokument dales)");
  if (role === "driver") reasonParts.push("Roli shofer — supozohet fletedalje");
  if (role === "depot") reasonParts.push("Roli depo — supozohet fletepranim");
  if (reasonParts.length === 0) reasonParts.push("U klasifikua ne baze te permbajtjes se dokumentit");

  let routingDecision: Routing["routing_decision"];
  if (bestContact && bestScore >= 0.8) routingDecision = "auto_saved";
  else if (topCandidates.length > 0) routingDecision = "pending_confirmation";
  else routingDecision = "new_company_required";

  return {
    suggested_kind: suggested,
    matched_contact_id: bestContact?.id ?? null,
    matched_contact_name: bestContact?.name ?? null,
    matched_contact_type: bestContact?.type ?? null,
    match_reason: reasonParts.join(". "),
    confidence: Math.min(1, (ex.confidence || 0.5) + (bestContact ? 0.15 : 0) + (customerMatchesUs || supplierMatchesUs ? 0.1 : 0)),
    company_match: customerMatchesUs || supplierMatchesUs,
    routing_decision: routingDecision,
    candidates: topCandidates.map((c) => ({ id: c.id, name: c.name, score: Math.round(c.score * 1000) / 1000, vat_number: c.vat_number, contact_type: c.type })),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { scanId, role }: ScanPayload = await req.json();
    if (!scanId) throw new Error("scanId required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: scan, error: scanErr } = await supabase
      .from("acc_scanned_documents")
      .select("*")
      .eq("id", scanId)
      .maybeSingle();

    if (scanErr || !scan) throw new Error("Scan not found");

    const { data: fileData, error: fileErr } = await supabase.storage
      .from("acc-scans")
      .download(scan.storage_path);
    if (fileErr || !fileData) throw new Error("File download failed");

    const buf = new Uint8Array(await fileData.arrayBuffer());
    const mime = scan.file_mime || "application/octet-stream";
    const filename: string = scan.storage_path || "";
    let extracted: Extracted;
    let rawText = "";

    try {
      if (IMAGE_MIMES.includes(mime) || mime === "application/pdf") {
        let b64 = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < buf.length; i += chunkSize) {
          b64 += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(b64);
        extracted = await aiExtract(base64, mime);
      } else {
        rawText = await extractTextFromBuffer(buf, mime, filename);
        if (!rawText.trim()) throw new Error("Nuk u lexua dot permbajtja e dokumentit (formati nuk mbeshtetet)");
        extracted = await aiExtractFromText(rawText);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NO_AI_KEY")) {
        if (!rawText) {
          try { rawText = new TextDecoder("utf-8", { fatal: false }).decode(buf); } catch { rawText = ""; }
        }
        extracted = regexExtract(rawText);
      } else {
        throw err;
      }
    }

    const routing = await computeRouting(supabase, scan.company_id, extracted, role);

    const needsNewCompany = routing.routing_decision === "new_company_required";
    const counterpartyName = extracted.supplier_name || extracted.customer_name || "";

    await supabase
      .from("acc_scanned_documents")
      .update({
        status: "parsed",
        detected_type: routing.suggested_kind !== "unknown" ? routing.suggested_kind : extracted.document_nature_guess,
        extracted_json: { ...extracted, _routing: routing },
        raw_ocr_text: rawText.slice(0, 8000),
        match_confidence: routing.confidence,
        routing_decision: routing.routing_decision,
        suggested_contact_name: needsNewCompany ? counterpartyName : "",
        suggested_contact_vat: needsNewCompany ? extracted.supplier_vat || "" : "",
        suggested_contact_tax: needsNewCompany ? extracted.supplier_tax || "" : "",
        suggested_contact_email: needsNewCompany ? extracted.supplier_email || "" : "",
        suggested_contact_phone: needsNewCompany ? extracted.supplier_phone || "" : "",
        suggested_contact_address: needsNewCompany ? extracted.supplier_address || "" : "",
        suggested_contact_city: needsNewCompany ? extracted.supplier_city || "" : "",
        suggested_contact_postal_code: needsNewCompany ? extracted.supplier_postal_code || "" : "",
        suggested_contact_country: needsNewCompany ? extracted.supplier_country || "" : "",
        suggested_contact_iban: needsNewCompany ? extracted.supplier_iban || "" : "",
        suggested_contact_bic: needsNewCompany ? extracted.supplier_bic || "" : "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    return new Response(
      JSON.stringify({ success: true, extracted, routing }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      const { scanId } = (await req.clone().json().catch(() => ({}))) as ScanPayload;
      if (scanId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase
          .from("acc_scanned_documents")
          .update({ status: "failed", error_message: message })
          .eq("id", scanId);
      }
    } catch {
      // ignore
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
