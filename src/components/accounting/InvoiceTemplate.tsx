import type { VatBreakdownRow } from '../../utils/euCompliance';

export interface InvoicePreviewData {
  language: 'en' | 'de' | 'fr' | 'sq';
  logoUrl?: string | null;

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
    number: 'Invoice No.', date: 'Date', due: 'Due date', delivery: 'Delivery date',
    from: 'From', to: 'Bill to', vat: 'VAT ID', tax: 'Tax No.',
    pos: 'Pos.', desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price',
    vatCol: 'VAT', total: 'Amount',
    subtotal: 'Net total', discount: 'Discount', vatAmount: 'VAT', grandTotal: 'Total',
    bankInfo: 'Bank details', ref: 'Payment reference', iban: 'IBAN', bic: 'BIC', bank: 'Bank',
    notes: 'Notes', thanks: 'Thank you for your business.',
  },
  de: {
    invoice: 'Rechnung', credit_note: 'Gutschrift', proforma: 'Proforma-Rechnung',
    number: 'Rechnungsnr.', date: 'Rechnungsdatum', due: 'Fälligkeitsdatum', delivery: 'Lieferdatum',
    from: 'Von', to: 'An', vat: 'USt-IdNr.', tax: 'Steuernummer',
    pos: 'Pos.', desc: 'Beschreibung', qty: 'Menge', unit: 'Einheit', price: 'Einzelpreis',
    vatCol: 'MwSt.', total: 'Gesamt',
    subtotal: 'Nettobetrag', discount: 'Rabatt', vatAmount: 'MwSt.', grandTotal: 'Gesamtbetrag',
    bankInfo: 'Bankverbindung', ref: 'Verwendungszweck', iban: 'IBAN', bic: 'BIC', bank: 'Bank',
    notes: 'Hinweise', thanks: 'Vielen Dank für Ihr Vertrauen.',
  },
  fr: {
    invoice: 'Facture', credit_note: 'Avoir', proforma: 'Facture pro forma',
    number: 'N° de facture', date: "Date d'émission", due: 'Échéance', delivery: 'Date de livraison',
    from: 'De', to: 'Facturer à', vat: 'N° TVA', tax: 'N° fiscal',
    pos: 'Pos.', desc: 'Description', qty: 'Qté', unit: 'Unité', price: 'Prix unitaire',
    vatCol: 'TVA', total: 'Total',
    subtotal: 'Sous-total HT', discount: 'Remise', vatAmount: 'TVA', grandTotal: 'Total TTC',
    bankInfo: 'Coordonnées bancaires', ref: 'Référence de paiement', iban: 'IBAN', bic: 'BIC', bank: 'Banque',
    notes: 'Remarques', thanks: 'Merci de votre confiance.',
  },
  sq: {
    invoice: 'Faturë', credit_note: 'Notë krediti', proforma: 'Faturë proforma',
    number: 'Nr. i faturës', date: 'Data e lëshimit', due: 'Afati i pagesës', delivery: 'Data e dërgesës',
    from: 'Nga', to: 'Për', vat: 'Nr. TVSH', tax: 'Nr. tatimor',
    pos: 'Nr.', desc: 'Përshkrimi', qty: 'Sasia', unit: 'Njësia', price: 'Çmimi',
    vatCol: 'TVSH', total: 'Totali',
    subtotal: 'Nëntotali', discount: 'Zbritje', vatAmount: 'TVSH', grandTotal: 'Totali për pagesë',
    bankInfo: 'Të dhënat bankare', ref: 'Referenca', iban: 'IBAN', bic: 'BIC', bank: 'Banka',
    notes: 'Shënime', thanks: 'Ju falënderojmë për besimin tuaj.',
  },
};

function localeTagFor(lang: 'en' | 'de' | 'fr' | 'sq'): string {
  switch (lang) {
    case 'sq': return 'sq-AL';
    case 'en': return 'en-GB';
    case 'fr': return 'fr-FR';
    case 'de':
    default:   return 'de-DE';
  }
}

