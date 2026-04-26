import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  AccContact,
  AccBankAccount,
  AccCurrency,
} from '../../types/accounting';
import { formatCurrency, formatNumber } from '../../types/accounting';

interface Company {
  id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  vat_number: string;
  tax_number: string;
  phone: string;
  email: string;
  logo_url: string;
}

interface InvoiceItemWithProduct {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_discount: number;
  line_total: number;
  product?: {
    name: string;
    image_url: string;
    sku: string;
  } | null;
}

interface InvoiceWithRelations {
  id: string;
  invoice_number: string;
  invoice_type: string;
  invoice_date: string;
  due_date: string | null;
  currency: AccCurrency;
  subtotal: number;
  vat_amount: number;
  total: number;
  discount: number;
  notes: string;
  items: InvoiceItemWithProduct[];
  contact?: AccContact | null;
  bank_account?: AccBankAccount | null;
}

export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.company_id && id) fetchData();
  }, [profile?.company_id, id]);

  async function fetchData() {
    try {
      setLoading(true);
      const companyId = profile!.company_id!;

      const [invoiceRes, companyRes] = await Promise.all([
        supabase
          .from('acc_invoices')
          .select(
            '*, items:acc_invoice_items(*, product:acc_products(name, image_url, sku)), contact:acc_contacts(*), bank_account:acc_bank_accounts(*)'
          )
          .eq('id', id!)
          .maybeSingle(),
        supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
      ]);

      if (invoiceRes.error) throw invoiceRes.error;
      if (companyRes.error) throw companyRes.error;

      setInvoice(invoiceRes.data as InvoiceWithRelations | null);
      setCompany(companyRes.data as Company | null);
    } catch (err: any) {
      console.error('Error loading invoice:', err.message);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const vatGroups = useMemo(() => {
    if (!invoice?.items) return {};
    const groups: Record<number, number> = {};
    for (const item of invoice.items) {
      const vatAmount = (item.line_total * item.vat_rate) / 100;
      if (item.vat_rate > 0) {
        groups[item.vat_rate] = (groups[item.vat_rate] || 0) + vatAmount;
      }
    }
    return groups;
  }, [invoice?.items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-gray-500 text-lg">Rechnung nicht gefunden</p>
        <button
          onClick={() => navigate('/accounting/invoices')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück zu Rechnungen
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; padding: 20mm !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-[210mm] mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/accounting/invoices')}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Drucken
          </button>
        </div>
      </div>

      <div className="print-page max-w-[210mm] min-h-[297mm] mx-auto bg-white shadow-lg my-8 p-[20mm] text-[11px] leading-[1.5] text-gray-900 font-sans">
        <div className="flex items-start justify-between mb-8">
          <div className="flex-1">
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt={company.name}
                style={{ height: '60px' }}
                className="object-contain mb-2"
              />
            )}
          </div>
          {company && (
            <div className="text-right text-[10px] text-gray-600 leading-[1.6]">
              <p className="font-semibold text-gray-900 text-[12px]">{company.name}</p>
              {company.address && <p>{company.address}</p>}
              {(company.postal_code || company.city) && (
                <p>
                  {company.postal_code} {company.city}
                </p>
              )}
              {company.country && <p>{company.country}</p>}
              {company.phone && <p>Tel: {company.phone}</p>}
              {company.email && <p>{company.email}</p>}
              {company.vat_number && <p>USt-IdNr.: {company.vat_number}</p>}
              {company.tax_number && <p>Steuernummer: {company.tax_number}</p>}
            </div>
          )}
        </div>

        <div className="text-[7px] text-gray-400 border-b border-gray-300 pb-0.5 mb-1 max-w-[85mm]">
          {company
            ? `${company.name} · ${company.address || ''} · ${company.postal_code || ''} ${company.city || ''}`
            : ''}
        </div>

        <div className="min-h-[27.5mm] mb-8 max-w-[85mm]">
          {invoice.contact && (
            <div className="text-[11px] leading-[1.6]">
              <p className="font-medium">{invoice.contact.name}</p>
              {invoice.contact.address && <p>{invoice.contact.address}</p>}
              {(invoice.contact.postal_code || invoice.contact.city) && (
                <p>
                  {invoice.contact.postal_code} {invoice.contact.city}
                </p>
              )}
              {invoice.contact.country && <p>{invoice.contact.country}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end mb-6">
          <div className="text-right text-[11px] leading-[1.8]">
            <p>
              <span className="text-gray-500">Rechnungsnummer:</span>{' '}
              <span className="font-semibold">{invoice.invoice_number}</span>
            </p>
            <p>
              <span className="text-gray-500">Rechnungsdatum:</span>{' '}
              {formatDate(invoice.invoice_date)}
            </p>
            {invoice.due_date && (
              <p>
                <span className="text-gray-500">Fälligkeitsdatum:</span>{' '}
                {formatDate(invoice.due_date)}
              </p>
            )}
          </div>
        </div>

        <h2 className="text-[14px] font-bold mb-4">
          {invoice.invoice_type === 'credit_note'
            ? 'Gutschrift'
            : invoice.invoice_type === 'proforma'
              ? 'Proformarechnung'
              : 'Rechnung'}{' '}
          {invoice.invoice_number}
        </h2>

        <table className="w-full mb-6 border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-2 pr-2 text-[10px] font-semibold text-gray-600 w-[30px]">
                Pos.
              </th>
              <th className="text-left py-2 pr-2 text-[10px] font-semibold text-gray-600 w-[30px]" />
              <th className="text-left py-2 pr-2 text-[10px] font-semibold text-gray-600">
                Beschreibung
              </th>
              <th className="text-right py-2 pr-2 text-[10px] font-semibold text-gray-600 w-[50px]">
                Menge
              </th>
              <th className="text-left py-2 pr-2 text-[10px] font-semibold text-gray-600 w-[40px]">
                Einheit
              </th>
              <th className="text-right py-2 pr-2 text-[10px] font-semibold text-gray-600 w-[70px]">
                Einzelpreis
              </th>
              <th className="text-right py-2 pr-2 text-[10px] font-semibold text-gray-600 w-[45px]">
                MwSt.
              </th>
              <th className="text-right py-2 text-[10px] font-semibold text-gray-600 w-[75px]">
                Gesamt
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item, idx) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2 pr-2 text-gray-500 align-top">{idx + 1}</td>
                <td className="py-2 pr-2 align-top">
                  {item.product?.image_url && (
                    <img
                      src={item.product.image_url}
                      alt=""
                      className="w-[30px] h-[30px] object-cover rounded"
                    />
                  )}
                </td>
                <td className="py-2 pr-2 align-top">
                  <p className="font-medium">{item.description}</p>
                  {item.product?.sku && (
                    <p className="text-[9px] text-gray-400">Art.-Nr.: {item.product.sku}</p>
                  )}
                </td>
                <td className="py-2 pr-2 text-right align-top">
                  {formatNumber(item.quantity)}
                </td>
                <td className="py-2 pr-2 align-top">{item.unit}</td>
                <td className="py-2 pr-2 text-right align-top">
                  {formatCurrency(item.unit_price, invoice.currency)}
                </td>
                <td className="py-2 pr-2 text-right align-top">{item.vat_rate}%</td>
                <td className="py-2 text-right align-top font-medium">
                  {formatCurrency(item.line_total, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <div className="w-[250px]">
            <div className="flex justify-between py-1 text-[11px]">
              <span className="text-gray-600">Nettobetrag:</span>
              <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {Object.entries(vatGroups).map(([rate, amount]) => (
              <div key={rate} className="flex justify-between py-1 text-[11px]">
                <span className="text-gray-600">MwSt. {rate}%:</span>
                <span>{formatCurrency(amount, invoice.currency)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t-2 border-gray-900 mt-1 text-[12px] font-bold">
              <span>Gesamtbetrag:</span>
              <span>{formatCurrency(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mb-8">
            <p className="text-[10px] font-semibold text-gray-600 mb-1">Hinweise:</p>
            <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {invoice.bank_account && (
          <div className="border-t border-gray-300 pt-4 mt-auto">
            <p className="text-[10px] font-semibold text-gray-600 mb-1">Bankverbindung:</p>
            <div className="text-[10px] text-gray-600 leading-[1.6]">
              {invoice.bank_account.bank_name && (
                <p>Bank: {invoice.bank_account.bank_name}</p>
              )}
              {invoice.bank_account.iban && <p>IBAN: {invoice.bank_account.iban}</p>}
              {invoice.bank_account.bic && <p>BIC: {invoice.bank_account.bic}</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
