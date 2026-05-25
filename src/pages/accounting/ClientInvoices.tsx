import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Search,
  Loader2,
  AlertTriangle,
  X,
  FileText,
  Eye,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  Receipt,
  ArrowLeft,
  Download,
  ScanLine,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import { formatCurrency, formatNumber, type AccCurrency } from '../../types/accounting';

interface Contact {
  id: string;
  name: string;
  contact_type: 'customer' | 'supplier' | 'both';
  vat_number: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  invoice_type: string | null;
  document_url: string | null;
  document_mime: string | null;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  vat_rate: number;
  line_total: number;
}

interface ScannedDoc {
  id: string;
  storage_path: string;
  file_mime: string | null;
}

const statusBadge: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function ClientInvoices() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invoiceCounts, setInvoiceCounts] = useState<Record<string, { count: number; total: number }>>({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactInvoices, setContactInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewItems, setPreviewItems] = useState<InvoiceItem[]>([]);
  const [previewScan, setPreviewScan] = useState<string | null>(null);
  const [previewScanMime, setPreviewScanMime] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const { data: contactsData, error: cErr } = await supabase
        .from('acc_contacts')
        .select('id, name, contact_type, vat_number, address, city, country, email, phone, is_active')
        .eq('company_id', companyId)
        .order('name');
      if (cErr) throw cErr;

      const { data: invData, error: iErr } = await supabase
        .from('acc_invoices')
        .select('contact_id, total')
        .eq('company_id', companyId);
      if (iErr) throw iErr;

      const counts: Record<string, { count: number; total: number }> = {};
      for (const row of invData || []) {
        if (!row.contact_id) continue;
        if (!counts[row.contact_id]) counts[row.contact_id] = { count: 0, total: 0 };
        counts[row.contact_id].count += 1;
        counts[row.contact_id].total += Number(row.total) || 0;
      }

      setContacts(contactsData || []);
      setInvoiceCounts(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function openContact(c: Contact) {
    setSelectedContact(c);
    setLoadingInvoices(true);
    try {
      const { data, error: err } = await supabase
        .from('acc_invoices')
        .select('id, invoice_number, invoice_date, due_date, status, subtotal, vat_amount, total, currency, notes, invoice_type, document_url, document_mime')
        .eq('company_id', profile!.company_id!)
        .eq('contact_id', c.id)
        .order('invoice_date', { ascending: false });
      if (err) throw err;
      setContactInvoices(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoadingInvoices(false);
    }
  }

  async function openPreview(inv: Invoice) {
    setPreviewInvoice(inv);
    setLoadingPreview(true);
    setPreviewScan(null);
    setPreviewScanMime(null);
    try {
      const { data: items, error: iErr } = await supabase
        .from('acc_invoice_items')
        .select('id, description, quantity, unit, unit_price, vat_rate, line_total')
        .eq('invoice_id', inv.id)
        .order('created_at');
      if (iErr) throw iErr;
      setPreviewItems(items || []);

      const { data: scan } = await supabase
        .from('acc_scanned_documents')
        .select('id, storage_path, file_mime')
        .eq('company_id', profile!.company_id!)
        .eq('linked_entity_type', 'invoice')
        .eq('linked_entity_id', inv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const scanRow = scan as ScannedDoc | null;
      if (scanRow?.storage_path) {
        const { data: signed } = await supabase.storage
          .from('acc-scans')
          .createSignedUrl(scanRow.storage_path, 3600);
        if (signed?.signedUrl) {
          setPreviewScan(signed.signedUrl);
          setPreviewScanMime(scanRow.file_mime);
        }
      } else if (inv.document_url) {
        setPreviewScan(inv.document_url);
        setPreviewScanMime(inv.document_mime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoadingPreview(false);
    }
  }

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (typeFilter !== 'all' && c.contact_type !== typeFilter && c.contact_type !== 'both') return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.vat_number || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q)
      );
    });
  }, [contacts, typeFilter, search]);

  if (loading) {
    return <PageSkeleton rows={8} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('clientInvoices.title')}</h1>
        <p className="text-slate-500 mt-1">{t('clientInvoices.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('clientInvoices.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'customer', 'supplier'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTypeFilter(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  typeFilter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(`clientInvoices.filter.${v}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('clientInvoices.company')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{t('clientInvoices.vatNumber')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('clientInvoices.location')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('clientInvoices.invoices')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{t('clientInvoices.totalAmount')}</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    {t('clientInvoices.noContacts')}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const stats = invoiceCounts[c.id] || { count: 0, total: 0 };
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openContact(c)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-teal-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{c.name}</p>
                            <p className="text-xs text-slate-500 capitalize">
                              {t(`clientInvoices.types.${c.contact_type}`)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono hidden md:table-cell">
                        {c.vat_number || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 hidden lg:table-cell">
                        {[c.city, c.country].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900 text-right">
                        {stats.count}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900 text-right hidden sm:table-cell">
                        {formatNumber(stats.total)}
                      </td>
                      <td className="px-3 py-4">
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedContact && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSelectedContact(null)} />
          <div className="relative bg-white w-full max-w-2xl shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <button
                  onClick={() => setSelectedContact(null)}
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  <ArrowLeft className="w-4 h-4" /> {t('common.back')}
                </button>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-teal-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-900">{selectedContact.name}</h2>
                  {selectedContact.vat_number && (
                    <p className="text-sm text-slate-500 font-mono">VAT: {selectedContact.vat_number}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-600">
                    {selectedContact.address && (
                      <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{[selectedContact.address, selectedContact.city].filter(Boolean).join(', ')}</span>
                    )}
                    {selectedContact.email && (
                      <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{selectedContact.email}</span>
                    )}
                    {selectedContact.phone && (
                      <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{selectedContact.phone}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('clientInvoices.invoicesFor')} {selectedContact.name}</h3>
              {loadingInvoices ? (
                <div className="py-12 text-center"><Loader2 className="w-8 h-8 mx-auto text-teal-600 animate-spin" /></div>
              ) : contactInvoices.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">{t('clientInvoices.noInvoices')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contactInvoices.map((inv) => {
                    const fromScan = !!inv.document_url;
                    return (
                      <div key={inv.id} className="border border-slate-200 rounded-xl p-4 hover:border-teal-300 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-900">{inv.invoice_number}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge[inv.status] || 'bg-slate-100 text-slate-700'}`}>
                                {t(`clientInvoices.status.${inv.status}`)}
                              </span>
                              {fromScan && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700">
                                  <ScanLine className="w-3 h-3" /> {t('clientInvoices.fromScan')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {new Date(inv.invoice_date).toLocaleDateString()}{inv.due_date ? ` · ${t('clientInvoices.due')}: ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-bold text-slate-900">{formatCurrency(inv.total, inv.currency as AccCurrency)}</p>
                            <button
                              onClick={() => openPreview(inv)}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
                            >
                              <Eye className="w-3.5 h-3.5" /> {t('clientInvoices.preview')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/70 overflow-y-auto">
          <div className="min-h-screen p-4 sm:p-6">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4 text-white">
                <div>
                  <h3 className="text-lg font-bold">{previewInvoice.invoice_number}</h3>
                  <p className="text-sm text-slate-300">{selectedContact?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {previewScan && (
                    <a
                      href={previewScan}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg"
                    >
                      <Download className="w-4 h-4" /> {t('clientInvoices.downloadScan')}
                    </a>
                  )}
                  <button
                    onClick={() => setPreviewInvoice(null)}
                    className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {loadingPreview ? (
                <div className="py-20 text-center"><Loader2 className="w-10 h-10 mx-auto text-white animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white shadow-2xl" style={{ aspectRatio: '210 / 297' }}>
                    <div className="h-full w-full p-10 flex flex-col text-slate-900 text-[13px] leading-relaxed overflow-hidden">
                      <div className="flex items-start justify-between pb-4 border-b-2 border-teal-600">
                        <div>
                          <h1 className="text-2xl font-bold">{t('clientInvoices.invoice')}</h1>
                          <p className="text-sm text-slate-500 mt-1">{previewInvoice.invoice_number}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{t('clientInvoices.invoiceDate')}</p>
                          <p className="font-semibold">{new Date(previewInvoice.invoice_date).toLocaleDateString()}</p>
                          {previewInvoice.due_date && (
                            <>
                              <p className="text-xs text-slate-500 mt-2">{t('clientInvoices.dueDate')}</p>
                              <p className="font-semibold">{new Date(previewInvoice.due_date).toLocaleDateString()}</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-5">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">{t('clientInvoices.billedTo')}</p>
                        <p className="font-semibold">{selectedContact?.name}</p>
                        {selectedContact?.address && (
                          <p className="text-xs text-slate-600">{[selectedContact.address, selectedContact.city, selectedContact.country].filter(Boolean).join(', ')}</p>
                        )}
                        {selectedContact?.vat_number && (
                          <p className="text-xs text-slate-600">VAT: {selectedContact.vat_number}</p>
                        )}
                      </div>

                      <div className="mt-6 flex-1 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left bg-slate-50">
                              <th className="px-2 py-2 font-semibold">{t('clientInvoices.description')}</th>
                              <th className="px-2 py-2 font-semibold text-right">{t('clientInvoices.qty')}</th>
                              <th className="px-2 py-2 font-semibold text-right">{t('clientInvoices.unitPrice')}</th>
                              <th className="px-2 py-2 font-semibold text-right">{t('clientInvoices.vat')}</th>
                              <th className="px-2 py-2 font-semibold text-right">{t('clientInvoices.total')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {previewItems.map((it) => (
                              <tr key={it.id}>
                                <td className="px-2 py-2">{it.description}</td>
                                <td className="px-2 py-2 text-right">{it.quantity} {it.unit || ''}</td>
                                <td className="px-2 py-2 text-right">{formatNumber(Number(it.unit_price))}</td>
                                <td className="px-2 py-2 text-right">{Number(it.vat_rate).toFixed(0)}%</td>
                                <td className="px-2 py-2 text-right font-medium">{formatNumber(Number(it.line_total))}</td>
                              </tr>
                            ))}
                            {previewItems.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-2 py-6 text-center text-slate-400">{t('common.noData')}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-auto pt-4 border-t border-slate-200">
                        <div className="flex justify-end">
                          <div className="w-64 space-y-1 text-sm">
                            <div className="flex justify-between text-slate-600">
                              <span>{t('clientInvoices.subtotal')}</span>
                              <span>{formatCurrency(Number(previewInvoice.subtotal), previewInvoice.currency as AccCurrency)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>{t('clientInvoices.vat')}</span>
                              <span>{formatCurrency(Number(previewInvoice.vat_amount), previewInvoice.currency as AccCurrency)}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold border-t pt-1">
                              <span>{t('clientInvoices.total')}</span>
                              <span>{formatCurrency(Number(previewInvoice.total), previewInvoice.currency as AccCurrency)}</span>
                            </div>
                          </div>
                        </div>
                        {previewInvoice.notes && (
                          <p className="text-[11px] text-slate-500 mt-3 italic">{previewInvoice.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800 shadow-2xl rounded-sm" style={{ aspectRatio: '210 / 297' }}>
                    {previewScan ? (
                      <div className="w-full h-full overflow-hidden">
                        {previewScanMime === 'application/pdf' ? (
                          <iframe src={previewScan} className="w-full h-full bg-white" title="Scanned document" />
                        ) : previewScanMime && previewScanMime.startsWith('image/') ? (
                          <img src={previewScan} alt="Scanned document" className="w-full h-full object-contain bg-white" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-white gap-3 p-8">
                            <FileText className="w-16 h-16 text-white/40" />
                            <a href={previewScan} target="_blank" rel="noreferrer" className="text-sm underline">{t('clientInvoices.openDocument')}</a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/60 gap-2">
                        <ScanLine className="w-12 h-12" />
                        <p className="text-sm">{t('clientInvoices.noScanAttached')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
