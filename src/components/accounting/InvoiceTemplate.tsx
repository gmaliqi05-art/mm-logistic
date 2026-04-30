import type { VatBreakdownRow } from '../../utils/euCompliance';

export interface InvoicePreviewData {
  layout: 'modern' | 'classic' | 'minimal';
  primaryColor: string;
  logoUrl?: string | null;
  language: 'en' | 'de' | 'fr' | 'sq';

  seller: {
    name: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    vat_number?: string;
    tax_number?: string;
    email?: string;
    phone?: string;
    iban?: string;
    bic?: string;
    bank_name?: string;
  };

  buyer: {
    name: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    vat_number?: string;
  };

  invoice: {
    number: string;
    date: string;
    due_date?: string;
    delivery_date?: string;
    currency: string;
    notes?: string;
    payment_reference?: string;
    legal_text?: string;
    type: 'invoice' | 'credit_note' | 'proforma';
  };

  items: Array<{
    description: string;
    product_code?: string;
    quantity: number;
    unit_code: string;
    unit_price: number;
    vat_rate: number;
    discount_amount: number;
    line_total: number;
  }>;

  totals: {
    subtotal: number;
    discount: number;
    vat_total: number;
    total: number;
    vat_breakdown: VatBreakdownRow[];
  };
}

const I18N: Record<string, Record<string, string>> = {
  en: {
    invoice: 'Invoice', credit_note: 'Credit Note', proforma: 'Pro Forma Invoice',
    number: 'Invoice No.', date: 'Issue date', due: 'Due date', delivery: 'Delivery date',
    from: 'From', to: 'Bill to', vat: 'VAT ID', tax: 'Tax No.',
    desc: 'Description', code: 'Code', qty: 'Qty', unit: 'Unit', price: 'Unit price',
    discount: 'Discount', vatCol: 'VAT %', total: 'Total',
    subtotal: 'Subtotal', vatAmount: 'VAT', grandTotal: 'TOTAL DUE',
    paymentTerms: 'Payment terms', ref: 'Payment reference', iban: 'IBAN', bic: 'BIC', bank: 'Bank',
    thanks: 'Thank you for your business.',
  },
  de: {
    invoice: 'Rechnung', credit_note: 'Gutschrift', proforma: 'Proforma-Rechnung',
    number: 'Rechnungsnr.', date: 'Rechnungsdatum', due: 'Faellig am', delivery: 'Lieferdatum',
    from: 'Von', to: 'An', vat: 'USt-IdNr.', tax: 'Steuernummer',
    desc: 'Beschreibung', code: 'Code', qty: 'Menge', unit: 'Einheit', price: 'Einzelpreis',
    discount: 'Rabatt', vatCol: 'MwSt %', total: 'Gesamt',
    subtotal: 'Zwischensumme', vatAmount: 'MwSt', grandTotal: 'GESAMTBETRAG',
    paymentTerms: 'Zahlungsziel', ref: 'Verwendungszweck', iban: 'IBAN', bic: 'BIC', bank: 'Bank',
    thanks: 'Vielen Dank fuer Ihr Vertrauen.',
  },
  fr: {
    invoice: 'Facture', credit_note: 'Avoir', proforma: 'Facture pro forma',
    number: 'No de facture', date: 'Date d\'emission', due: 'Echeance', delivery: 'Date de livraison',
    from: 'De', to: 'Facture a', vat: 'No TVA', tax: 'No fiscal',
    desc: 'Description', code: 'Code', qty: 'Qte', unit: 'Unite', price: 'Prix unitaire',
    discount: 'Remise', vatCol: 'TVA %', total: 'Total',
    subtotal: 'Sous-total', vatAmount: 'TVA', grandTotal: 'TOTAL A PAYER',
    paymentTerms: 'Conditions de paiement', ref: 'Reference de paiement', iban: 'IBAN', bic: 'BIC', bank: 'Banque',
    thanks: 'Merci de votre confiance.',
  },
  sq: {
    invoice: 'Fatura', credit_note: 'Notes krediti', proforma: 'Fatura proforma',
    number: 'Nr. i fatures', date: 'Data e leshimit', due: 'Afati i pageses', delivery: 'Data e dergimit',
    from: 'Nga', to: 'Per', vat: 'Nr. TVSH', tax: 'Nr. tatimor',
    desc: 'Pershkrimi', code: 'Kodi', qty: 'Sasia', unit: 'Njesia', price: 'Cmimi',
    discount: 'Zbritje', vatCol: 'TVSH %', total: 'Totali',
    subtotal: 'Nentotali', vatAmount: 'TVSH', grandTotal: 'PER TU PAGUAR',
    paymentTerms: 'Afati i pageses', ref: 'Referenca', iban: 'IBAN', bic: 'BIC', bank: 'Banka',
    thanks: 'Ju falenderojme.',
  },
};

