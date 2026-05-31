import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import { assertOwnCompany, requireCaller } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_discount: number;
  line_total: number;
}

type Lang = "sq" | "en" | "de" | "fr";

const I18N: Record<Lang, Record<string, string>> = {
  sq: {
    invoice: "FATURE", credit_note: "NOTE KREDITIMI", proforma: "PROFORMA",
    nr: "Nr", buyer: "Bleresi", invoiceDate: "Data e fatures",
    dueDate: "Afati i pageses", deliveryDate: "Data e dorezimit",
    desc: "Pershkrimi", qty: "Sasia", unit: "Njesia", price: "Cmimi",
    vatPct: "TVSH%", total: "Totali", subtotal: "Nentotali",
    discount: "Zbritja", vat: "TVSH", grandTotal: "TOTALI",
    bankInfo: "Te dhenat bankare", bank: "Banka", reference: "Referenca",
    notes: "Shenime", piece: "cope",
  },
  en: {
    invoice: "INVOICE", credit_note: "CREDIT NOTE", proforma: "PRO FORMA",
    nr: "No", buyer: "Bill to", invoiceDate: "Invoice date",
    dueDate: "Due date", deliveryDate: "Delivery date",
    desc: "Description", qty: "Qty", unit: "Unit", price: "Unit price",
    vatPct: "VAT%", total: "Amount", subtotal: "Subtotal",
    discount: "Discount", vat: "VAT", grandTotal: "TOTAL",
    bankInfo: "Bank details", bank: "Bank", reference: "Reference",
    notes: "Notes", piece: "pcs",
  },
  de: {
    invoice: "RECHNUNG", credit_note: "GUTSCHRIFT", proforma: "PROFORMA",
    nr: "Nr", buyer: "Rechnung an", invoiceDate: "Rechnungsdatum",
    dueDate: "Faelligkeitsdatum", deliveryDate: "Lieferdatum",
    desc: "Beschreibung", qty: "Menge", unit: "Einheit", price: "Einzelpreis",
    vatPct: "MwSt%", total: "Gesamt", subtotal: "Nettobetrag",
    discount: "Rabatt", vat: "MwSt", grandTotal: "GESAMT",
    bankInfo: "Bankverbindung", bank: "Bank", reference: "Verwendungszweck",
    notes: "Hinweise", piece: "Stk",
  },
  fr: {
    invoice: "FACTURE", credit_note: "AVOIR", proforma: "PRO FORMA",
    nr: "N°", buyer: "Facturer a", invoiceDate: "Date de facture",
    dueDate: "Date d'echeance", deliveryDate: "Date de livraison",
    desc: "Description", qty: "Qte", unit: "Unite", price: "Prix unitaire",
    vatPct: "TVA%", total: "Total", subtotal: "Sous-total",
    discount: "Remise", vat: "TVA", grandTotal: "TOTAL",
    bankInfo: "Coordonnees bancaires", bank: "Banque", reference: "Reference",
    notes: "Remarques", piece: "pcs",
  },
};

function localeFor(lang: Lang): string {
  switch (lang) {
    case "sq": return "sq-AL";
    case "en": return "en-GB";
    case "fr": return "fr-FR";
    case "de":
    default:   return "de-DE";
  }
}

