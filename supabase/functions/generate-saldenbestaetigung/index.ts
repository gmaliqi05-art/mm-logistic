import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { assertOwnCompany, requireCaller } from "../_shared/requireCaller.ts";

/**
 * Generate a Saldenbestätigung (signed balance confirmation) PDF for a
 * specific pallet_reconciliations row.
 *
 * Differs from generate-pallet-statement: that one is a transactional
 * statement (every movement in the period). This one is a legally
 * binding **declaration of agreement on the balance** — short, formal,
 * with signature blocks and §439 HGB legal text. Once signed by both
 * parties, the §212 BGB acknowledgement restarts the limitation clock.
 *
 * After successful generation, the function writes the storage path
 * back into pallet_reconciliations.document_url so the UI link picks
 * it up on next reload.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Lang = "sq" | "en" | "de" | "fr";

interface Payload {
  reconciliation_id: string;
  language?: Lang;
}

const I18N: Record<Lang, Record<string, string>> = {
  sq: {
    title: "KONFIRMIM I BILANCIT",
    subtitle: "Saldenbestaetigung sipas §782 BGB",
    issued: "Leshuar",
    partner: "Partner:",
    palletType: "Tipi i paletes",
    period: "Periudha",
    openingBalance: "Bilanci ne fillim",
    movements: "Levizjet bruto ne periudhe",
    confirmedBalance: "Bilanci i konfirmuar",
    positiveMeaning: "Partneri na ka borxh paleta",
    negativeMeaning: "Ne kemi borxh paleta partnerit",
    zeroMeaning: "Llogaria eshte e barazuar",
    legalNotice:
      "Sipas §439 HGB, detyrimet e paletave parashkruhen brenda 1 viti. Nenshkrimi i ketij dokumenti perfaqeson nje njohje (Schuldanerkenntnis) sipas §782 BGB dhe rinis afatin e parashkrimit sipas §212 BGB.",
    notes: "Shenime",
    signOff: "Me kete e konfirmoj se bilanci i mesiperm eshte i sakte ne dt.",
    companySignature: "Nenshkrimi i kompanise",
    partnerSignature: "Nenshkrimi i partnerit",
    place: "Vendi",
    date: "Data",
    statusLabel: "Statusi",
    statusDraft: "Draft",
    statusSent: "Derguar",
    statusSigned: "Nenshkruar",
    vat: "TVSH",
  },
  en: {
    title: "BALANCE CONFIRMATION",
    subtitle: "Saldenbestaetigung per §782 BGB",
    issued: "Issued",
    partner: "Partner:",
    palletType: "Pallet type",
    period: "Period",
    openingBalance: "Opening balance",
    movements: "Gross movements in period",
    confirmedBalance: "Confirmed balance",
    positiveMeaning: "Partner owes us pallets",
    negativeMeaning: "We owe partner pallets",
    zeroMeaning: "Account balanced",
    legalNotice:
      "Under §439 HGB, pallet receivables prescribe within one year. Signing this document constitutes an acknowledgement (Schuldanerkenntnis) per §782 BGB and restarts the limitation clock per §212 BGB.",
    notes: "Notes",
    signOff: "I hereby confirm that the balance stated above is correct as of",
    companySignature: "Company signature",
    partnerSignature: "Partner signature",
    place: "Place",
    date: "Date",
    statusLabel: "Status",
    statusDraft: "Draft",
    statusSent: "Sent",
    statusSigned: "Signed",
    vat: "VAT",
  },
  de: {
    title: "SALDENBESTAETIGUNG",
    subtitle: "Bestaetigung des Palettensaldos gemaess §782 BGB",
    issued: "Ausgestellt",
    partner: "Partner:",
    palletType: "Palettentyp",
    period: "Zeitraum",
    openingBalance: "Anfangssaldo",
    movements: "Bruttobewegungen im Zeitraum",
    confirmedBalance: "Bestaetigter Saldo",
    positiveMeaning: "Partner schuldet uns Paletten",
    negativeMeaning: "Wir schulden dem Partner Paletten",
    zeroMeaning: "Konto ausgeglichen",
    legalNotice:
      "Nach §439 HGB verjaehren Palettenforderungen innerhalb eines Jahres. Die Unterzeichnung dieses Dokuments stellt ein Schuldanerkenntnis gemaess §782 BGB dar und laesst die Verjaehrungsfrist gemaess §212 BGB neu beginnen.",
    notes: "Anmerkungen",
    signOff: "Hiermit bestaetige ich, dass der oben genannte Saldo per",
    companySignature: "Unterschrift Firma",
    partnerSignature: "Unterschrift Partner",
    place: "Ort",
    date: "Datum",
    statusLabel: "Status",
    statusDraft: "Entwurf",
    statusSent: "Versendet",
    statusSigned: "Unterzeichnet",
    vat: "USt",
  },
  fr: {
    title: "CONFIRMATION DE SOLDE",
    subtitle: "Saldenbestaetigung selon §782 BGB",
    issued: "Emis",
    partner: "Partenaire:",
    palletType: "Type de palette",
    period: "Periode",
    openingBalance: "Solde d'ouverture",
    movements: "Mouvements bruts sur la periode",
    confirmedBalance: "Solde confirme",
    positiveMeaning: "Le partenaire nous doit des palettes",
    negativeMeaning: "Nous devons des palettes au partenaire",
    zeroMeaning: "Compte equilibre",
    legalNotice:
      "Selon §439 HGB, les creances de palettes prescrivent dans un delai d'un an. La signature de ce document constitue une reconnaissance de dette selon §782 BGB et fait redemarrer le delai de prescription selon §212 BGB.",
    notes: "Notes",
    signOff: "Par la presente je confirme que le solde indique ci-dessus est exact au",
    companySignature: "Signature de l'entreprise",
    partnerSignature: "Signature du partenaire",
    place: "Lieu",
    date: "Date",
    statusLabel: "Statut",
    statusDraft: "Brouillon",
    statusSent: "Envoye",
    statusSigned: "Signe",
    vat: "TVA",
  },
};

function statusLabel(L: Record<string, string>, status: string): string {
  if (status === "draft") return L.statusDraft;
  if (status === "sent") return L.statusSent;
  if (status === "signed") return L.statusSigned;
  return status;
}

function formatPeriod(periodStart: string, periodEnd: string): string {
  const fmt = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
  };
  return `${fmt(periodStart)} - ${fmt(periodEnd)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const caller = await requireCaller(req, {
      roles: ["company_admin", "accountant", "logistics_admin", "super_admin"],
      corsHeaders,
    });
    if (!caller.ok) return caller.response;

    const body: Payload = await req.json();
    const { reconciliation_id } = body;
    if (!reconciliation_id) throw new Error("reconciliation_id required");
    const lang: Lang = (["sq", "en", "de", "fr"] as Lang[]).includes(body.language as Lang)
      ? (body.language as Lang)
      : "en";
    const L = I18N[lang];

    const supabase = caller.admin;

    // 1. Load reconciliation row + verify ownership.
    const { data: recon, error: reconErr } = await supabase
      .from("pallet_reconciliations")
      .select("id, company_id, pallet_account_id, period_start, period_end, confirmed_balance, status, signed_by_name, signed_at, notes")
      .eq("id", reconciliation_id)
      .maybeSingle();
    if (reconErr || !recon) throw new Error("Reconciliation not found");

    const ownErr = assertOwnCompany(caller, recon.company_id as string, corsHeaders);
    if (ownErr) return ownErr;

    // 2. Load related entities in parallel.
    const { data: acc, error: accErr } = await supabase
      .from("pallet_accounts")
      .select("id, partner_contact_id, pallet_type, opening_balance")
      .eq("id", recon.pallet_account_id)
      .maybeSingle();
    if (accErr || !acc) throw new Error("Pallet account not found");

    const [{ data: company }, { data: partner }, { data: txns }] = await Promise.all([
      supabase.from("companies")
        .select("name, address, city, postal_code, country, vat_number, email, phone")
        .eq("id", recon.company_id)
        .maybeSingle(),
      supabase.from("acc_contacts")
        .select("name, address, city, postal_code, country, vat_number")
        .eq("id", acc.partner_contact_id)
        .maybeSingle(),
      supabase.from("pallet_account_transactions")
        .select("direction, quantity")
        .eq("pallet_account_id", recon.pallet_account_id)
        .gte("transaction_date", recon.period_start)
        .lte("transaction_date", recon.period_end),
    ]);

    // Gross movement totals (count, not net) within the period.
    let grossIn = 0;
    let grossOut = 0;
    for (const t of (txns ?? []) as Array<{ direction: string; quantity: number }>) {
      if (t.direction === "in") grossIn += t.quantity;
      else if (t.direction === "out") grossOut += t.quantity;
      else grossIn += Math.max(0, t.quantity);
    }

    // 3. Build the PDF. A5 portrait wouldn't fit; we use A4 portrait
    //    with generous margins and a centered layout — the document is
    //    expected to be signed by hand and faxed back.
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595, 842]);
    const width = 595;
    let y = 800;

    const line = (txt: string, x: number, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) => {
      page.drawText(txt, { x, y, size, font: f, color });
    };

    line(L.title, 40, 20, bold, rgb(0, 0.36, 0.33));
    y -= 22;
    line(L.subtitle, 40, 10, font, rgb(0.4, 0.4, 0.4));
    y -= 28;

    // Company block
    line(company?.name ?? "—", 40, 12, bold);
    y -= 14;
    line([company?.address, company?.postal_code, company?.city, company?.country].filter(Boolean).join(", "), 40, 9);
    y -= 12;
    if (company?.vat_number) { line(`${L.vat}: ${company.vat_number}`, 40, 9); y -= 12; }
    y -= 12;

    // Partner block
    line(L.partner, 40, 10, bold);
    y -= 14;
    line(partner?.name ?? "—", 40, 11);
    y -= 12;
    line([partner?.address, partner?.postal_code, partner?.city, partner?.country].filter(Boolean).join(", "), 40, 9);
    y -= 12;
    if (partner?.vat_number) { line(`${L.vat}: ${partner.vat_number}`, 40, 9); y -= 12; }
    y -= 14;

    // Period + pallet type
    line(`${L.palletType}: ${acc.pallet_type}`, 40, 10, bold);
    line(`${L.statusLabel}: ${statusLabel(L, String(recon.status))}`, 340, 10, bold);
    y -= 14;
    line(`${L.period}: ${formatPeriod(String(recon.period_start), String(recon.period_end))}`, 40, 10);
    y -= 14;
    line(`${L.issued}: ${new Date().toISOString().slice(0, 10)}`, 40, 9, font, rgb(0.4, 0.4, 0.4));
    y -= 24;

    // Movement table — three rows: opening / in / out / confirmed
    const openingBalance = Number(acc.opening_balance ?? 0);
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 16;
    line(L.openingBalance, 40, 10);
    line(String(openingBalance), 500, 10);
    y -= 16;
    line(`${L.movements} (${L.title.toLowerCase().includes("salden") ? "+/-" : "+/-"})`, 40, 10);
    line(`+${grossIn} / -${grossOut}`, 460, 10);
    y -= 16;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 18;
    line(L.confirmedBalance, 40, 13, bold);
    line(`${recon.confirmed_balance > 0 ? "+" : ""}${recon.confirmed_balance}`, 500, 13, bold, rgb(0, 0.36, 0.33));
    y -= 18;
    const meaning = Number(recon.confirmed_balance) > 0
      ? L.positiveMeaning
      : Number(recon.confirmed_balance) < 0
        ? L.negativeMeaning
        : L.zeroMeaning;
    line(meaning, 40, 9, font, rgb(0.4, 0.4, 0.4));
    y -= 30;

    // Legal notice block (small, multi-line — wrap at ~85 chars)
    const wrapLines = (s: string, maxChars: number) => {
      const words = s.split(/\s+/);
      const out: string[] = [];
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length > maxChars) {
          out.push(cur.trim());
          cur = w;
        } else {
          cur = cur ? cur + " " + w : w;
        }
      }
      if (cur) out.push(cur);
      return out;
    };
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 14;
    for (const ln of wrapLines(L.legalNotice, 95)) {
      line(ln, 40, 8, font, rgb(0.3, 0.3, 0.3));
      y -= 11;
    }
    y -= 8;
    if ((recon.notes as string | null)?.trim()) {
      line(`${L.notes}: ${recon.notes}`, 40, 9, font, rgb(0.2, 0.2, 0.2));
      y -= 14;
    }

    // Sign-off + signature blocks
    y -= 30;
    line(`${L.signOff} ${recon.signed_at ? new Date(String(recon.signed_at)).toISOString().slice(0, 10) : "____________"}`, 40, 10);
    y -= 50;
    line(`${L.companySignature}:`, 40, 10, bold);
    line(`${L.partnerSignature}:`, 330, 10, bold);
    y -= 30;
    page.drawLine({ start: { x: 40, y }, end: { x: 280, y }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: 330, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;
    line(`${L.place} / ${L.date}`, 40, 8, font, rgb(0.5, 0.5, 0.5));
    line(`${recon.signed_by_name ? recon.signed_by_name + " - " : ""}${L.place} / ${L.date}`, 330, 8, font, rgb(0.5, 0.5, 0.5));

    // 4. Upload + signed URL + write back to row.
    const bytes = await pdf.save();
    const filename = `saldenbestaetigung-${recon.id}-${Date.now()}.pdf`;
    const path = `${recon.company_id}/saldenbestaetigung/${filename}`;

    const { error: upErr } = await supabase.storage
      .from("acc-documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed } = await supabase.storage
      .from("acc-documents")
      .createSignedUrl(path, 60 * 60);

    // Best-effort write of the storage path. If RLS blocks (e.g. an
    // accountant without UPDATE permission), we still return the PDF
    // so the operator can download it.
    await supabase
      .from("pallet_reconciliations")
      .update({ document_url: path, updated_at: new Date().toISOString() })
      .eq("id", reconciliation_id);

    return new Response(
      JSON.stringify({ success: true, download_url: signed?.signedUrl ?? null, storage_path: path }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
