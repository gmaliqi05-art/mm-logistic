import { assertOwnCompany, requireCaller } from "../_shared/requireCaller.ts";
import { PDFDocument, PDFName, PDFRawStream, PDFHexString } from "npm:pdf-lib@1.17.1";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  invoice_id: string;
  format: "xrechnung" | "zugferd";
}

interface ValidationError {
  field: string;
  message: string;
}

const CUSTOMIZATION_ID =
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3";
const PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function money(n: number): string {
  return round2(n).toFixed(2);
}

function vatCategoryFromInvoice(inv: Record<string, unknown>, rate: number): string {
  if (inv.reverse_charge) return "AE";
  if (inv.intra_community_supply) return "K";
  if (rate === 0) return "Z";
  return "S";
}

function buildXRechnung(
  invoice: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  seller: Record<string, unknown>,
  buyer: Record<string, unknown>,
): { xml: string; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const invNumber = String(invoice.invoice_number ?? "");
  if (!invNumber) errors.push({ field: "invoice_number", message: "Invoice number is required (BT-1)" });
  if (!invoice.invoice_date) errors.push({ field: "invoice_date", message: "Issue date is required (BT-2)" });
  if (!invoice.currency) errors.push({ field: "currency", message: "Currency code is required (BT-5)" });
  if (!seller.name) errors.push({ field: "seller.name", message: "Seller name is required (BT-27)" });
  if (!seller.vat_number) errors.push({ field: "seller.vat_number", message: "Seller VAT number is required (BT-31)" });
  if (!buyer.name) errors.push({ field: "buyer.name", message: "Buyer name is required (BT-44)" });
  if (!Array.isArray(items) || items.length === 0) errors.push({ field: "items", message: "At least one invoice line is required" });

  const subtotal = Number(invoice.subtotal ?? 0);
  const vatAmount = Number(invoice.vat_amount ?? 0);
  const total = Number(invoice.total ?? 0);

  const lines = items.map((it, idx) => {
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unit_price ?? 0);
    const lineTotal = Number(it.line_total ?? qty * unitPrice);
    const vatRate = Number(it.vat_rate ?? 0);
    const category = (it.vat_category as string) || vatCategoryFromInvoice(invoice, vatRate);
    const unitCode = (it.unit_code as string) || "EA";
    const description = esc(it.description ?? "");

    return `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(unitCode)}">${money(qty)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${esc(invoice.currency)}">${money(lineTotal)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      ${it.product_code ? `<cac:SellersItemIdentification><cbc:ID>${esc(it.product_code)}</cbc:ID></cac:SellersItemIdentification>` : ""}
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${category}</cbc:ID>
        <cbc:Percent>${money(vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(invoice.currency)}">${money(unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join("");

  const vatBreakdown = new Map<number, { taxable: number; vat: number; category: string }>();
  for (const it of items) {
    const rate = Number(it.vat_rate ?? 0);
    const base = Number(it.line_total ?? 0);
    // Round each line's VAT to 2 decimals BEFORE summing, so the breakdown
    // total equals the sum of the per-line VAT values the UI shows. Summing
    // unrounded then rounding once could differ by a cent on multi-line
    // invoices and trips strict XRechnung validators. (Audit 6.3)
    const vat = round2(base * (rate / 100));
    const category = (it.vat_category as string) || vatCategoryFromInvoice(invoice, rate);
    const cur = vatBreakdown.get(rate) || { taxable: 0, vat: 0, category };
    cur.taxable += base;
    cur.vat += vat;
    vatBreakdown.set(rate, cur);
  }

  const taxSubtotals = Array.from(vatBreakdown.entries()).map(([rate, v]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(invoice.currency)}">${money(v.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(invoice.currency)}">${money(v.vat)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${v.category}</cbc:ID>
        <cbc:Percent>${money(rate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join("");

  const buyerEndpointId = buyer.peppol_id
    ? `<cbc:EndpointID schemeID="${esc(buyer.peppol_scheme ?? "9930")}">${esc(buyer.peppol_id)}</cbc:EndpointID>`
    : "";
  const sellerEndpointId = seller.peppol_id
    ? `<cbc:EndpointID schemeID="${esc(seller.peppol_scheme ?? "9930")}">${esc(seller.peppol_id)}</cbc:EndpointID>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID>
  <cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>
  <cbc:ID>${esc(invNumber)}</cbc:ID>
  <cbc:IssueDate>${esc(invoice.invoice_date)}</cbc:IssueDate>
  ${invoice.due_date ? `<cbc:DueDate>${esc(invoice.due_date)}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${invoice.notes ? `<cbc:Note>${esc(invoice.notes)}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${esc(invoice.currency)}</cbc:DocumentCurrencyCode>
  ${invoice.payment_reference ? `<cbc:BuyerReference>${esc(invoice.payment_reference)}</cbc:BuyerReference>` : `<cbc:BuyerReference>${esc(invNumber)}</cbc:BuyerReference>`}
  <cac:AccountingSupplierParty>
    <cac:Party>
      ${sellerEndpointId}
      <cac:PartyName><cbc:Name>${esc(seller.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(seller.address ?? "")}</cbc:StreetName>
        <cbc:CityName>${esc(seller.city ?? "")}</cbc:CityName>
        <cbc:PostalZone>${esc(seller.postal_code ?? "")}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(seller.country ?? "DE")}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(seller.vat_number ?? "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(seller.name)}</cbc:RegistrationName>
        ${seller.commercial_register ? `<cbc:CompanyID>${esc(seller.commercial_register)}</cbc:CompanyID>` : ""}
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:ElectronicMail>${esc(seller.email ?? "")}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${buyerEndpointId}
      <cac:PartyName><cbc:Name>${esc(buyer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(buyer.address ?? "")}</cbc:StreetName>
        <cbc:CityName>${esc(buyer.city ?? "")}</cbc:CityName>
        <cbc:PostalZone>${esc(buyer.postal_code ?? "")}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(buyer.country ?? "DE")}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${buyer.vat_number ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(buyer.vat_number)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    ${seller.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(seller.iban)}</cbc:ID></cac:PayeeFinancialAccount>` : ""}
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(invoice.currency)}">${money(vatAmount)}</cbc:TaxAmount>
    ${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(invoice.currency)}">${money(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(invoice.currency)}">${money(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(invoice.currency)}">${money(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(invoice.currency)}">${money(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;

  // Structural sanity validation
  if (!xml.includes("<cbc:CustomizationID>")) errors.push({ field: "xml", message: "CustomizationID missing" });
  if (Math.abs(subtotal + vatAmount - total) > 0.05) {
    errors.push({ field: "totals", message: "Subtotal + VAT must equal total (±0.05)" });
  }

  return { xml, errors };
}

interface InvoicePdfData {
  invoice: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  seller: Record<string, unknown>;
  buyer: Record<string, unknown>;
}

async function buildZugferdPdf(xml: string, invoiceData: InvoicePdfData, sourcePdf?: Uint8Array | null): Promise<Uint8Array> {
  const pdfDoc = sourcePdf
    ? await PDFDocument.load(sourcePdf)
    : await createInvoicePdf(invoiceData);

  const xmlBytes = new TextEncoder().encode(xml);
  await pdfDoc.attach(xmlBytes, "zugferd-invoice.xml", {
    mimeType: "application/xml",
    description: "ZUGFeRD 2.1 Invoice",
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: "Alternative" as unknown as never,
  });

  pdfDoc.setTitle("ZUGFeRD Invoice");
  pdfDoc.setSubject("ZUGFeRD 2.1 / Factur-X compliant invoice");
  pdfDoc.setKeywords(["ZUGFeRD", "PDF/A-3", "XRechnung", "EN 16931"]);
  pdfDoc.setProducer("MM Logistic e-invoicing");

  return await pdfDoc.save();
}

function truncText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 2) + ".." : text;
}

async function createInvoicePdf(data: InvoicePdfData): Promise<PDFDocument> {
  const { invoice, items, seller, buyer } = data;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { height } = page.getSize();
  let y = height - 50;

  const sellerName = String(seller.name ?? "");
  const buyerName = String(buyer.name ?? "");
  const invNumber = String(invoice.invoice_number ?? "");
  const invDate = String(invoice.invoice_date ?? "");
  const dueDate = String(invoice.due_date ?? "");
  const currency = String(invoice.currency ?? "EUR");
  const subtotal = Number(invoice.subtotal ?? 0);
  const vatAmount = Number(invoice.vat_amount ?? 0);
  const total = Number(invoice.total ?? 0);

  // Header - seller name
  page.drawText(sellerName, { x: 50, y, size: 18 });
  y -= 18;
  const sellerAddr = [seller.address, seller.postal_code, seller.city, seller.country].filter(Boolean).join(", ");
  page.drawText(truncText(String(sellerAddr), 80), { x: 50, y, size: 9 });
  y -= 12;
  if (seller.vat_number) {
    page.drawText(`VAT: ${seller.vat_number}`, { x: 50, y, size: 9 });
    y -= 12;
  }
  if (seller.email) {
    page.drawText(String(seller.email), { x: 50, y, size: 9 });
    y -= 12;
  }

  // Invoice number on the right side
  page.drawText("Rechnung / Invoice", { x: 380, y: height - 50, size: 14 });
  page.drawText(`Nr: ${invNumber}`, { x: 380, y: height - 68, size: 10 });
  page.drawText(`Datum: ${invDate}`, { x: 380, y: height - 82, size: 10 });
  if (dueDate) page.drawText(`Fallig: ${dueDate}`, { x: 380, y: height - 96, size: 10 });

  // Buyer section
  y -= 20;
  page.drawText("An / To:", { x: 50, y, size: 9 });
  y -= 14;
  page.drawText(truncText(buyerName, 60), { x: 50, y, size: 11 });
  y -= 14;
  const buyerAddr = [buyer.address, buyer.postal_code, buyer.city, buyer.country].filter(Boolean).join(", ");
  page.drawText(truncText(String(buyerAddr), 80), { x: 50, y, size: 9 });
  y -= 12;
  if (buyer.vat_number) {
    page.drawText(`VAT: ${buyer.vat_number}`, { x: 50, y, size: 9 });
    y -= 12;
  }

  // Line items header
  y -= 25;
  page.drawText("Pos", { x: 50, y, size: 9 });
  page.drawText("Beschreibung", { x: 80, y, size: 9 });
  page.drawText("Menge", { x: 320, y, size: 9 });
  page.drawText("Preis", { x: 380, y, size: 9 });
  page.drawText("Betrag", { x: 460, y, size: 9 });
  y -= 4;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5 });
  y -= 14;

  // Line items
  for (let i = 0; i < items.length && y > 100; i++) {
    const it = items[i];
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unit_price ?? 0);
    const lineTotal = Number(it.line_total ?? qty * unitPrice);
    const desc = truncText(String(it.description ?? it.product_name ?? `Item ${i + 1}`), 40);

    page.drawText(String(i + 1), { x: 50, y, size: 9 });
    page.drawText(desc, { x: 80, y, size: 9 });
    page.drawText(qty.toString(), { x: 320, y, size: 9 });
    page.drawText(money(unitPrice), { x: 380, y, size: 9 });
    page.drawText(money(lineTotal), { x: 460, y, size: 9 });
    y -= 16;
  }

  // Totals
  y -= 10;
  page.drawLine({ start: { x: 350, y: y + 6 }, end: { x: 545, y: y + 6 }, thickness: 0.5 });
  page.drawText("Netto:", { x: 380, y, size: 10 });
  page.drawText(`${money(subtotal)} ${currency}`, { x: 460, y, size: 10 });
  y -= 16;
  page.drawText("MwSt:", { x: 380, y, size: 10 });
  page.drawText(`${money(vatAmount)} ${currency}`, { x: 460, y, size: 10 });
  y -= 16;
  page.drawText("Gesamt:", { x: 380, y, size: 11 });
  page.drawText(`${money(total)} ${currency}`, { x: 460, y, size: 11 });

  // Footer
  page.drawText("ZUGFeRD 2.1 / EN 16931 konform - Strukturierte Rechnungsdaten als XML eingebettet", { x: 50, y: 30, size: 7 });

  return doc;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`generate-einvoice:ip=${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const caller = await requireCaller(req, {
      roles: ["company_admin", "accountant", "super_admin"],
      corsHeaders,
    });
    if (!caller.ok) return caller.response;

    const { invoice_id, format }: Payload = await req.json();
    if (!invoice_id) throw new Error("invoice_id required");
    if (!["xrechnung", "zugferd"].includes(format)) throw new Error("invalid format");

    const supabase = caller.admin;

    const { data: invoice, error: invErr } = await supabase
      .from("acc_invoices")
      .select("*, contact:acc_contacts(*), company:companies(*)")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invErr || !invoice) throw new Error("Invoice not found");

    const ownErr = assertOwnCompany(caller, invoice.company_id as string, corsHeaders);
    if (ownErr) return ownErr;

    const { data: items } = await supabase
      .from("acc_invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id);

    const seller = {
      name: invoice.company?.name,
      address: invoice.company?.address,
      city: invoice.company?.city,
      postal_code: invoice.company?.postal_code,
      country: invoice.company?.country ?? "DE",
      vat_number: invoice.seller_vat_number || invoice.company?.vat_number,
      commercial_register: invoice.company?.commercial_register,
      email: invoice.company?.email,
      iban: invoice.company?.iban,
      peppol_id: invoice.company?.peppol_id,
      peppol_scheme: invoice.company?.peppol_scheme,
    };
    const buyer = {
      name: invoice.contact?.name,
      address: invoice.contact?.address,
      city: invoice.contact?.city,
      postal_code: invoice.contact?.postal_code,
      country: invoice.contact?.country ?? "DE",
      vat_number: invoice.buyer_vat_number || invoice.contact?.vat_number,
      peppol_id: invoice.contact?.peppol_id,
      peppol_scheme: invoice.contact?.peppol_scheme,
    };

    const { xml, errors } = buildXRechnung(invoice, items ?? [], seller, buyer);
    const validationStatus = errors.length === 0 ? "valid" : "invalid";
    const companyId = invoice.company_id as string;

    const xmlPath = `${companyId}/einvoice/${invoice_id}.xml`;
    const { error: xmlUploadErr } = await supabase.storage
      .from("acc-documents")
      .upload(xmlPath, new Blob([xml], { type: "application/xml" }), { upsert: true });
    if (xmlUploadErr) throw xmlUploadErr;

    let pdfPath: string | null = null;
    if (format === "zugferd") {
      const pdfBytes = await buildZugferdPdf(xml, { invoice, items: items ?? [], seller, buyer }, null);
      pdfPath = `${companyId}/einvoice/${invoice_id}.pdf`;
      const { error: pdfUploadErr } = await supabase.storage
        .from("acc-documents")
        .upload(pdfPath, new Blob([pdfBytes], { type: "application/pdf" }), { upsert: true });
      if (pdfUploadErr) throw pdfUploadErr;
    }

    await supabase
      .from("acc_invoices")
      .update({
        einvoice_format: format,
        einvoice_xml_path: xmlPath,
        einvoice_pdf_path: pdfPath,
        einvoice_generated_at: new Date().toISOString(),
        einvoice_validation_status: validationStatus,
        einvoice_validation_errors: errors.length ? errors : null,
      })
      .eq("id", invoice_id);

    const { data: xmlSigned } = await supabase.storage
      .from("acc-documents").createSignedUrl(xmlPath, 3600);
    const pdfSignedUrl = pdfPath
      ? (await supabase.storage.from("acc-documents").createSignedUrl(pdfPath, 3600)).data?.signedUrl
      : null;

    // Suppress unused import warnings for pdf-lib internals kept for API compatibility
    void PDFName; void PDFRawStream; void PDFHexString;

    return new Response(JSON.stringify({
      xml,
      xml_url: xmlSigned?.signedUrl ?? null,
      pdf_url: pdfSignedUrl,
      validation: { status: validationStatus, errors },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
