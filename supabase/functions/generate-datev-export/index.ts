import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  company_id: string;
  date_from: string;
  date_to: string;
  exports: Array<"buchungen" | "debitoren" | "kreditoren" | "sachkonten">;
  bank_account_id?: string;
}

// Encode to Windows-1252 (ISO-8859-15 superset for Latin chars). Non-mappable → '?'.
function encodeWin1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c < 256 ? c : 0x3f;
  }
  return out;
}

function csvField(v: unknown, numeric = false): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (numeric) return s.replace(".", ",");
  return `"${s.replace(/"/g, '""')}"`;
}

function formatDateDDMM(date: string): string {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return dd + mm;
}

function buildBuchungenHeader(cfg: {
  beraterNr: string;
  mandantenNr: string;
  wjBeginn: string;
  dateFrom: string;
  dateTo: string;
}): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const df = cfg.dateFrom.replace(/-/g, "");
  const dt = cfg.dateTo.replace(/-/g, "");
  const wj = cfg.wjBeginn.replace(/-/g, "");
  // EXTF 700 Buchungsstapel header — 30 fields
  const h = [
    `"EXTF"`, `700`, `21`, `"Buchungsstapel"`, `7`,
    today + "000000000", ``, `"RE"`, ``, ``,
    csvField(cfg.beraterNr), csvField(cfg.mandantenNr), wj,
    `4`, df, dt, `""`, `""`, `""`, `0`,
    `0`, `"EUR"`, ``, ``, ``, ``, ``, ``, ``, ``,
  ].join(";");
  const cols = [
    "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs",
    "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto",
    "Buchungstext", "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank",
    "Sachverhalt", "Zinssperre", "Beleglink",
  ].map((s) => `"${s}"`).join(";");
  return h + "\r\n" + cols + "\r\n";
}

function datevDebitorAccount(contactIdx: number): string {
  return String(10000 + contactIdx);
}
function datevKreditorAccount(contactIdx: number): string {
  return String(70000 + contactIdx);
}

