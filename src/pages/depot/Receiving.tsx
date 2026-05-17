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
import PalletScanner from '../../components/scanner/PalletScanner';
import type { StockMovement, ProductCategory } from '../../types';
import { epalClassRank } from '../../utils/productSort';

interface CategoryProductLite {
  id: string;
  category_id: string;
  name: string;
}

interface ItemRow {
  id: string;
  category_id: string;
  category_product_id: string;
  quantity: string;
  condition: string;
}

function createRow(): ItemRow {
  return { id: crypto.randomUUID(), category_id: '', category_product_id: '', quantity: '', condition: 'good' };
}

export default function DepotReceiving() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProductLite[]>([]);
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [receivingRows, setReceivingRows] = useState<ItemRow[]>([createRow()]);
  const [receivingNotes, setReceivingNotes] = useState('');
  const [sourcePartner, setSourcePartner] = useState('');

  const [showScanner, setShowScanner] = useState(false);
  const [showPalletScanner, setShowPalletScanner] = useState(false);

  function normalizeForMatch(s: string) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function handlePalletScan(code: string) {
    const needle = normalizeForMatch(code);
    const matchedProduct = products.find(
      (p) => normalizeForMatch(p.name) === needle || normalizeForMatch(p.name).includes(needle)
    );
    if (matchedProduct) {
      setReceivingRows((prev) => {
        const blank = prev.find((r) => !r.category_id);
        if (blank) {
          return prev.map((r) => r.id === blank.id
            ? { ...r, category_id: matchedProduct.category_id, category_product_id: matchedProduct.id, quantity: r.quantity || '1' }
            : r);
        }
        return [...prev, { id: crypto.randomUUID(), category_id: matchedProduct.category_id, category_product_id: matchedProduct.id, quantity: '1', condition: 'good' }];
      });
    } else {
      setError(`Kodi "${code}" nuk u gjet`);
    }
  }
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

    const rows: ItemRow[] = (r.extracted.line_items || [])
      .map((li) => {
        const catId = findCategoryId(li.description || '');
        const desc = normalize(li.description || '');
        const productMatch = catId
          ? products.find((p) => p.category_id === catId && desc && (
              normalize(p.name) === desc || desc.includes(normalize(p.name)) || normalize(p.name).includes(desc)
            ))
          : null;
        return {
          id: crypto.randomUUID(),
          category_id: catId,
          category_product_id: productMatch?.id ?? '',
          quantity: String(Math.max(1, Math.round(Number(li.quantity) || 1))),
          condition: 'good',
        };
      })
      .filter((r) => r.category_id);

    const finalRows = rows.length > 0 ? rows : [createRow()];

    const partnerName = r.extracted.supplier_name || r.extracted.customer_name || '';

    const refNote = [
      r.extracted.supplier_name ? `Furnitor: ${r.extracted.supplier_name}` : '',
      r.extracted.invoice_number ? `Ref: ${r.extracted.invoice_number}` : '',
    ].filter(Boolean).join(' · ');

    setReceivingRows(finalRows);
    setReceivingNotes(refNote);
    setSourcePartner(partnerName);

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

      const [catRes, prodRes, histRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId),
        supabase
          .from('category_products')
          .select('id, category_id, name')
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), product:category_products(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .in('movement_type', ['entry', 'exit'])
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;
      if (histRes.error) throw histRes.error;

      setCategories(catRes.data ?? []);
      setProducts(prodRes.data ?? []);
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
    setReceivingRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, [field]: value };
      if (field === 'category_id') next.category_product_id = '';
      return next;
    }));
  }



  function productsForCategory(categoryId: string): CategoryProductLite[] {
    return products
      .filter((p) => p.category_id === categoryId)
      .sort((a, b) => epalClassRank(a.name) - epalClassRank(b.name) || a.name.localeCompare(b.name));
  }

  function categoryHasProducts(categoryId: string): boolean {
    return products.some((p) => p.category_id === categoryId);
  }

  async function handleReceiving(e: React.FormEvent) {
    e.preventDefault();
    const validRows = receivingRows.filter((r) => r.category_id && r.quantity && parseInt(r.quantity, 10) > 0);
    if (validRows.length === 0) {
      setError('Shto te pakten nje artikull valid');
      return;
    }
    const missingProduct = validRows.find((r) => categoryHasProducts(r.category_id) && !r.category_product_id);
    if (missingProduct) {
      const cat = categories.find((c) => c.id === missingProduct.category_id);
      setError(`Zgjedh produktin specifik per kategorin "${cat?.name ?? ''}".`);
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
        category_product_id: r.category_product_id || null,
        movement_type: 'entry' as const,
        quantity: parseInt(r.quantity, 10),
        condition_before: r.condition,
        condition_after: r.condition,
        notes: receivingNotes,
        performed_by: profile!.id,
        source_partner: sourcePartner.trim() || '',
      }));

      const { error: movErr } = await supabase.from('stock_movements').insert(movements);
      if (movErr) throw movErr;

      for (const row of validRows) {
        const qty = parseInt(row.quantity, 10);
        const productId = row.category_product_id || null;
        let lookup = supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', row.category_id)
          .eq('condition', row.condition);
        lookup = productId ? lookup.eq('category_product_id', productId) : lookup.is('category_product_id', null);
        const { data: existing } = await lookup.maybeSingle();

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
            category_product_id: productId,
            quantity: qty,
            condition: row.condition,
          });
        }
      }

      setReceivingRows([createRow()]);
      setReceivingNotes('');
      setSourcePartner('');
      setSuccess('Pranimi u regjistrua me sukses');
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
          <h1 className="text-2xl font-bold text-gray-900">Pranim</h1>
          <p className="text-gray-500 mt-1">Regjistro pranime ne depo</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPalletScanner(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
          >
            <Sparkles className="w-4 h-4" />
            Skano paleten
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors font-medium"
          >
            <Sparkles className="w-4 h-4" />
            {t('common.scanner.title')}
          </button>
        </div>
      </div>

      <PalletScanner
        open={showPalletScanner}
        onClose={() => setShowPalletScanner(false)}
        onScan={handlePalletScan}
        context="receiving"
        continuous
        title="Skano paletat per pranim"
      />

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
          allowedKinds={['delivery_in']}
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
        <div className="border-b border-gray-100 px-6 py-3">
          <div className="flex items-center gap-2 text-teal-600 font-medium text-sm">
            <ArrowUpCircle className="w-4 h-4" />
            Pranim
          </div>
        </div>

        <div className="p-6">
            <form onSubmit={handleReceiving} className="space-y-4">
              {receivingRows.some((r) => {
                const c = categories.find((x) => x.id === r.category_id);
                return c && c.sorting_mode && c.sorting_mode !== 'none';
              }) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800 flex-1">
                    {t('depot.receiving.sortingHint')}{' '}
                    <a href="/depot/sorting" className="underline font-medium">
                      {t('nav.sorting')}
                    </a>
                  </p>
                </div>
              )}
              <div className="space-y-3">
                {receivingRows.map((row) => {
                  const rowProducts = productsForCategory(row.category_id);
                  const hasProducts = rowProducts.length > 0;
                  return (
                  <div key={row.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                        <label className="block text-xs font-medium text-gray-500 mb-1">Produkti</label>
                        <select
                          value={row.category_product_id}
                          onChange={(e) => updateReceivingRow(row.id, 'category_product_id', e.target.value)}
                          disabled={!row.category_id || !hasProducts}
                          required={hasProducts}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="">{hasProducts ? 'Zgjedh produktin' : (row.category_id ? '— pa produkte —' : '— zgjedh kategorin —')}</option>
                          {rowProducts.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
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
                  );
                })}
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nga kush? (Kompania/Personi)</label>
                <input
                  type="text"
                  value={sourcePartner}
                  onChange={(e) => setSourcePartner(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Emri i kompanise ose personit qe ka sjelle paletat..."
                />
              </div>

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
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('depot.receiving.receivingHistory')}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.type')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produkti / {t('depot.stock.category')}</th>
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
                    {t('depot.receiving.noReceiving')}
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
                      <div className="font-medium">{(m.product as any)?.name ?? (m.category as any)?.name ?? '-'}</div>
                      {(m.product as any)?.name && (m.category as any)?.name && (
                        <div className="text-xs text-gray-500">{(m.category as any)?.name}</div>
                      )}
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
