import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2, FileCode2, FileText, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { logger } from '../../utils/logger';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import InvoiceTemplate, { type InvoicePreviewData } from '../../components/accounting/InvoiceTemplate';
import { buildVatBreakdown } from '../../utils/euCompliance';

export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [previewData, setPreviewData] = useState<InvoicePreviewData | null>(null);
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

      const inv = invoiceRes.data as any;
      const co = companyRes.data as any;

      if (!inv || !co) return;

      const lang = (inv.language_code || detectLanguage(co.country)) as 'en' | 'de' | 'fr' | 'sq';
      const bank = inv.bank_account;
      const contact = inv.contact;
      const items = (inv.items || []) as any[];

      const vatBreakdown = buildVatBreakdown(
        items.map((it: any) => ({
          net: Number(it.line_total ?? 0),
          vat_rate: Number(it.vat_rate ?? 0),
          vat_category: 'S',
        }))
      );

      const data: InvoicePreviewData = {
        language: lang,
        logoUrl: co.logo_url || null,
        seller: {
          name: co.name || '',
          address: co.address || '',
          postal_code: co.postal_code || '',
          city: co.city || '',
          country: co.country || '',
          vat_number: co.vat_number || '',
          tax_number: co.tax_number || '',
          email: co.email || '',
          phone: co.phone || '',
          iban: bank?.iban || '',
          bic: bank?.bic || '',
          bank_name: bank?.bank_name || '',
        },
        buyer: {
          name: contact?.name || '',
          address: contact?.address || '',
          postal_code: contact?.postal_code || '',
          city: contact?.city || '',
          country: contact?.country || '',
          vat_number: contact?.vat_number || '',
        },
        invoice: {
          number: inv.invoice_number || '',
          date: formatDate(inv.invoice_date, lang),
          due_date: inv.due_date ? formatDate(inv.due_date, lang) : undefined,
          delivery_date: inv.delivery_date ? formatDate(inv.delivery_date, lang) : undefined,
          currency: inv.currency || 'EUR',
          notes: inv.notes || '',
          payment_reference: inv.payment_reference || '',
          legal_text: co.invoice_footer_text || '',
          type: (inv.invoice_type as 'invoice' | 'credit_note' | 'proforma') || 'invoice',
        },
        items: items.map((it: any) => ({
          description: it.description || '',
          product_code: it.product?.sku || '',
          quantity: Number(it.quantity ?? 0),
          unit_code: it.unit || 'pcs',
          unit_price: Number(it.unit_price ?? 0),
          vat_rate: Number(it.vat_rate ?? 0),
          discount_amount: Number(it.line_discount ?? 0),
          line_total: Number(it.line_total ?? 0),
        })),
        totals: {
          subtotal: Number(inv.subtotal ?? 0),
          discount: Number(inv.discount ?? 0),
          vat_total: Number(inv.vat_amount ?? 0),
          total: Number(inv.total ?? 0),
          vat_breakdown: vatBreakdown,
        },
      };

      setPreviewData(data);
    } catch (err: any) {
      logger.error('Error loading invoice for print', { error: err });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <PageSkeleton rows={6} cols={4} showStats={false} />
    );
  }

  if (!previewData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-gray-500 text-lg">Fatura nuk u gjet</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kthehu
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
          .print-wrapper { box-shadow: none !important; margin: 0 !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-[210mm] mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kthehu
          </button>
          <div className="flex items-center gap-2">
            <EInvoiceButtons invoiceId={id ?? ''} />
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Printo
            </button>
          </div>
        </div>
      </div>

      <div className="print-wrapper max-w-[210mm] mx-auto bg-white shadow-lg my-8">
        <InvoiceTemplate data={previewData} />
      </div>
    </>
  );
}

function detectLanguage(country?: string | null): 'en' | 'de' | 'fr' | 'sq' {
  if (!country) return 'en';
  const c = country.toUpperCase().trim();
  if (['DE', 'AT', 'CH'].includes(c)) return 'de';
  if (['FR', 'BE', 'LU'].includes(c)) return 'fr';
  if (['AL', 'XK', 'MK'].includes(c)) return 'sq';
  return 'en';
}

function formatDate(dateStr: string, lang: string) {
  try {
    const locale = lang === 'de' ? 'de-DE' : lang === 'fr' ? 'fr-FR' : lang === 'sq' ? 'sq-AL' : 'en-GB';
    return new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function EInvoiceButtons({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = useState<'xrechnung' | 'zugferd' | null>(null);
  const [result, setResult] = useState<{ status: 'valid' | 'invalid' | 'pending'; errors: Array<{ field: string; message: string }>; xml_url: string | null; pdf_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (format: 'xrechnung' | 'zugferd') => {
    if (!invoiceId) return;
    try {
      setBusy(format);
      setError(null);
      setResult(null);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-einvoice`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ invoice_id: invoiceId, format }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Generation failed');
      setResult({
        status: json.validation.status,
        errors: json.validation.errors,
        xml_url: json.xml_url,
        pdf_url: json.pdf_url,
      });
      const url = format === 'xrechnung' ? json.xml_url : json.pdf_url;
      if (url) window.open(url as string, '_blank');
    } catch (err) {
      logger.error('e-invoice button failed', { error: err });
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleGenerate('xrechnung')}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        {busy === 'xrechnung' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
        XRechnung
      </button>
      <button
        onClick={() => handleGenerate('zugferd')}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        {busy === 'zugferd' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        ZUGFeRD
      </button>
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
          <AlertTriangle className="w-3 h-3" /> {error}
        </span>
      )}
      {result && result.status === 'invalid' && (
        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded" title={result.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}>
          <AlertTriangle className="w-3 h-3" /> {result.errors.length} issue(s)
        </span>
      )}
      {result && result.status === 'valid' && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 className="w-3 h-3" /> valid
        </span>
      )}
      {result && (result.xml_url || result.pdf_url) && (
        <a
          href={(result.pdf_url || result.xml_url) as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <Download className="w-3 h-3" /> Download
        </a>
      )}
    </div>
  );
}
