import type { AccInvoice, AccInvoiceItem } from '../types/accounting';

interface Company {
  name: string;
  vat_number?: string | null;
  tax_number?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  email?: string | null;
}

function xmlEscape(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportXRechnung(invoice: AccInvoice, company: Company) {
  const items = invoice.items ?? [];
  const contact = invoice.contact;
  const contactName = contact?.name ?? 'Kunde';

  const linesByVat = new Map<number, { taxable: number; tax: number }>();
  items.forEach((item: AccInvoiceItem) => {
    const rate = item.vat_rate ?? 19;
    const net = item.line_total ?? 0;
    const tax = (net * rate) / 100;
    const entry = linesByVat.get(rate) ?? { taxable: 0, tax: 0 };
    entry.taxable += net;
    entry.tax += tax;
    linesByVat.set(rate, entry);
  });

  const taxSubtotals = Array.from(linesByVat.entries())
    .map(
      ([rate, data]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${invoice.currency}">${fmt(data.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${invoice.currency}">${fmt(data.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${rate > 0 ? 'S' : 'Z'}</cbc:ID>
        <cbc:Percent>${rate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
    )
    .join('');

  const invoiceLines = items
    .map((item, idx) => {
      const rate = item.vat_rate ?? 19;
      return `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${fmt(item.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${fmt(item.line_total ?? 0)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(item.description || 'Artikel')}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${rate > 0 ? 'S' : 'Z'}</cbc:ID>
        <cbc:Percent>${rate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${invoice.currency}">${fmt(item.unit_price ?? 0)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(invoice.invoice_number)}</cbc:ID>
  <cbc:IssueDate>${invoice.invoice_date}</cbc:IssueDate>
  ${invoice.due_date ? `<cbc:DueDate>${invoice.due_date}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>${invoice.invoice_type === 'credit_note' ? '381' : '380'}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(company.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(company.address)}</cbc:StreetName>
        <cbc:CityName>${xmlEscape(company.city)}</cbc:CityName>
        <cbc:PostalZone>${xmlEscape(company.postal_code)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${xmlEscape(company.country || 'DE')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${company.vat_number ? `<cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(company.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(contactName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(contact?.address)}</cbc:StreetName>
        <cbc:CityName>${xmlEscape(contact?.city)}</cbc:CityName>
        <cbc:PostalZone>${xmlEscape(contact?.postal_code)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${xmlEscape(contact?.country || 'DE')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${contact?.vat_number ? `<cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(contact.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${invoice.currency}">${fmt(invoice.vat_amount ?? 0)}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${fmt(invoice.subtotal ?? 0)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${fmt(invoice.subtotal ?? 0)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${fmt(invoice.total ?? 0)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${fmt(invoice.total ?? 0)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${invoiceLines}
</Invoice>`;

  downloadBlob(xml, `XRechnung_${invoice.invoice_number}.xml`, 'application/xml');
}

interface DatevRow {
  date: string;
  amount: number;
  description: string;
  account?: string;
  counterAccount?: string;
  invoiceNumber?: string;
  vatKey?: string;
  contactName?: string;
}

export function exportDatevCSV(rows: DatevRow[], periodFrom: string, periodTo: string) {
  const header = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel',
    'Belegdatum',
    'Belegfeld 1',
    'Buchungstext',
    'Beleginfo - Art 1',
    'Beleginfo - Inhalt 1',
  ];

  const toDdMm = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}${mm}`;
  };

  const body = rows.map((r) => [
    fmt(Math.abs(r.amount)).replace('.', ','),
    r.amount >= 0 ? 'S' : 'H',
    'EUR',
    r.account ?? '',
    r.counterAccount ?? '',
    r.vatKey ?? '',
    toDdMm(r.date),
    r.invoiceNumber ?? '',
    r.description.replace(/[",;]/g, ' ').slice(0, 60),
    r.contactName ? 'Kunde' : '',
    r.contactName ?? '',
  ]);

  const lines = [header, ...body].map((r) => r.map((c) => `"${c}"`).join(';')).join('\r\n');
  const meta = `"EXTF";700;21;"Buchungsstapel";7;;;;"${periodFrom.replace(/-/g, '')}";"${periodTo.replace(/-/g, '')}";"";;;;"EUR";;;;;;;;;;;;;;;\r\n`;
  const content = meta + lines;

  downloadBlob(content, `DATEV_Export_${periodFrom}_${periodTo}.csv`, 'text/csv');
}

export interface UstvaData {
  period: { from: string; to: string };
  revenue19: number;
  revenue7: number;
  revenue0: number;
  vatCollected19: number;
  vatCollected7: number;
  vatPaid: number;
  vatDue: number;
}

export function exportUstvaCSV(data: UstvaData, companyName: string) {
  const lines = [
    `Umsatzsteuer-Voranmeldung - ${companyName}`,
    `Zeitraum: ${data.period.from} bis ${data.period.to}`,
    '',
    'Kennzahl;Bezeichnung;Betrag EUR',
    `81;Umsatze zu 19 % (steuerpflichtig);${fmt(data.revenue19)}`,
    `86;Umsatze zu 7 % (steuerpflichtig);${fmt(data.revenue7)}`,
    `35;Steuerfreie Umsatze;${fmt(data.revenue0)}`,
    `181;Umsatzsteuer 19 %;${fmt(data.vatCollected19)}`,
    `186;Umsatzsteuer 7 %;${fmt(data.vatCollected7)}`,
    `66;Vorsteuer;${fmt(data.vatPaid)}`,
    `83;Verbleibende Umsatzsteuer-Vorauszahlung;${fmt(data.vatDue)}`,
  ].join('\r\n');

  downloadBlob(lines, `UStVA_${data.period.from}_${data.period.to}.csv`, 'text/csv');
}