function formatMoney(value: number, currency: string, lang: 'en' | 'de' | 'fr' | 'sq' = 'de') {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(localeTagFor(lang), { style: 'currency', currency }).format(safe);
  } catch {
    return `${safe.toFixed(2)} ${currency}`;
  }
}

function formatQty(value: number, lang: 'en' | 'de' | 'fr' | 'sq' = 'de') {
  return new Intl.NumberFormat(localeTagFor(lang), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

export default function InvoiceTemplate({ data }: { data: InvoicePreviewData }) {
  const t = I18N[data.language] ?? I18N.en;
  const title = t[data.invoice.type] ?? t.invoice;

  const sellerLine = [data.seller.address, `${data.seller.postal_code ?? ''} ${data.seller.city ?? ''}`.trim(), data.seller.country]
    .filter((s) => (s ?? '').trim())
    .join(' · ');

  return (
    <div
      className="bg-white text-gray-900"
      style={{ width: '210mm', minHeight: '297mm', padding: '20mm', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: '10px', lineHeight: '1.6' }}
    >
      {/* Sender line (small, above buyer address - DIN 5008 style) */}
      <div className="text-[7.5px] text-gray-400 border-b border-gray-300 pb-0.5 mb-1 max-w-[85mm]">
        {data.seller.name}{sellerLine ? ` · ${sellerLine}` : ''}
      </div>

      {/* Buyer address block (DIN 5008 position) */}
      <div className="min-h-[27.5mm] mb-6 max-w-[85mm]">
        <div className="text-[11px] leading-[1.6]">
          <p className="font-semibold">{data.buyer.name || '—'}</p>
          {data.buyer.address && <p>{data.buyer.address}</p>}
          {(data.buyer.postal_code || data.buyer.city) && (
            <p>{[data.buyer.postal_code, data.buyer.city].filter(Boolean).join(' ')}</p>
          )}
          {data.buyer.country && <p>{data.buyer.country}</p>}
          {data.buyer.vat_number && <p className="text-gray-500 text-[9.5px]">{t.vat}: {data.buyer.vat_number}</p>}
        </div>
      </div>

      {/* Header: Logo + Company info (right aligned) + Invoice metadata */}
      <div className="flex items-start justify-between mb-8">
        <div>
          {data.logoUrl && (
            <img src={data.logoUrl} alt="" className="h-14 w-auto object-contain mb-3" />
          )}
          <div className="text-[10px] text-gray-600 leading-[1.6]">
            <p className="font-semibold text-gray-900 text-[12px]">{data.seller.name}</p>
            {data.seller.address && <p>{data.seller.address}</p>}
            {(data.seller.postal_code || data.seller.city) && (
              <p>{[data.seller.postal_code, data.seller.city].filter(Boolean).join(' ')}</p>
            )}
            {data.seller.country && <p>{data.seller.country}</p>}
            {data.seller.phone && <p>Tel: {data.seller.phone}</p>}
            {data.seller.email && <p>{data.seller.email}</p>}
            {data.seller.vat_number && <p>{t.vat}: {data.seller.vat_number}</p>}
            {data.seller.tax_number && <p>{t.tax}: {data.seller.tax_number}</p>}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] leading-[1.8]">
            <p>
              <span className="text-gray-500">{t.number}:</span>{' '}
              <span className="font-bold">{data.invoice.number || '—'}</span>
            </p>
            <p>
              <span className="text-gray-500">{t.date}:</span>{' '}
              {data.invoice.date}
            </p>
            {data.invoice.due_date && (
              <p>
                <span className="text-gray-500">{t.due}:</span>{' '}
                {data.invoice.due_date}
              </p>
            )}
            {data.invoice.delivery_date && (
              <p>
                <span className="text-gray-500">{t.delivery}:</span>{' '}
                {data.invoice.delivery_date}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-[15px] font-bold mb-4 border-b-2 border-gray-900 pb-2">
        {title} {data.invoice.number}
      </h1>

      {/* Items table */}
      <table className="w-full border-collapse mb-4 text-[10px]">
        <thead>
          <tr className="border-b-2 border-gray-900">
            <th className="text-left font-semibold py-2 pr-2 text-gray-600 w-[30px]">{t.pos}</th>
            <th className="text-left font-semibold py-2 pr-2 text-gray-600">{t.desc}</th>
            <th className="text-right font-semibold py-2 pr-2 text-gray-600 w-[50px]">{t.qty}</th>
            <th className="text-left font-semibold py-2 pr-2 text-gray-600 w-[40px]">{t.unit}</th>
            <th className="text-right font-semibold py-2 pr-2 text-gray-600 w-[75px]">{t.price}</th>
            <th className="text-right font-semibold py-2 pr-2 text-gray-600 w-[45px]">{t.vatCol}</th>
            <th className="text-right font-semibold py-2 text-gray-600 w-[80px]">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-2 pr-2 text-gray-500 align-top">{i + 1}</td>
              <td className="py-2 pr-2 align-top">
                <span className="font-medium">{it.description || '—'}</span>
                {it.product_code && <span className="block text-[8.5px] text-gray-400">{it.product_code}</span>}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums align-top">{formatQty(it.quantity, data.language)}</td>
              <td className="py-2 pr-2 text-gray-600 align-top">{it.unit_code}</td>
              <td className="py-2 pr-2 text-right tabular-nums align-top">{formatMoney(it.unit_price, data.invoice.currency, data.language)}</td>
              <td className="py-2 pr-2 text-right tabular-nums align-top">{it.vat_rate}%</td>
              <td className="py-2 text-right tabular-nums font-medium align-top">{formatMoney(it.line_total, data.invoice.currency, data.language)}</td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr><td colSpan={7} className="text-center text-gray-400 py-6">—</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-[250px] text-[11px]">
          <div className="flex justify-between py-1">
            <span className="text-gray-600">{t.subtotal}:</span>
            <span className="tabular-nums">{formatMoney(data.totals.subtotal, data.invoice.currency, data.language)}</span>
          </div>
          {data.totals.discount > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-gray-600">{t.discount}:</span>
              <span className="tabular-nums">- {formatMoney(data.totals.discount, data.invoice.currency, data.language)}</span>
            </div>
          )}
          {data.totals.vat_breakdown.map((b, i) => (
            <div key={i} className="flex justify-between py-1">
              <span className="text-gray-600">{t.vatAmount} {b.rate}%:</span>
              <span className="tabular-nums">{formatMoney(b.vat, data.invoice.currency, data.language)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t-2 border-gray-900 mt-1 font-bold text-[12px]">
            <span>{t.grandTotal}:</span>
            <span className="tabular-nums">{formatMoney(data.totals.total, data.invoice.currency, data.language)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {data.invoice.notes && (
        <div className="mb-6">
          <p className="text-[9.5px] font-semibold text-gray-600 mb-1">{t.notes}:</p>
          <p className="text-[10px] text-gray-700 whitespace-pre-wrap">{data.invoice.notes}</p>
        </div>
      )}

      {/* Bank info + Legal text */}
      <div className="border-t border-gray-300 pt-4 mt-auto">
        <div className="grid grid-cols-2 gap-6 text-[9.5px]">
          <div>
            {data.seller.iban && (
              <>
                <p className="font-semibold text-gray-700 mb-1">{t.bankInfo}</p>
                {data.seller.bank_name && <p>{t.bank}: {data.seller.bank_name}</p>}
                <p>{t.iban}: {data.seller.iban}</p>
                {data.seller.bic && <p>{t.bic}: {data.seller.bic}</p>}
                {data.invoice.payment_reference && <p>{t.ref}: {data.invoice.payment_reference}</p>}
              </>
            )}
          </div>
          <div className="text-gray-600">
            {data.invoice.legal_text && (
              <p className="mb-2 italic text-[9px]">{data.invoice.legal_text}</p>
            )}
            <p className="mt-2 text-gray-400">{t.thanks}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
