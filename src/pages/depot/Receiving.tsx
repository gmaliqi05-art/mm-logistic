import { useState, useEffect } from 'react';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  X,
  Loader2,
  Plus,
  Trash2,
  Clock,
  Package,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import SmartDocScanner, { SmartScanResult } from '../../components/scanner/SmartDocScanner';
import type { StockMovement, ProductCategory } from '../../types';

interface ItemRow {
  id: string;
  category_id: string;
  quantity: string;
  condition: string;
}

function createRow(): ItemRow {
  return { id: crypto.randomUUID(), category_id: '', quantity: '', condition: 'good' };
}

export default function DepotReceiving() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'receiving' | 'shipping'>('receiving');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [receivingRows, setReceivingRows] = useState<ItemRow[]>([createRow()]);
  const [receivingNotes, setReceivingNotes] = useState('');

  const [shippingRows, setShippingRows] = useState<ItemRow[]>([createRow()]);
  const [shippingNotes, setShippingNotes] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  function normalize(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  function findCategoryId(description: string): string {
    const n = normalize(description);
    if (!n) return '';
    const exact = categories.find((c) => normalize(c.name) === n);
    if (exact) return exact.id;
    const partial = categories.find((c) => {
      const cn = normalize(c.name);
      return cn && (n.includes(cn) || cn.includes(n));
    });
    return partial?.id || '';
  }

  async function handleScanConfirm(r: SmartScanResult) {
    const kind = r.routing?.suggested_kind;
    const isShipping = kind === 'delivery_out';

    const rows: ItemRow[] = (r.extracted.line_items || [])
      .map((li) => ({
        id: crypto.randomUUID(),
        category_id: findCategoryId(li.description || ''),
        quantity: String(Math.max(1, Math.round(Number(li.quantity) || 1))),
        condition: 'good',
      }))
      .filter((r) => r.category_id);

    const finalRows = rows.length > 0 ? rows : [createRow()];

    const partnerName = isShipping ? (r.extracted.customer_name || '') : (r.extracted.supplier_name || '');
    let partnerId = r.routing?.matched_contact_id || '';
    let resolvedAddress = '';
    if (profile?.company_id && (partnerId || partnerName)) {
      const q = supabase.from('acc_contacts')
        .select('id, name, address, city, postal_code, country')
        .eq('company_id', profile.company_id).limit(1);
      const { data: contact } = partnerId
        ? await q.eq('id', partnerId).maybeSingle()
        : await q.ilike('name', partnerName).maybeSingle();
      if (contact) {
        partnerId = contact.id;
        const parts = [contact.address, [contact.postal_code, contact.city].filter(Boolean).join(' '), contact.country].filter(Boolean);
        resolvedAddress = parts.join(', ');
      }
    }

    const refNote = [
      r.extracted.supplier_name ? `Furnitor: ${r.extracted.supplier_name}` : '',
      r.extracted.customer_name ? `Klient: ${r.extracted.customer_name}` : '',
      r.extracted.invoice_number ? `Ref: ${r.extracted.invoice_number}` : '',
      partnerId ? '(Kontakt i njohur)' : '',
    ].filter(Boolean).join(' · ');

    if (isShipping) {
      setActiveTab('shipping');
      setShippingRows(finalRows);
      setShippingNotes(refNote);
      setShippingAddress(resolvedAddress || r.extracted.customer_name || '');
    } else {
      setActiveTab('receiving');
      setReceivingRows(finalRows);
      setReceivingNotes(refNote);
    }

    const unmatched = (r.extracted.line_items || []).length - rows.length;
    const parts = [t('common.scanner.depotScan.aiFilled'), `${rows.length} ${t('common.scanner.depotScan.itemsRecognized')}`];
    if (unmatched > 0) parts.push(`${unmatched} ${t('common.scanner.depotScan.unmatched')}`);
    else parts.push(t('common.scanner.driverScan.verifyBeforeSave'));
    setAiNotice(parts.join(' · '));
    setShowScanner(false);
  }

  const conditionLabels: Record<string, string> = {
    good: t('company.stock.good'),
    damaged: t('company.stock.damaged'),
    repaired: t('company.stock.repaired'),
  };

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) fetchData();
  }, [profile?.depot_id, profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const [catRes, histRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .in('movement_type', ['entry', 'exit'])
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (catRes.error) throw catRes.error;
      if (histRes.error) throw histRes.error;

      setCategories(catRes.data ?? []);
      setHistory(histRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  function addReceivingRow() {
    setReceivingRows((prev) => [...prev, createRow()]);
  }

  function removeReceivingRow(id: string) {
    setReceivingRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);
  }

  function updateReceivingRow(id: string, field: keyof ItemRow, value: string) {
    setReceivingRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }

  function addShippingRow() {
    setShippingRows((prev) => [...prev, createRow()]);
  }

  function removeShippingRow(id: string) {
    setShippingRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);
  }

  function updateShippingRow(id: string, field: keyof ItemRow, value: string) {
    setShippingRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }

  async function handleReceiving(e: React.FormEvent) {
    e.preventDefault();
    const validRows = receivingRows.filter((r) => r.category_id && r.quantity && parseInt(r.quantity, 10) > 0);
    if (validRows.length === 0) {
      setError('Shto te pakten nje artikull valid');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const movements = validRows.map((r) => ({
        company_id: companyId,
        depot_id: depotId,
        category_id: r.category_id,
        movement_type: 'entry' as const,
        quantity: parseInt(r.quantity, 10),
        condition_before: r.condition,
        condition_after: r.condition,
        notes: receivingNotes,
        performed_by: profile!.id,
      }));

      const { error: movErr } = await supabase.from('stock_movements').insert(movements);
      if (movErr) throw movErr;

      for (const row of validRows) {
        const qty = parseInt(row.quantity, 10);
        const { data: existing } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', row.category_id)
          .eq('condition', row.condition)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('stock')
            .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('stock').insert({
            company_id: companyId,
            depot_id: depotId,
            category_id: row.category_id,
            quantity: qty,
            condition: row.condition,
          });
        }
      }

      setReceivingRows([createRow()]);
      setReceivingNotes('');
      setSuccess('Pranimi u regjistrua me sukses');
      await fetchData();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShipping(e: React.FormEvent) {
    e.preventDefault();
    const validRows = shippingRows.filter((r) => r.category_id && r.quantity && parseInt(r.quantity, 10) > 0);
    if (validRows.length === 0) {
      setError('Shto te pakten nje artikull valid');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const notesWithAddress = [shippingNotes, shippingAddress ? `Destinacioni: ${shippingAddress}` : ''].filter(Boolean).join(' | ');

      const movements = validRows.map((r) => ({
        company_id: companyId,
        depot_id: depotId,
        category_id: r.category_id,
        movement_type: 'exit' as const,
        quantity: parseInt(r.quantity, 10),
        condition_before: r.condition,
        condition_after: r.condition,
        notes: notesWithAddress,
        performed_by: profile!.id,
      }));

      for (const row of validRows) {
        const qty = parseInt(row.quantity, 10);
        const { data: existing } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', row.category_id)
          .eq('condition', row.condition)
          .maybeSingle();

        if (!existing || existing.quantity < qty) {
          const cat = categories.find((c) => c.id === row.category_id);
          setError(`Stok i pamjaftueshem per ${cat?.name ?? 'artikullin'} (${row.condition}).`);
          return;
        }
      }

      const { error: movErr } = await supabase.from('stock_movements').insert(movements);
      if (movErr) throw movErr;

      for (const row of validRows) {
        const qty = parseInt(row.quantity, 10);
        const { data: existing } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', row.category_id)
          .eq('condition', row.condition)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('stock')
            .update({ quantity: Math.max(0, existing.quantity - qty), updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      }

      setShippingRows([createRow()]);
      setShippingNotes('');
      setShippingAddress('');
      setSuccess('Dergesa u regjistrua me sukses');
      await fetchData();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('depot.receiving.title')}</h1>
          <p className="text-gray-500 mt-1">{t('depot.receiving.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors font-medium"
        >
          <Sparkles className="w-4 h-4" />
          {t('common.scanner.title')}
        </button>
      </div>

      {aiNotice && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-50 border border-teal-200">
          <Sparkles className="w-4 h-4 text-teal-600 mt-0.5" />
          <p className="text-xs text-teal-800 flex-1">{aiNotice}</p>
          <button onClick={() => setAiNotice(null)} className="text-teal-600 hover:text-teal-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showScanner && (
        <SmartDocScanner
          role="depot"
          title={t('common.scanner.depotScan.title')}
          subtitle={t('common.scanner.depotScan.subtitle')}
          allowedKinds={['delivery_in', 'delivery_out']}
          onClose={() => setShowScanner(false)}
          onConfirm={handleScanConfirm}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <ArrowUpCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm flex-1">{success}</p>
          <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <div className="flex">
            <button
              onClick={() => setActiveTab('receiving')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors relative ${
                activeTab === 'receiving'
                  ? 'text-teal-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <ArrowUpCircle className="w-4 h-4" />
                {t('depot.receiving.tabReceiving')}
              </div>
              {activeTab === 'receiving' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('shipping')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors relative ${
                activeTab === 'shipping'
                  ? 'text-teal-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <ArrowDownCircle className="w-4 h-4" />
                {t('depot.receiving.tabShipping')}
              </div>
              {activeTab === 'shipping' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
              )}
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'receiving' ? (
            <form onSubmit={handleReceiving} className="space-y-4">
              <div className="space-y-3">
                {receivingRows.map((row) => (
                  <div key={row.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('depot.stock.category')}</label>
                        <select
                          value={row.category_id}
                          onChange={(e) => updateReceivingRow(row.id, 'category_id', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        >
                          <option value="">{t('depot.stock.selectCategory')}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.quantity')}</label>
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateReceivingRow(row.id, 'quantity', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('company.stock.condition')}</label>
                        <select
                          value={row.condition}
                          onChange={(e) => updateReceivingRow(row.id, 'condition', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        >
                          <option value="good">{t('company.stock.good')}</option>
                          <option value="damaged">{t('company.stock.damaged')}</option>
                          <option value="repaired">{t('company.stock.repaired')}</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeReceivingRow(row.id)}
                      className="mt-6 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addReceivingRow}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('depot.receiving.addItem')}
              </button>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={receivingNotes}
                  onChange={(e) => setReceivingNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                  placeholder="Shenime shtese per pranimin..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('depot.receiving.registerReceiving')}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleShipping} className="space-y-4">
              <div className="space-y-3">
                {shippingRows.map((row) => (
                  <div key={row.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('depot.stock.category')}</label>
                        <select
                          value={row.category_id}
                          onChange={(e) => updateShippingRow(row.id, 'category_id', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        >
                          <option value="">{t('depot.stock.selectCategory')}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.quantity')}</label>
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateShippingRow(row.id, 'quantity', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeShippingRow(row.id)}
                      className="mt-6 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addShippingRow}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('depot.receiving.addItem')}
              </button>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.address')}</label>
                <input
                  type="text"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Adresa ku do te dergohen mallrat..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={shippingNotes}
                  onChange={(e) => setShippingNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                  placeholder="Shenime shtese per dergesen..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('depot.receiving.registerShipping')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeTab === 'receiving' ? t('depot.receiving.receivingHistory') : t('depot.receiving.shippingHistory')}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.type')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('depot.stock.category')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.quantity')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('company.stock.condition')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.createdBy')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('common.notes')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {activeTab === 'receiving' ? t('depot.receiving.noReceiving') : t('depot.receiving.noShipping')}
                  </td>
                </tr>
              ) : (
                history.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        m.movement_type === 'entry' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {m.movement_type === 'entry' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                        {m.movement_type === 'entry' ? t('depot.receiving.tabReceiving') : t('depot.receiving.tabShipping')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {(m.category as any)?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{m.quantity}</td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        conditionLabels[m.condition_after] ? (
                          m.condition_after === 'good' ? 'bg-green-100 text-green-700' :
                          m.condition_after === 'damaged' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        ) : 'bg-gray-100 text-gray-700'
                      }`}>
                        {conditionLabels[m.condition_after] ?? m.condition_after}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">
                      {(m.performer as any)?.full_name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden lg:table-cell max-w-[200px] truncate">
                      {m.notes || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(m.created_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