function revenueAccountForRate(rate: number): string {
  if (rate === 19) return "8400";
  if (rate === 7) return "8300";
  return "8100";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`generate-datev-export:ip=${ip}`, 5, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const payload: Payload = await req.json();
    const { company_id, date_from, date_to, exports: exportTypes, bank_account_id } = payload;
    if (!company_id || !date_from || !date_to || !exportTypes?.length) {
      throw new Error("company_id, date_from, date_to, exports are required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: company } = await supabase
      .from("companies").select("*").eq("id", company_id).maybeSingle();
    if (!company) throw new Error("Company not found");

    const datevCfg = (company.datev_config ?? {}) as {
      berater_nr?: string; mandanten_nr?: string; wj_beginn?: string;
    };
    const cfg = {
      beraterNr: datevCfg.berater_nr ?? "0",
      mandantenNr: datevCfg.mandanten_nr ?? "0",
      wjBeginn: datevCfg.wj_beginn ?? `${new Date(date_from).getFullYear()}-01-01`,
      dateFrom: date_from,
      dateTo: date_to,
    };

    const zip = new JSZip();

    // Contacts (used for Debitoren/Kreditoren and buchungen account numbers)
    const { data: contacts } = await supabase
      .from("acc_contacts").select("*").eq("company_id", company_id);
    const contactIndex = new Map<string, number>();
    (contacts ?? []).forEach((c, i) => contactIndex.set(c.id as string, i + 1));

    if (exportTypes.includes("buchungen")) {
      let invoicesQ = supabase
        .from("acc_invoices")
        .select("*, contact:acc_contacts(id, contact_type)")
        .eq("company_id", company_id)
        .gte("invoice_date", date_from)
        .lte("invoice_date", date_to);
      if (bank_account_id) invoicesQ = invoicesQ.eq("bank_account_id", bank_account_id);
      const { data: invoices } = await invoicesQ;

      const rows: string[] = [];
      for (const inv of invoices ?? []) {
        const idx = contactIndex.get((inv.contact?.id as string) ?? inv.contact_id) ?? 1;
        const debitor = datevDebitorAccount(idx);
        const total = Number(inv.total ?? 0);
        const vatAmt = Number(inv.vat_amount ?? 0);
        const subtotal = Number(inv.subtotal ?? 0);
        const revenueAcc = revenueAccountForRate(
          vatAmt > 0 && subtotal > 0 ? Math.round((vatAmt / subtotal) * 100) : 0,
        );
        const beleg = formatDateDDMM(inv.invoice_date as string);

        rows.push([
          csvField(money(total), true),
          `"S"`,
          `"${inv.currency ?? "EUR"}"`,
          ``, ``, ``,
          debitor, revenueAcc, ``,
          beleg, csvField(inv.invoice_number), ``, ``,
          csvField((inv.notes as string) ?? inv.invoice_number),
          ``, ``, ``, ``, ``, ``,
        ].join(";"));
      }

      const body = buildBuchungenHeader(cfg) + rows.join("\r\n") + (rows.length ? "\r\n" : "");
      zip.file("EXTF_Buchungsstapel.csv", encodeWin1252(body));
    }

    if (exportTypes.includes("debitoren")) {
      const customers = (contacts ?? []).filter(
        (c) => c.contact_type === "customer" || c.contact_type === "both",
      );
      const header = [
        "Konto", "Name (Adressattyp Unternehmen)", "Strasse", "Postleitzahl", "Ort",
        "Land", "USt-IdNr.", "E-Mail", "Telefon", "IBAN", "BIC",
      ].map((s) => `"${s}"`).join(";");
      const rows = customers.map((c) => [
        datevDebitorAccount(contactIndex.get(c.id as string) ?? 1),
        csvField(c.name), csvField(c.address), csvField(c.postal_code),
        csvField(c.city), csvField(c.country ?? "DE"), csvField(c.vat_number),
        csvField(c.email), csvField(c.phone), csvField(c.iban), csvField(c.bic),
      ].join(";"));
      const body = header + "\r\n" + rows.join("\r\n") + "\r\n";
      zip.file("EXTF_Debitoren.csv", encodeWin1252(body));
    }

    if (exportTypes.includes("kreditoren")) {
      const suppliers = (contacts ?? []).filter(
        (c) => c.contact_type === "supplier" || c.contact_type === "both",
      );
      const header = [
        "Konto", "Name (Adressattyp Unternehmen)", "Strasse", "Postleitzahl", "Ort",
        "Land", "USt-IdNr.", "E-Mail", "Telefon", "IBAN", "BIC",
      ].map((s) => `"${s}"`).join(";");
      const rows = suppliers.map((c) => [
        datevKreditorAccount(contactIndex.get(c.id as string) ?? 1),
        csvField(c.name), csvField(c.address), csvField(c.postal_code),
        csvField(c.city), csvField(c.country ?? "DE"), csvField(c.vat_number),
        csvField(c.email), csvField(c.phone), csvField(c.iban), csvField(c.bic),
      ].join(";"));
      const body = header + "\r\n" + rows.join("\r\n") + "\r\n";
      zip.file("EXTF_Kreditoren.csv", encodeWin1252(body));
    }

    if (exportTypes.includes("sachkonten")) {
      const { data: coa } = await supabase
        .from("acc_chart_of_accounts")
        .select("*")
        .eq("company_id", company_id);
      const header = [`"Konto"`, `"Kontenbeschriftung"`, `"Kontotyp"`, `"Steuersatz"`].join(";");
      const rows = (coa ?? []).map((a) => [
        csvField(a.account_code),
        csvField(a.name),
        csvField(a.account_type),
        csvField(String(a.vat_rate ?? 0), true),
      ].join(";"));
      const body = header + "\r\n" + rows.join("\r\n") + "\r\n";
      zip.file("EXTF_Sachkonten.csv", encodeWin1252(body));
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const zipPath = `${company_id}/datev/${timestamp}.zip`;

    await supabase.storage.from("acc-documents").upload(
      zipPath,
      new Blob([zipBytes], { type: "application/zip" }),
      { upsert: true },
    );

    const { data: signed } = await supabase.storage
      .from("acc-documents").createSignedUrl(zipPath, 3600);

    return new Response(JSON.stringify({
      zip_path: zipPath,
      download_url: signed?.signedUrl ?? null,
      files: Object.keys(zip.files),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function money(n: number): string {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}