function fmt(n: number, currency: string, lang: Lang = "de"): string {
  try {
    return new Intl.NumberFormat(localeFor(lang), {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function fmtDate(d: string | null, lang: Lang = "de"): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString(localeFor(lang), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
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

    const body = await req.json();
    const invoice_id = body.invoice_id;
    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = caller.admin;

    const { data: invoice, error: invErr } = await supabase
      .from("acc_invoices")
      .select(
        `*, items:acc_invoice_items(*), contact:acc_contacts(*), bank_account:acc_bank_accounts(*)`
      )
      .eq("id", invoice_id)
      .maybeSingle();

    if (invErr || !invoice) {
      return new Response(
        JSON.stringify({ error: invErr?.message || "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownErr = assertOwnCompany(caller, invoice.company_id as string, corsHeaders);
    if (ownErr) return ownErr;

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", invoice.company_id)
      .maybeSingle();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const darkColor = rgb(0.06, 0.09, 0.16);
    const grayColor = rgb(0.4, 0.45, 0.53);
    const tealColor = rgb(0.06, 0.47, 0.43);
    const lightBg = rgb(0.97, 0.98, 0.99);

    function drawText(
      text: string,
      x: number,
      yPos: number,
      options: { size?: number; font?: typeof font; color?: typeof darkColor; maxWidth?: number } = {}
    ) {
      const { size = 9, font: f = font, color = darkColor, maxWidth } = options;
      let displayText = text;
      if (maxWidth) {
        const charWidth = size * 0.5;
        const maxChars = Math.floor(maxWidth / charWidth);
        if (displayText.length > maxChars) {
          displayText = displayText.substring(0, maxChars - 2) + "..";
        }
      }
      page.drawText(displayText, { x, y: yPos, size, font: f, color });
    }

    function drawLine(x1: number, yPos: number, x2: number, thickness = 0.5) {
      page.drawLine({
        start: { x: x1, y: yPos },
        end: { x: x2, y: yPos },
        thickness,
        color: rgb(0.85, 0.87, 0.9),
      });
    }

    // --- HEADER: Company info ---
    drawText(company.name || "", margin, y, { size: 16, font: fontBold, color: tealColor });
    y -= 16;

    const companyLines = [
      company.address,
      [company.postal_code, company.city].filter(Boolean).join(" "),
      company.country,
      company.phone ? `Tel: ${company.phone}` : null,
      company.email ? `Email: ${company.email}` : null,
      company.website,
      company.vat_number ? `VAT: ${company.vat_number}` : null,
      company.tax_number ? `Steuernr: ${company.tax_number}` : null,
    ].filter(Boolean) as string[];

    for (const line of companyLines) {
      drawText(line, margin, y, { size: 8, color: grayColor });
      y -= 11;
    }

    y -= 10;

    // Resolve language: explicit request -> invoice language_code -> SQ default
    const explicitLang = (["sq", "en", "de", "fr"] as Lang[]).includes(body.language as Lang)
      ? (body.language as Lang)
      : null;
    const lang: Lang = explicitLang
      ?? ((["sq", "en", "de", "fr"] as Lang[]).includes(invoice.language_code as Lang)
        ? (invoice.language_code as Lang)
        : "sq");
    const L = I18N[lang];

    // --- Invoice title ---
    const titleText = L[invoice.invoice_type] ?? L.invoice;
    drawText(titleText, margin, y, { size: 14, font: fontBold });

    // Invoice number on the right
    drawText(
      `${L.nr}: ${invoice.invoice_number || "-"}`,
      pageWidth - margin - 150,
      y,
      { size: 11, font: fontBold }
    );
    y -= 22;

    // --- Buyer info ---
    const contact = invoice.contact;
    if (contact) {
      drawText(`${L.buyer}:`, margin, y, { size: 8, color: grayColor });
      y -= 13;
      drawText(contact.name || "", margin, y, { size: 10, font: fontBold });
      y -= 13;
      const buyerLines = [
        contact.address,
        [contact.postal_code, contact.city].filter(Boolean).join(" "),
        contact.country,
        contact.vat_number ? `VAT: ${contact.vat_number}` : null,
        contact.email,
      ].filter(Boolean) as string[];
      for (const line of buyerLines) {
        drawText(line, margin, y, { size: 8, color: grayColor });
        y -= 11;
      }
    }

    y -= 8;

    // --- Dates row ---
    const dates = [
      { label: L.invoiceDate, value: fmtDate(invoice.invoice_date, lang) },
      { label: L.dueDate, value: fmtDate(invoice.due_date, lang) },
      { label: L.deliveryDate, value: fmtDate(invoice.delivery_date, lang) },
    ].filter((d) => d.value !== "-");

    const dateColWidth = contentWidth / dates.length;
    for (let i = 0; i < dates.length; i++) {
      const x = margin + i * dateColWidth;
      drawText(dates[i].label, x, y, { size: 7, color: grayColor });
      drawText(dates[i].value, x, y - 11, { size: 9, font: fontBold });
    }
    y -= 28;

    drawLine(margin, y, pageWidth - margin);
    y -= 15;

    // --- Items table header ---
    const colX = {
      nr: margin,
      desc: margin + 25,
      qty: margin + 280,
      unit: margin + 320,
      price: margin + 360,
      vat: margin + 415,
      total: margin + 450,
    };

    drawText(L.nr, colX.nr, y, { size: 7, font: fontBold, color: grayColor });
    drawText(L.desc, colX.desc, y, { size: 7, font: fontBold, color: grayColor });
    drawText(L.qty, colX.qty, y, { size: 7, font: fontBold, color: grayColor });
    drawText(L.unit, colX.unit, y, { size: 7, font: fontBold, color: grayColor });
    drawText(L.price, colX.price, y, { size: 7, font: fontBold, color: grayColor });
    drawText(L.vatPct, colX.vat, y, { size: 7, font: fontBold, color: grayColor });
    drawText(L.total, colX.total, y, { size: 7, font: fontBold, color: grayColor });
    y -= 12;
    drawLine(margin, y, pageWidth - margin);
    y -= 10;

    // --- Items ---
    const items: InvoiceItem[] = (invoice.items || []).sort(
      (a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || "")
    );

    for (let i = 0; i < items.length; i++) {
      if (y < 100) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      const item = items[i];
      const lineTotal = Number(item.line_total ?? 0);

      if (i % 2 === 0) {
        page.drawRectangle({
          x: margin - 4,
          y: y - 4,
          width: contentWidth + 8,
          height: 16,
          color: lightBg,
        });
      }

      drawText(String(i + 1), colX.nr, y, { size: 8 });
      drawText(item.description || "", colX.desc, y, { size: 8, maxWidth: 250 });
      drawText(String(Number(item.quantity ?? 0)), colX.qty, y, { size: 8 });
      drawText(item.unit || L.piece, colX.unit, y, { size: 8 });
      drawText(Number(item.unit_price ?? 0).toFixed(2), colX.price, y, { size: 8 });
      drawText(`${Number(item.vat_rate ?? 0)}%`, colX.vat, y, { size: 8 });
      drawText(lineTotal.toFixed(2), colX.total, y, { size: 8, font: fontBold });
      y -= 16;
    }

    y -= 8;
    drawLine(margin, y, pageWidth - margin);
    y -= 18;

    // --- Totals ---
    const currency = invoice.currency || "EUR";
    const subtotal = Number(invoice.subtotal ?? 0);
    const discount = Number(invoice.discount ?? 0);
    const vatAmount = Number(invoice.vat_amount ?? 0);
    const total = Number(invoice.total ?? 0);

    const totalsX = pageWidth - margin - 180;

    drawText(`${L.subtotal}:`, totalsX, y, { size: 9, color: grayColor });
    drawText(fmt(subtotal, currency, lang), totalsX + 100, y, { size: 9 });
    y -= 14;

    if (discount > 0) {
      drawText(`${L.discount}:`, totalsX, y, { size: 9, color: grayColor });
      drawText(`-${fmt(discount, currency, lang)}`, totalsX + 100, y, { size: 9 });
      y -= 14;
    }

    drawText(`${L.vat}:`, totalsX, y, { size: 9, color: grayColor });
    drawText(fmt(vatAmount, currency, lang), totalsX + 100, y, { size: 9 });
    y -= 16;

    drawLine(totalsX, y, pageWidth - margin);
    y -= 14;

    drawText(`${L.grandTotal}:`, totalsX, y, { size: 11, font: fontBold, color: tealColor });
    drawText(fmt(total, currency, lang), totalsX + 100, y, { size: 11, font: fontBold, color: tealColor });
    y -= 24;

    // --- Bank details ---
    const bank = invoice.bank_account;
    if (bank) {
      drawLine(margin, y, pageWidth - margin);
      y -= 16;
      drawText(`${L.bankInfo}:`, margin, y, {
        size: 8,
        font: fontBold,
        color: grayColor,
      });
      y -= 13;
      drawText(`IBAN: ${bank.iban || "-"}`, margin, y, { size: 9 });
      y -= 12;
      drawText(`BIC: ${bank.bic || "-"}`, margin, y, { size: 9 });
      y -= 12;
      if (bank.bank_name) {
        drawText(`${L.bank}: ${bank.bank_name}`, margin, y, { size: 9 });
        y -= 12;
      }
      drawText(`${L.reference}: ${invoice.invoice_number || "-"}`, margin, y, { size: 9 });
      y -= 16;
    }

    // --- Notes ---
    if (invoice.notes) {
      drawText(`${L.notes}:`, margin, y, { size: 8, font: fontBold, color: grayColor });
      y -= 12;
      drawText(invoice.notes.substring(0, 200), margin, y, { size: 8, color: grayColor });
      y -= 14;
    }

    // --- Footer ---
    const footerText = company.invoice_footer_text;
    if (footerText) {
      if (y > 60) {
        drawText(footerText.substring(0, 120), margin, 40, { size: 7, color: grayColor });
      }
    }

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(pdfBytes))
    );

    // Store in Supabase Storage
    const filename = `invoices/${invoice.company_id}/${invoice.invoice_number || invoice.id}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("attachments")
      .upload(filename, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    let pdfUrl: string | null = null;
    if (!uploadErr) {
      const { data: urlData } = await supabase.storage
        .from("attachments")
        .createSignedUrl(filename, 60 * 60 * 24 * 30);
      pdfUrl = urlData?.signedUrl ?? null;

      await supabase
        .from("acc_invoices")
        .update({ pdf_url: pdfUrl })
        .eq("id", invoice_id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pdf_base64: base64,
        pdf_url: pdfUrl,
        filename: `${invoice.invoice_number || "invoice"}.pdf`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