function formatMoney(value: number, currency: string) {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(safe);
  } catch {
    return `${safe.toFixed(2)} ${currency}`;
  }
}

export default function InvoiceTemplate({ data }: { data: InvoicePreviewData }) {
  const t = I18N[data.language] ?? I18N.en;
  const title = t[data.invoice.type] ?? t.invoice;

  const headerBg = data.layout === 'modern' ? data.primaryColor : 'transparent';
  const headerText = data.layout === 'modern' ? '#ffffff' : data.primaryColor;
  const borderCol = data.primaryColor;

  return (
    <div
      className="bg-white text-slate-900 text-[10px] leading-[1.5]"
      style={{ width: '210mm', minHeight: '297mm', padding: '15mm', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between pb-4 mb-4"
        style={{
          background: headerBg,
          color: headerText,
          borderBottom: data.layout === 'classic' ? `2px solid ${borderCol}` : 'none',
          padding: data.layout === 'modern' ? '14px 18px' : '0 0 10px 0',
          borderRadius: data.layout === 'modern' ? '6px' : 0,
          margin: data.layout === 'modern' ? '-5mm -5mm 6mm -5mm' : '0 0 8mm 0',
        }}
      >
        <div className="flex items-center gap-3">
          {data.logoUrl && (
            <img src={data.logoUrl} alt="" className="h-12 w-auto object-contain bg-white/10 rounded p-1" />
          )}
          <div>
            <div className="text-[18px] font-bold leading-tight">{data.seller.name}</div>
            <div className="opacity-80 text-[9px]">
              {[data.seller.address, data.seller.postal_code, data.seller.city, data.seller.country].filter(Boolean).join(', ')}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-extrabold uppercase tracking-wider">{title}</div>
          <div className="text-[10px] opacity-90 mt-1">
            <span className="font-semibold">{t.number}:</span> {data.invoice.number || '—'}
          </div>
          <div className="text-[10px] opacity-90">
            <span className="font-semibold">{t.date}:</span> {data.invoice.date}
          </div>
          {data.invoice.due_date && (
            <div className="text-[10px] opacity-90">
              <span className="font-semibold">{t.due}:</span> {data.invoice.due_date}
            </div>
          )}
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{t.from}</div>
          <div className="font-semibold">{data.seller.name}</div>
          <div className="whitespace-pre-line text-slate-600">
            {[data.seller.address, `${data.seller.postal_code ?? ''} ${data.seller.city ?? ''}`, data.seller.country].filter((s) => (s ?? '').toString().trim()).join('\n')}
          </div>
          {data.seller.vat_number && <div className="text-slate-600">{t.vat}: {data.seller.vat_number}</div>}
          {data.seller.tax_number && <div className="text-slate-600">{t.tax}: {data.seller.tax_number}</div>}
          {data.seller.email && <div className="text-slate-600">{data.seller.email}</div>}
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{t.to}</div>
          <div className="font-semibold">{data.buyer.name || '—'}</div>
          <div className="whitespace-pre-line text-slate-600">
            {[data.buyer.address, `${data.buyer.postal_code ?? ''} ${data.buyer.city ?? ''}`, data.buyer.country].filter((s) => (s ?? '').toString().trim()).join('\n')}
          </div>
          {data.buyer.vat_number && <div className="text-slate-600">{t.vat}: {data.buyer.vat_number}</div>}
        </div>
      </div>

      {/* Items */}
      <table className="w-full border-collapse mb-3 text-[9.5px]">
        <thead>
          <tr style={{ background: data.primaryColor, color: 'white' }}>
            <th className="text-left font-semibold py-2 px-2">{t.desc}</th>
            <th className="text-right font-semibold py-2 px-2 w-14">{t.qty}</th>
            <th className="text-left font-semibold py-2 px-2 w-14">{t.unit}</th>
            <th className="text-right font-semibold py-2 px-2 w-20">{t.price}</th>
            <th className="text-right font-semibold py-2 px-2 w-14">{t.vatCol}</th>
            <th className="text-right font-semibold py-2 px-2 w-24">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 px-2">
                <div className="font-medium">{it.description || '—'}</div>
                {it.product_code && <div className="text-slate-500 text-[8.5px]">{it.product_code}</div>}
              </td>
              <td className="py-2 px-2 text-right tabular-nums">{it.quantity}</td>
              <td className="py-2 px-2 text-slate-600">{it.unit_code}</td>
              <td className="py-2 px-2 text-right tabular-nums">{formatMoney(it.unit_price, data.invoice.currency)}</td>
              <td className="py-2 px-2 text-right tabular-nums">{it.vat_rate.toFixed(1)}%</td>
              <td className="py-2 px-2 text-right tabular-nums font-semibold">{formatMoney(it.line_total, data.invoice.currency)}</td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-slate-400 py-6">—</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 text-[10px]">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600">{t.subtotal}</span>
            <span className="tabular-nums">{formatMoney(data.totals.subtotal, data.invoice.currency)}</span>
          </div>
          {data.totals.discount > 0 && (
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">{t.discount}</span>
              <span className="tabular-nums">- {formatMoney(data.totals.discount, data.invoice.currency)}</span>
            </div>
          )}
          {data.totals.vat_breakdown.map((b, i) => (
            <div key={i} className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">{t.vatAmount} {b.rate.toFixed(1)}% ({b.category})</span>
              <span className="tabular-nums">{formatMoney(b.vat, data.invoice.currency)}</span>
            </div>
          ))}
          <div
            className="flex justify-between py-2 mt-1 font-extrabold text-[12px]"
            style={{ color: data.primaryColor, borderTop: `2px solid ${data.primaryColor}` }}
          >
            <span>{t.grandTotal}</span>
            <span className="tabular-nums">{formatMoney(data.totals.total, data.invoice.currency)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 grid grid-cols-2 gap-6 text-[9.5px]">
        <div>
          {data.seller.iban && (
            <>
              <div className="font-semibold text-slate-700 mb-1">{t.iban} / {t.bic}</div>
              <div>{t.bank}: {data.seller.bank_name ?? '—'}</div>
              <div>{t.iban}: {data.seller.iban}</div>
              {data.seller.bic && <div>{t.bic}: {data.seller.bic}</div>}
              {data.invoice.payment_reference && <div>{t.ref}: {data.invoice.payment_reference}</div>}
            </>
          )}
        </div>
        <div className="text-slate-600">
          {data.invoice.legal_text && (
            <div className="mb-2 italic">{data.invoice.legal_text}</div>
          )}
          {data.invoice.notes && <div className="whitespace-pre-line">{data.invoice.notes}</div>}
          <div className="mt-3 text-slate-400">{t.thanks}</div>
        </div>
      </div>
    </div>
  );
}
