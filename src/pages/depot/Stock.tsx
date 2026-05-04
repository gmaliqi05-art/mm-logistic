import { useState, useEffect } from 'react';
import {
  Package,
  AlertTriangle,
  X,
  Loader2,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  Clock,
  CheckCircle,
  ShieldAlert,
  ShieldCheck,
  ScanLine,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Stock as StockType, StockMovement, ProductCategory } from '../../types';
import { compareCategoriesByPriority, compareProducts } from '../../utils/productSort';
import PalletScanner from '../../components/scanner/PalletScanner';

export default function DepotStock() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [stocks, setStocks] = useState<StockType[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formType, setFormType] = useState<'entry' | 'exit' | 'repair'>('entry');
  const [formCategory, setFormCategory] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formConditionBefore, setFormConditionBefore] = useState('good');
  const [formConditionAfter, setFormConditionAfter] = useState('good');
  const [formNotes, setFormNotes] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const handleScan = (code: string) => {
    const match = categories.find(
      (c) => c.name?.toLowerCase() === code.toLowerCase() || (c as unknown as { aliases?: string[] }).aliases?.includes?.(code)
    );
    if (match) {
      setFormCategory(match.id);
      setShowForm(true);
    } else {
      setError(`Code "${code}" did not match any category`);
    }
  };

  const conditionConfig: Record<string, { label: string; className: string }> = {
    good: { label: t('company.stock.good'), className: 'bg-green-100 text-green-700' },
    damaged: { label: t('company.stock.damaged'), className: 'bg-red-100 text-red-700' },
    repaired: { label: t('company.stock.repaired'), className: 'bg-amber-100 text-amber-700' },
  };

  const movementConfig: Record<string, { label: string; className: string; icon: typeof ArrowUpCircle }> = {
    entry: { label: t('depot.stock.entry'), className: 'bg-green-100 text-green-700', icon: ArrowUpCircle },
    exit: { label: t('depot.stock.exit'), className: 'bg-red-100 text-red-700', icon: ArrowDownCircle },
    repair: { label: t('depot.stock.repair'), className: 'bg-amber-100 text-amber-700', icon: Wrench },
  };

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) fetchAll();
  }, [profile?.depot_id, profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const [stockRes, movementRes, catRes] = await Promise.all([
        supabase
          .from('stock')
          .select('*, category:product_categories(id, name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('stock_movements')
          .select('*, category:product_categories(id, name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId),
      ]);

      if (stockRes.error) throw stockRes.error;
      if (movementRes.error) throw movementRes.error;
      if (catRes.error) throw catRes.error;

      setStocks(stockRes.data ?? []);
      setMovements(movementRes.data ?? []);
      setCategories(catRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!formCategory || !formQuantity || submitting) return;

    try {
      setSubmitting(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;
      const qty = parseInt(formQuantity, 10);

      if (isNaN(qty) || qty <= 0) {
        setError(t('depot.stock.positiveQty'));
        return;
      }

      const { error: movErr } = await supabase.from('stock_movements').insert({
        company_id: companyId,
        depot_id: depotId,
        category_id: formCategory,
        movement_type: formType,
        quantity: qty,
        condition_before: formType === 'repair' ? formConditionBefore : (formType === 'entry' ? formConditionAfter : 'good'),
        condition_after: formConditionAfter,
        notes: formNotes,
        performed_by: profile!.id,
      });

      if (movErr) throw movErr;

      if (formType === 'entry') {
        const { data: existing } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionAfter)
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
            category_id: formCategory,
            quantity: qty,
            condition: formConditionAfter,
          });
        }
      } else if (formType === 'exit') {
        const { data: existing } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionAfter)
          .maybeSingle();

        if (!existing || existing.quantity < qty) {
          setError(t('depot.stock.insufficientStock') || 'Stok i pamjaftueshem per kete levizje.');
          return;
        }

        await supabase
          .from('stock')
          .update({ quantity: Math.max(0, existing.quantity - qty), updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else if (formType === 'repair') {
        const { data: damaged } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionBefore)
          .maybeSingle();

        if (damaged) {
          await supabase
            .from('stock')
            .update({ quantity: Math.max(0, damaged.quantity - qty), updated_at: new Date().toISOString() })
            .eq('id', damaged.id);
        }

        const { data: repaired } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', formCategory)
          .eq('condition', formConditionAfter)
          .maybeSingle();

        if (repaired) {
          await supabase
            .from('stock')
            .update({ quantity: repaired.quantity + qty, updated_at: new Date().toISOString() })
            .eq('id', repaired.id);
        } else {
          await supabase.from('stock').insert({
            company_id: companyId,
            depot_id: depotId,
            category_id: formCategory,
            quantity: qty,
            condition: formConditionAfter,
          });
        }
      }

      setFormCategory('');
      setFormQuantity('');
      setFormConditionBefore('good');
      setFormConditionAfter('good');
      setFormNotes('');
      setShowForm(false);
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  const sortedStocks = stocks
    .slice()
    .sort((a, b) =>
      compareProducts(
        a,
        b,
        (s) => (s as unknown as { category?: { name?: string } }).category?.name ?? null,
        (s) => (s as unknown as { category?: { name?: string } }).category?.name ?? '',
      ),
    );
  const sortedCategories = categories.slice().sort((a, b) => compareCategoriesByPriority(a.name, b.name));
  const goodTotal = stocks.filter((s) => s.condition === 'good').reduce((sum, s) => sum + s.quantity, 0);
  const damagedTotal = stocks.filter((s) => s.condition === 'damaged').reduce((sum, s) => sum + s.quantity, 0);
  const repairedTotal = stocks.filter((s) => s.condition === 'repaired').reduce((sum, s) => sum + s.quantity, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('depot.stock.title')}</h1>
          <p className="text-gray-500 mt-1">{t('depot.stock.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <ScanLine className="w-4 h-4" />
            Scan
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('depot.stock.newMovement')}
          </button>
        </div>
      </div>

      <PalletScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
        context="stock"
        title="Scan pallet for stocktake"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('company.stock.goodCondition')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{goodTotal}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('company.stock.damagedCondition')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{damagedTotal}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-xl">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('company.stock.repairedCondition')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{repairedTotal}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t('depot.stock.title')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('depot.stock.category')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.quantity')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('company.stock.condition')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedStocks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {t('company.stock.noStock')}
                  </td>
                </tr>
              ) : (
                sortedStocks.map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {(stock.category as any)?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900">{stock.quantity}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${conditionConfig[stock.condition]?.className ?? 'bg-gray-100 text-gray-700'}`}>
                        {conditionConfig[stock.condition]?.label ?? stock.condition}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">
                      {new Date(stock.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t('depot.stock.movementHistory')}</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {movements.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">{t('common.noData')}</p>
            </div>
          ) : (
            movements.map((m) => {
              const cfg = movementConfig[m.movement_type];
              const Icon = cfg?.icon ?? Package;
              return (
                <div key={m.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${cfg?.className ?? 'bg-gray-100'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg?.className ?? 'bg-gray-100 text-gray-700'}`}>
                            {cfg?.label ?? m.movement_type}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{m.quantity} {t('common.pieces')}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {(m.category as any)?.name ?? '-'} &middot; {(m.performer as any)?.full_name ?? '-'}
                          {m.notes ? ` &middot; ${m.notes}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('depot.stock.newMovement')}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitMovement} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('depot.stock.movementType')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['entry', 'exit', 'repair'] as const).map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setFormType(tp)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        formType === tp
                          ? tp === 'entry' ? 'bg-green-100 text-green-700 ring-2 ring-green-500'
                            : tp === 'exit' ? 'bg-red-100 text-red-700 ring-2 ring-red-500'
                            : 'bg-amber-100 text-amber-700 ring-2 ring-amber-500'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {movementConfig[tp].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('depot.stock.category')}</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="">{t('depot.stock.selectCategory')}</option>
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.quantity')}</label>
                <input
                  type="number"
                  min="1"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Vendos sasine"
                />
              </div>

              {formType === 'repair' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('depot.stock.conditionBefore')}</label>
                    <select
                      value={formConditionBefore}
                      onChange={(e) => setFormConditionBefore(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    >
                      <option value="damaged">{t('company.stock.damaged')}</option>
                      <option value="good">{t('company.stock.good')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('depot.stock.conditionAfter')}</label>
                    <select
                      value={formConditionAfter}
                      onChange={(e) => setFormConditionAfter(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    >
                      <option value="repaired">{t('company.stock.repaired')}</option>
                      <option value="good">{t('company.stock.good')}</option>
                    </select>
                  </div>
                </div>
              )}

              {formType === 'entry' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stock.condition')}</label>
                  <select
                    value={formConditionAfter}
                    onChange={(e) => setFormConditionAfter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="good">{t('company.stock.good')}</option>
                    <option value="damaged">{t('company.stock.damaged')}</option>
                    <option value="repaired">{t('company.stock.repaired')}</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.notes')}</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                  placeholder="Shenime shtese..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
