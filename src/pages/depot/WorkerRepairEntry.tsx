import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Wrench,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Package,
  Clock,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Profile, ProductCategory } from '../../types';
import { notifyUsers } from '../../utils/notifications';

interface RepairEntry {
  id: string;
  category_id: string | null;
  product_name: string;
  quantity_repaired: number;
  logged_at: string;
  reported_at: string | null;
  category?: { name: string } | null;
}

interface CatalogProduct {
  id: string;
  name: string;
  category_id: string;
}

interface ReportDetailEntry {
  category_id: string | null;
  category_name: string;
  product_name: string;
  quantity: number;
  logged_at: string;
}

interface RepairReport {
  id: string;
  report_date: string;
  total_quantity: number;
  entry_count: number;
  details: {
    entries?: ReportDetailEntry[];
    by_category?: Array<{ name: string; quantity: number }>;
    by_product?: Array<{ name: string; quantity: number }>;
  };
  created_at: string;
}

function todayBoundaryIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function WorkerRepairEntry() {
  const { workerId } = useParams<{ workerId: string }>();
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [worker, setWorker] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [entries, setEntries] = useState<RepairEntry[]>([]);
  const [reports, setReports] = useState<RepairReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formCategory, setFormCategory] = useState('');
  const [formProduct, setFormProduct] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.company_id && workerId) fetchAll();
  }, [profile?.company_id, workerId]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const dayStart = todayBoundaryIso();

      const [workerRes, catsRes, catalogRes, entriesRes, reportsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', workerId).maybeSingle(),
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('category_products')
          .select('id, name, category_id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('depot_repairs')
          .select('id, category_id, product_name, quantity_repaired, logged_at, reported_at, category:product_categories(name)')
          .eq('company_id', companyId)
          .eq('worker_id', workerId)
          .is('reported_at', null)
          .gte('logged_at', dayStart)
          .order('logged_at', { ascending: false }),
        supabase
          .from('depot_repair_reports')
          .select('id, report_date, total_quantity, entry_count, details, created_at')
          .eq('company_id', companyId)
          .eq('worker_id', workerId)
          .eq('scope', 'worker')
          .order('report_date', { ascending: false })
          .limit(60),
      ]);

      if (workerRes.error) throw workerRes.error;
      if (catsRes.error) throw catsRes.error;
      if (catalogRes.error) throw catalogRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (reportsRes.error) throw reportsRes.error;

      setWorker(workerRes.data as Profile | null);
      setCategories((catsRes.data ?? []) as ProductCategory[]);
      setCatalog((catalogRes.data ?? []) as CatalogProduct[]);
      setEntries((entriesRes.data ?? []) as unknown as RepairEntry[]);
      setReports((reportsRes.data ?? []) as RepairReport[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formCategory || !formQuantity || saving) return;
    const qty = parseInt(formQuantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t('depot.stock.positiveQty'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      // worker_log_repair RPC creates the depot_repairs row AND tries
      // to sync damaged → good stock. The legacy direct INSERT path
      // logged productivity without touching stock, which left
      // inventory permanently overstated for damaged pallets.
      const { data, error: rpcErr } = await supabase.rpc('worker_log_repair', {
        p_worker_id: workerId,
        p_depot_id: profile!.depot_id ?? null,
        p_category_id: formCategory,
        p_product_name: formProduct.trim(),
        p_quantity_repaired: qty,
        p_quantity_scrapped: 0,
      });
      if (rpcErr) throw rpcErr;

      const row = Array.isArray(data) ? data[0] : data;
      const synced: boolean = Boolean(row?.stock_synced);
      const message: string = String(row?.message ?? '');
      if (synced) {
        setSuccess(t('depot.repairWorkers.savedOk'));
      } else {
        // Productivity logged but stock could not be reconciled.
        // Surface the reason so the worker / admin knows to follow up.
        setSuccess(`${t('depot.repairWorkers.savedOk')} — ${message}`);
      }
      setFormQuantity('');
      quantityRef.current?.focus();
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!window.confirm(t('common.confirmDelete') || 'A je i sigurt?')) return;
    try {
      const { error: err } = await supabase.from('depot_repairs').delete().eq('id', id);
      if (err) throw err;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleFinalize() {
    if (finalizing || entries.length === 0) return;
    try {
      setFinalizing(true);
      setError(null);
      const companyId = profile!.company_id!;
      const nowIso = new Date().toISOString();

      const detailEntries: ReportDetailEntry[] = entries.map((e) => ({
        category_id: e.category_id,
        category_name: e.category?.name ?? '-',
        product_name: e.product_name || '',
        quantity: e.quantity_repaired ?? 0,
        logged_at: e.logged_at,
      }));

      const byCatMap = new Map<string, number>();
      const byProdMap = new Map<string, number>();
      let total = 0;
      for (const e of detailEntries) {
        total += e.quantity;
        byCatMap.set(e.category_name, (byCatMap.get(e.category_name) ?? 0) + e.quantity);
        const p = (e.product_name || '').trim();
        if (p) byProdMap.set(p, (byProdMap.get(p) ?? 0) + e.quantity);
      }

      const reportPayload = {
        company_id: companyId,
        depot_id: profile!.depot_id ?? null,
        worker_id: workerId,
        scope: 'worker',
        report_date: todayDateStr(),
        total_quantity: total,
        entry_count: entries.length,
        details: {
          entries: detailEntries,
          by_category: Array.from(byCatMap.entries()).map(([name, quantity]) => ({ name, quantity })),
          by_product: Array.from(byProdMap.entries()).map(([name, quantity]) => ({ name, quantity })),
        },
        created_by: profile!.id,
        sent_to_stock_at: nowIso,
        sent_to_stock_by: profile!.id,
      };

      const { data: existing } = await supabase
        .from('depot_repair_reports')
        .select('id')
        .eq('worker_id', workerId)
        .eq('report_date', todayDateStr())
        .eq('company_id', companyId)
        .eq('scope', 'worker')
        .maybeSingle();

      let reportRow: { id: string } | null = null;
      if (existing) {
        const { data, error: upErr } = await supabase
          .from('depot_repair_reports')
          .update({
            total_quantity: total,
            entry_count: entries.length,
            details: reportPayload.details,
            sent_to_stock_at: nowIso,
            sent_to_stock_by: profile!.id,
          })
          .eq('id', existing.id)
          .select('id')
          .maybeSingle();
        if (upErr) throw upErr;
        reportRow = data;
      } else {
        const { data, error: insErr } = await supabase
          .from('depot_repair_reports')
          .insert(reportPayload)
          .select('id')
          .maybeSingle();
        if (insErr) throw insErr;
        reportRow = data;
      }
      if (!reportRow) throw new Error(t('common.failedToSaveReport'));

      const ids = entries.map((e) => e.id);
      const { error: upErr } = await supabase
        .from('depot_repairs')
        .update({ reported_at: nowIso })
        .in('id', ids);
      if (upErr) throw upErr;

      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .in('role', ['company_admin']);
      if (admins && admins.length > 0 && reportRow?.id) {
        await notifyUsers({
          userIds: admins.map((a) => a.id),
          type: 'document',
          titleKey: 'notifications.templates.repairReportPending.title',
          messageKey: 'notifications.templates.repairReportPending.body',
          params: {
            date: new Date().toLocaleDateString(),
            quantity: total,
            worker: profile?.full_name ?? '',
          },
          referenceId: reportRow.id,
          fallbackTitle: 'Raport reparaturash per shqyrtim',
          fallbackMessage: `${total} cope u raportuan dhe presin miratim.`,
        });
      }

      void reportRow;
      setSuccess(t('depot.repairWorkers.finalizedOk'));
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFinalizing(false);
    }
  }

  const totalsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = e.category?.name ?? '-';
      map.set(key, (map.get(key) ?? 0) + (e.quantity_repaired ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const totalsByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = (e.product_name || '').trim() || '-';
      map.set(key, (map.get(key) ?? 0) + (e.quantity_repaired ?? 0));
    }
    return Array.from(map.entries())
      .filter(([name]) => name !== '-')
      .sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const todayTotal = entries.reduce((s, e) => s + (e.quantity_repaired ?? 0), 0);

  const productSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog) {
      if (formCategory && p.category_id !== formCategory) continue;
      if (p.name?.trim()) set.add(p.name.trim());
    }
    return Array.from(set).slice(0, 50);
  }, [catalog, formCategory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="bg-white rounded-xl p-8 text-center text-gray-500">
        {t('common.notFound') || 'Not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/depot/repair-workers"
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900 truncate">
                {worker.full_name}
              </h1>
              <p className="text-xs text-gray-500">{t('depot.repairWorkers.subtitleWorker')}</p>
            </div>
          </div>
        </div>
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
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-emerald-700 text-sm flex-1">{success}</p>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4"
      >
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-teal-600" />
          {t('depot.repairWorkers.quickEntry')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('depot.stock.category')}
            </label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="">{t('depot.stock.selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('depot.repairWorkers.product')}
            </label>
            <input
              type="text"
              value={formProduct}
              onChange={(e) => setFormProduct(e.target.value)}
              list="repair-products"
              placeholder={t('depot.repairWorkers.productPlaceholder')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
            <datalist id="repair-products">
              {productSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('common.quantity')}
            </label>
            <input
              ref={quantityRef}
              type="number"
              inputMode="numeric"
              min={1}
              value={formQuantity}
              onChange={(e) => setFormQuantity(e.target.value)}
              required
              placeholder="0"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold"
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving || !formCategory || !formQuantity}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('common.save')}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {t('depot.repairWorkers.todayTotal')}
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{todayTotal}</p>
          <p className="text-xs text-gray-400 mt-1">{t('depot.repairWorkers.pallets')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {t('depot.repairWorkers.entries')}
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{entries.length}</p>
          <p className="text-xs text-gray-400 mt-1">{t('depot.repairWorkers.todayOpen')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {t('depot.repairWorkers.finishDay')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t('depot.repairWorkers.finishDayHelp')}
            </p>
          </div>
          <button
            onClick={handleFinalize}
            disabled={finalizing || entries.length === 0}
            className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {t('depot.repairWorkers.finish')} ({entries.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('depot.repairWorkers.byCategory')}
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {totalsByCategory.length === 0 ? (
              <p className="p-5 text-sm text-gray-400 text-center">{t('common.noResults')}</p>
            ) : (
              totalsByCategory.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-700">{name}</span>
                  <span className="text-sm font-bold text-teal-700">{qty}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('depot.repairWorkers.byProduct')}
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {totalsByProduct.length === 0 ? (
              <p className="p-5 text-sm text-gray-400 text-center">{t('common.noResults')}</p>
            ) : (
              totalsByProduct.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-700">{name}</span>
                  <span className="text-sm font-bold text-teal-700">{qty}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">
            {t('depot.repairWorkers.todayEntries')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.time')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('depot.stock.category')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('depot.repairWorkers.product')}
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.quantity')}
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                    <Package className="w-9 h-9 mx-auto mb-2 text-gray-300" />
                    {t('depot.repairWorkers.emptyToday')}
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(e.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-900">
                      {e.category?.name ?? '-'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {e.product_name || '-'}
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">
                      {e.quantity_repaired}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => deleteEntry(e.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <FileText className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            {t('depot.repairWorkers.pastReports')}
          </h3>
        </div>
        <div className="divide-y divide-gray-50">
          {reports.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">{t('depot.repairWorkers.noReports')}</p>
          ) : (
            reports.map((r) => {
              const open = expandedReport === r.id;
              return (
                <div key={r.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedReport(open ? null : r.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 flex-shrink-0">
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(r.report_date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.entry_count} {t('depot.repairWorkers.entries').toLowerCase()}
                      </p>
                    </div>
                    <span className="text-base font-bold text-teal-700 flex-shrink-0">
                      {r.total_quantity}
                    </span>
                  </button>
                  {open && (
                    <div className="bg-gray-50 px-5 py-4 space-y-3 border-t border-gray-100">
                      {(r.details?.by_category ?? []).length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                            {t('depot.repairWorkers.byCategory')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(r.details?.by_category ?? []).map((c) => (
                              <span key={c.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white border border-gray-200">
                                <span className="text-gray-700">{c.name}</span>
                                <span className="font-semibold text-teal-700">{c.quantity}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {(r.details?.entries ?? []).length > 0 && (
                        <div className="overflow-x-auto bg-white rounded-lg border border-gray-100">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{t('common.time')}</th>
                                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{t('depot.stock.category')}</th>
                                <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{t('depot.repairWorkers.product')}</th>
                                <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{t('common.quantity')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {(r.details?.entries ?? []).map((e, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2 text-xs text-gray-500">
                                    {new Date(e.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-700">{e.category_name}</td>
                                  <td className="px-3 py-2 text-xs text-gray-700">{e.product_name || '-'}</td>
                                  <td className="px-3 py-2 text-xs text-right font-semibold text-gray-900">{e.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
