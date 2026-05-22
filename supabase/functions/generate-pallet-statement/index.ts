import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { assertOwnCompany, requireCaller } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  pallet_account_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const caller = await requireCaller(req, {
      roles: ["company_admin", "accountant", "super_admin"],
      corsHeaders,
    });
    if (!caller.ok) return caller.response;

    const { pallet_account_id }: Payload = await req.json();
    if (!pallet_account_id) throw new Error("pallet_account_id required");

    const supabase = caller.admin;

    const { data: acc, error: accErr } = await supabase
      .from("pallet_accounts")
      .select("id, company_id, partner_contact_id, pallet_type, current_balance, opening_balance, notes")
      .eq("id", pallet_account_id)
      .maybeSingle();
    if (accErr || !acc) throw new Error("Account not found");

    const ownErr = assertOwnCompany(caller, acc.company_id as string, corsHeaders);
    if (ownErr) return ownErr;

    const [{ data: company }, { data: partner }, { data: txns }] = await Promise.all([
      supabase.from("companies").select("name, address, city, postal_code, country, vat_number, email, phone").eq("id", acc.company_id).maybeSingle(),
      supabase.from("acc_contacts").select("name, address, city, postal_code, country, vat_number").eq("id", acc.partner_contact_id).maybeSingle(),
      supabase.from("pallet_account_transactions")
        .select("transaction_date, direction, quantity, reference, notes, created_at")
        .eq("pallet_account_id", pallet_account_id)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    const width = 595;
    let y = 800;

    const line = (txt: string, x: number, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) => {
      page.drawText(txt, { x, y, size, font: f, color });
    };

    line("PALLET ACCOUNT STATEMENT", 40, 18, bold, rgb(0, 0.36, 0.33));
    y -= 30;
    line(company?.name ?? "", 40, 12, bold);
    y -= 14;
    line([company?.address, company?.postal_code, company?.city, company?.country].filter(Boolean).join(", "), 40, 9);
    y -= 12;
    if (company?.vat_number) { line(`VAT: ${company.vat_number}`, 40, 9); y -= 12; }
    y -= 10;

    line("Partner:", 40, 10, bold);
    y -= 14;
    line(partner?.name ?? "—", 40, 11);
    y -= 12;
    line([partner?.address, partner?.postal_code, partner?.city, partner?.country].filter(Boolean).join(", "), 40, 9);
    y -= 12;
    if (partner?.vat_number) { line(`VAT: ${partner.vat_number}`, 40, 9); y -= 12; }
    y -= 10;

    line(`Pallet type: ${acc.pallet_type}`, 40, 10, bold);
    y -= 14;
    line(`Issued: ${new Date().toISOString().slice(0, 10)}`, 40, 9);
    y -= 20;

    // Table header
    line("Date", 40, 10, bold);
    line("Direction", 120, 10, bold);
    line("Qty", 200, 10, bold);
    line("Reference", 260, 10, bold);
    line("Balance", 500, 10, bold);
    y -= 6;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 14;

    let running = Number(acc.opening_balance ?? 0);
    line("Opening balance", 40, 10);
    line(String(running), 500, 10, bold);
    y -= 16;

    for (const t of (txns ?? []) as Array<{ transaction_date: string; direction: string; quantity: number; reference: string }>) {
      const delta = t.direction === "in" ? t.quantity : t.direction === "out" ? -t.quantity : t.quantity;
      running += delta;
      if (y < 80) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      line(t.transaction_date ?? "", 40, 9);
      line(t.direction, 120, 9);
      line((delta > 0 ? "+" : "") + String(delta), 200, 9);
      line((t.reference ?? "").slice(0, 40), 260, 9);
      line(String(running), 500, 9);
      y -= 14;
    }

    y -= 10;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: rgb(0, 0.36, 0.33) });
    y -= 20;
    line("Closing balance", 40, 12, bold);
    line(String(running), 500, 12, bold, rgb(0, 0.36, 0.33));
    y -= 30;
    line(running > 0 ? "Partner owes us pallets" : running < 0 ? "We owe partner pallets" : "Account balanced", 40, 10);

    y -= 60;
    line("Partner signature: ____________________________", 40, 10);
    line("Date: ____________", 340, 10);

    const bytes = await pdf.save();
    const filename = `pallet-statement-${acc.id}-${Date.now()}.pdf`;
    const path = `${acc.company_id}/pallet-statements/${filename}`;

    const { error: upErr } = await supabase.storage.from("acc-documents").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed } = await supabase.storage.from("acc-documents").createSignedUrl(path, 60 * 60);

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
