import { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  Loader2,
  AlertTriangle,
  X,
  Send,
  CheckCircle2,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Profile } from '../../types';
import { compareCategoriesByPriority } from '../../utils/productSort';

const DEFAULT_BATCH_SIZE = 15;

function getWorkerBatchSize(workerId: string): number {
  try {
    const v = localStorage.getItem(`repair_batch_${workerId}`);
    return v ? Math.max(1, parseInt(v, 10) || DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  } catch { return DEFAULT_BATCH_SIZE; }
}
function setWorkerBatchSize(workerId: string, size: number) {
  try { localStorage.setItem(`repair_batch_${workerId}`, String(Math.max(1, size))); } catch { /* quota / private mode */ }
}

interface WorkerRow extends Profile {
  total_today: number;
}

interface CatalogProduct {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  show_in_repair: boolean;
  is_active: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  show_in_repair: boolean;
}

interface OpenRepair {
  worker_id: string | null;
  category_id: string | null;
  product_name: string | null;
  quantity_repaired: number | null;
  logged_at: string;
  category?: { name: string } | null;
}

interface CompanyReport {
  id: string;
  report_date: string;
  total_quantity: number;
  entry_count: number;
  details: {
    workers?: Array<{
      worker_id: string;
      worker_name: string;
      total_quantity: number;
      entry_count: number;
      by_category?: Array<{ name: string; quantity: number }>;
      by_product?: Array<{ name: string; quantity: number }>;
    }>;
  };
  created_at: string;
}

const CATEGORY_PREFIX_WORDS = new Set([
  'euro',
  'pallet',
  'pallets',
  'palette',
  'paletten',
  'palletten',
  'color',
  'colour',
  'einweg',
  'einwegpalette',
  'einwegpaletten',
  'transport',
  'transportzubehoer',
  'transportzubehor',
]);

function shortProductName(productName: string, categoryName: string): string {
  const raw = (productName ?? '').trim();
  if (!raw) return '';

  const klasse = raw.match(/klasse\s+([A-Za-z0-9]+)/i);
  if (klasse) return `${klasse[1].toUpperCase()} Klasse`;

  const catTokens = (categoryName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const stripSet = new Set<string>([...CATEGORY_PREFIX_WORDS, ...catTokens]);
  const tokens = raw.split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const lower = tokens[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower && stripSet.has(lower)) i++;
    else break;
  }
  const rest = tokens.slice(i).join(' ').trim();
  if (!rest || rest.length < 3) return raw;
  return rest;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayBoundaryIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function DepotRepairWorkers() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [openRepairs, setOpenRepairs] = useState<OpenRepair[]>([]);
  const [reports, setReports] = useState<CompanyReport[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [justUpdatedId, setJustUpdatedId] = useState<string | null>(null);
  const [editingBatchWorkerId, setEditingBatchWorkerId] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id, profile?.depot_id]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!justUpdatedId) return;
    const timer = setTimeout(() => setJustUpdatedId(null), 900);
    return () => clearTimeout(timer);
  }, [justUpdatedId]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const dayStart = todayBoundaryIso();

      let workersQuery = supabase
        .from('profiles')
        .select('*')
        .eq('company_id', companyId)
        .eq('role', 'depot_worker')
        .eq('worker_category', 'reparature')
        .eq('is_active', true)
        .order('full_name');
      if (profile?.depot_id) {
        workersQuery = workersQuery.or(`depot_id.eq.${profile.depot_id},depot_id.is.null`);
      }

      const [workersRes, productsRes, categoriesRes, openRes, reportsRes] = await Promise.all([
        workersQuery,
        supabase
          .from('category_products')
          .select('id, name, category_id, show_in_repair, is_active, category:product_categories(name, show_in_repair)')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('product_categories')
          .select('id, name, show_in_repair')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('depot_repairs')
          .select('worker_id, category_id, product_name, quantity_repaired, logged_at, category:product_categories(name)')
          .eq('company_id', companyId)
          .is('reported_at', null)
          .gte('logged_at', dayStart),
        supabase
          .from('depot_repair_reports')
          .select('id, report_date, total_quantity, entry_count, details, created_at')
          .eq('company_id', companyId)
          .eq('scope', 'company')
          .order('report_date', { ascending: false })
          .limit(60),
      ]);

      if (workersRes.error) throw workersRes.error;
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (openRes.error) throw openRes.error;
      if (reportsRes.error) throw reportsRes.error;

      const openRows = (openRes.data ?? []) as unknown as Array<{
        worker_id: string | null;
        category_id: string | null;
        product_name: string | null;
        quantity_repaired: number | null;
        logged_at: string;
        category?: { name: string } | { name: string }[] | null;
      }>;
      const normalizedOpen: OpenRepair[] = openRows.map((r) => ({
        worker_id: r.worker_id,
        category_id: r.category_id,
        product_name: r.product_name,
        quantity_repaired: r.quantity_repaired,
        logged_at: r.logged_at,
        category: Array.isArray(r.category) ? r.category[0] ?? null : r.category ?? null,
      }));

      const totalByWorker = new Map<string, number>();
      for (const r of normalizedOpen) {
        if (!r.worker_id) continue;
        totalByWorker.set(
          r.worker_id,
          (totalByWorker.get(r.worker_id) ?? 0) + (r.quantity_repaired ?? 0),
        );
      }

      const workerList: WorkerRow[] = (workersRes.data ?? []).map((w: Profile) => ({
        ...w,
        total_today: totalByWorker.get(w.id) ?? 0,
      }));

      const productRows = (productsRes.data ?? []) as unknown as Array<{
        id: string;
        name: string;
        category_id: string;
        show_in_repair: boolean;
        is_active: boolean;
        category?: { name: string } | { name: string }[] | null;
      }>;
      const productList: CatalogProduct[] = productRows.map((p) => {
        const cat = Array.isArray(p.category) ? p.category[0] ?? null : p.category ?? null;
        return {
          id: p.id,
          name: p.name,
          category_id: p.category_id,
          category_name: cat?.name ?? '',
          show_in_repair: p.show_in_repair !== false,
          is_active: p.is_active !== false,
        };
      });

      setWorkers(workerList);
      setProducts(productList);
      setCategories((categoriesRes.data ?? []) as CategoryRow[]);
      setOpenRepairs(normalizedOpen);
      setReports((reportsRes.data ?? []) as CompanyReport[]);
    } catch (err) {
      setError((err as Error).message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) ?? null,
    [workers, selectedWorkerId],
  );
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const batchSize = selectedWorker ? getWorkerBatchSize(selectedWorker.id) : DEFAULT_BATCH_SIZE;
  const canComplete = !!selectedWorker && !!selectedProduct && !saving;

  async function handleComplete() {
    if (!canComplete) return;
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;
      const depotId = profile!.depot_id ?? null;
      const qty = getWorkerBatchSize(selectedWorker!.id);

      const { data: damagedRows, error: stockErr } = await supabase
        .from('stock')
        .select('id, quantity')
        .eq('company_id', companyId)
        .eq('condition', 'damaged')
        .eq('category_id', selectedProduct!.category_id)
        .gt('quantity', 0)
        .order('quantity', { ascending: false })
        .limit(1);
      if (stockErr) throw stockErr;

      if (depotId) {
        const { data: depotRows, error: depotErr } = await supabase
          .from('stock')
          .select('id, quantity')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .eq('condition', 'damaged')
          .eq('category_id', selectedProduct!.category_id)
          .gt('quantity', 0)
          .order('quantity', { ascending: false })
          .limit(1);
        if (depotErr) throw depotErr;
        if (depotRows && depotRows.length > 0) {
          damagedRows?.splice(0, damagedRows.length, ...depotRows);
        }
      }

      if (!damagedRows || damagedRows.length === 0) {
        throw new Error('Nuk ka stok defekt te disponueshem per kete kategori');
      }
      const stockRow = damagedRows[0];
      if (stockRow.quantity < qty) {
        throw new Error(`Stoku defekt i disponueshem eshte vetem ${stockRow.quantity} cope (kerkuar ${qty})`);
      }

      const { error: rpcErr } = await supabase.rpc('apply_repair_from_stock', {
        p_stock_id: stockRow.id,
        p_repaired_qty: qty,
        p_scrapped_qty: 0,
        p_target_category_product_id: selectedProduct!.id,
        p_worker_id: selectedWorker!.id,
      });
      if (rpcErr) throw rpcErr;

      setSuccess(
        `${selectedWorker!.full_name} · ${selectedProduct!.name} · +${qty} paleta`,
      );
      setJustUpdatedId(selectedWorker!.id);
      setSelectedWorkerId(null);
      setSelectedProductId(null);
      await fetchAll();
    } catch (err) {
      setError((err as Error).message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  function resetSelection() {
    setSelectedWorkerId(null);
    setSelectedProductId(null);
  }

  async function handleReportToAdmin() {
    if (reporting) return;
    if (openRepairs.length === 0) {
      setError(t('depot.repairWorkers.noRepairsToday') || 'Nuk ka reparime te sotme per te raportuar.');
      return;
    }
    try {
      setReporting(true);
      setError(null);
      const companyId = profile!.company_id!;
      const today = todayDateStr();

      const byWorker = new Map<
        string,
        {
          worker_id: string;
          worker_name: string;
          total_quantity: number;
          entry_count: number;
          byCat: Map<string, number>;
          byProd: Map<string, number>;
        }
      >();

      for (const r of openRepairs) {
        if (!r.worker_id) continue;
        const w = workers.find((x) => x.id === r.worker_id);
        const cur = byWorker.get(r.worker_id) ?? {
          worker_id: r.worker_id,
          worker_name: w?.full_name ?? '-',
          total_quantity: 0,
          entry_count: 0,
          byCat: new Map<string, number>(),
          byProd: new Map<string, number>(),
        };
        const qty = r.quantity_repaired ?? 0;
        cur.total_quantity += qty;
        cur.entry_count += 1;
        const catName = r.category?.name ?? '-';
        cur.byCat.set(catName, (cur.byCat.get(catName) ?? 0) + qty);
        const prodName = (r.product_name || '').trim();
        if (prodName) cur.byProd.set(prodName, (cur.byProd.get(prodName) ?? 0) + qty);
        byWorker.set(r.worker_id, cur);
      }

      const workersPayload = Array.from(byWorker.values()).map((w) => ({
        worker_id: w.worker_id,
        worker_name: w.worker_name,
        total_quantity: w.total_quantity,
        entry_count: w.entry_count,
        by_category: Array.from(w.byCat.entries()).map(([name, quantity]) => ({ name, quantity })),
        by_product: Array.from(w.byProd.entries()).map(([name, quantity]) => ({ name, quantity })),
      }));

      const total = workersPayload.reduce((s, w) => s + w.total_quantity, 0);
      const entryCount = workersPayload.reduce((s, w) => s + w.entry_count, 0);

      const nowIsoReport = new Date().toISOString();
      const depotId = profile!.depot_id ?? null;

      const { data: existingReport } = await supabase
        .from('depot_repair_reports')
        .select('id')
        .eq('company_id', companyId)
        .eq('depot_id', depotId)
        .eq('report_date', today)
        .eq('scope', 'company')
        .maybeSingle();

      if (existingReport) {
        const { error: updErr, data: updData } = await supabase
          .from('depot_repair_reports')
          .update({
            total_quantity: total,
            entry_count: entryCount,
            details: { workers: workersPayload },
            sent_to_stock_at: nowIsoReport,
            sent_to_stock_by: profile!.id,
          })
          .eq('id', existingReport.id)
          .select('id');
        if (updErr) throw updErr;
        if (!updData || updData.length === 0) {
          const { error: insErr2 } = await supabase.from('depot_repair_reports').insert({
            company_id: companyId,
            depot_id: depotId,
            worker_id: null,
            scope: 'company',
            report_date: today,
            total_quantity: total,
            entry_count: entryCount,
            details: { workers: workersPayload },
            created_by: profile!.id,
            sent_to_stock_at: nowIsoReport,
            sent_to_stock_by: profile!.id,
          });
          if (insErr2) throw insErr2;
        }
      } else {
        const { error: insErr } = await supabase.from('depot_repair_reports').insert({
          company_id: companyId,
          depot_id: depotId,
          worker_id: null,
          scope: 'company',
          report_date: today,
          total_quantity: total,
          entry_count: entryCount,
          details: { workers: workersPayload },
          created_by: profile!.id,
          sent_to_stock_at: nowIsoReport,
          sent_to_stock_by: profile!.id,
        });
        if (insErr) throw insErr;
      }

      const nowIso = new Date().toISOString();
      const { error: upErr } = await supabase
        .from('depot_repairs')
        .update({ reported_at: nowIso })
        .eq('company_id', companyId)
        .is('reported_at', null)
        .gte('logged_at', todayBoundaryIso());
      if (upErr) throw upErr;

      const admins = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .in('role', ['company_admin', 'accountant']);

      if (admins.data && admins.data.length > 0) {
        const title = t('depot.repairWorkers.notifyTitle');
        const message = t('depot.repairWorkers.companyReportMessage')
          .replace('{count}', String(workersPayload.length))
          .replace('{qty}', String(total));
        const rows = admins.data.map((a: { id: string }) => ({
          user_id: a.id,
          title,
          message,
          type: 'document',
          data: { url: '/company/repair-reports' },
        }));
        await supabase.from('notifications').insert(rows);
      }

      const workerIds = workersPayload
        .map((w) => w.worker_id)
        .filter((id) => id && id !== profile!.id);
      if (workerIds.length > 0) {
        const workerNotifs = workerIds.map((wid) => ({
          user_id: wid,
          title: 'Raporti u dergua ne stok',
          message: `Punet tuaja te sotme u konfirmuan dhe u regjistruan ne stok.`,
          type: 'stock' as const,
          data: { url: '/depot/repairs', event: 'repair_confirmed' },
        }));
        await supabase.from('notifications').insert(workerNotifs);
      }

      setSuccess(t('depot.repairWorkers.reportedOk'));
      await fetchAll();
    } catch (err) {
      setError((err as Error).message || t('common.errorSaving'));
    } finally {
      setReporting(false);
    }
  }

  const companyTodayTotal = useMemo(
    () => openRepairs.reduce((s, r) => s + (r.quantity_repaired ?? 0), 0),
    [openRepairs],
  );
  const activeWorkersCount = useMemo(
    () => new Set(openRepairs.map((r) => r.worker_id).filter(Boolean)).size,
    [openRepairs],
  );

  const visibleCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.show_in_repair).map((c) => c.id)),
    [categories],
  );

  const visibleProducts = useMemo(
    () => products.filter((p) => p.is_active && p.show_in_repair && visibleCategoryIds.has(p.category_id)),
    [products, visibleCategoryIds],
  );

  const productsByCategoryId = useMemo(() => {
    const map = new Map<string, CatalogProduct[]>();
    for (const p of products) {
      const arr = map.get(p.category_id) ?? [];
      arr.push(p);
      map.set(p.category_id, arr);
    }
    return map;
  }, [products]);

  const productsByCategory = useMemo(() => {
    const map = new Map<string, CatalogProduct[]>();
    for (const p of visibleProducts) {
      const key = p.category_name || '—';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => compareCategoriesByPriority(a[0], b[0]));
  }, [visibleProducts]);

  async function toggleProductVisibility(prod: CatalogProduct) {
    if (savingProductId) return;
    try {
      setSavingProductId(prod.id);
      setError(null);
      const next = !prod.show_in_repair;
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, show_in_repair: next } : p)),
      );
      const { error: upErr } = await supabase
        .from('category_products')
        .update({ show_in_repair: next })
        .eq('id', prod.id);
      if (upErr) {
        setProducts((prev) =>
          prev.map((p) => (p.id === prod.id ? { ...p, show_in_repair: !next } : p)),
        );
        throw upErr;
      }
    } catch (err) {
      setError((err as Error).message || t('common.errorSaving'));
    } finally {
      setSavingProductId(null);
    }
  }

  async function toggleCategoryVisibility(cat: CategoryRow) {
    if (savingCategoryId) return;
    try {
      setSavingCategoryId(cat.id);
      setError(null);
      const next = !cat.show_in_repair;
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, show_in_repair: next } : c)),
      );
      const { error: upErr } = await supabase
        .from('product_categories')
        .update({ show_in_repair: next })
        .eq('id', cat.id);
      if (upErr) {
        setCategories((prev) =>
          prev.map((c) => (c.id === cat.id ? { ...c, show_in_repair: !next } : c)),
        );
        throw upErr;
      }
    } catch (err) {
      setError((err as Error).message || t('common.errorSaving'));
    } finally {
      setSavingCategoryId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-xl font-bold text-gray-900">{t('depot.repairWorkers.title')}</h1>

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
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3 animate-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-emerald-700 text-sm flex-1 font-medium">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Workers panel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Puntoret</h3>
            <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-700">
              {workers.length}
            </span>
          </div>
          {workers.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              {t('depot.repairWorkers.empty')}
            </div>
          ) : (
            <div className="p-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {workers.map((w) => {
                const isSelected = selectedWorkerId === w.id;
                const flash = justUpdatedId === w.id;
                const wBatch = getWorkerBatchSize(w.id);
                const isEditing = editingBatchWorkerId === w.id;
                return (
                  <div key={w.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setSelectedWorkerId(isSelected ? null : w.id)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-500'
                          : flash
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-teal-600 text-white flex items-center justify-center shadow z-10">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      )}
                      <p className={`text-sm truncate ${isSelected ? 'text-teal-900 font-bold' : 'text-slate-900 font-semibold'}`}>
                        {w.full_name}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-500 leading-tight">
                          <span className="font-bold text-teal-700">{w.total_today}</span> paleta
                        </p>
                        <span className="text-[9px] text-slate-400 font-medium">x{wBatch}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBatchWorkerId(isEditing ? null : w.id);
                        setEditingBatchValue(String(wBatch));
                      }}
                      className="absolute top-0.5 left-0.5 p-0.5 rounded text-slate-300 hover:text-teal-600 hover:bg-teal-50 transition-colors z-10"
                      title="Ndrysho sasin per seri"
                    >
                      <Settings className="w-2.5 h-2.5" />
                    </button>
                    {isEditing && (
                      <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-lg border border-slate-200 shadow-lg p-2 w-32" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[10px] text-slate-500 font-medium block mb-1">{t('common.sasiaPerSeri')}</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={editingBatchValue}
                            onChange={(e) => setEditingBatchValue(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-teal-500 focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const v = parseInt(editingBatchValue, 10);
                                if (v > 0) { setWorkerBatchSize(w.id, v); }
                                setEditingBatchWorkerId(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const v = parseInt(editingBatchValue, 10);
                              if (v > 0) { setWorkerBatchSize(w.id, v); }
                              setEditingBatchWorkerId(null);
                            }}
                            className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700"
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Products panel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Produktet</h3>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-700">
              {visibleProducts.length}
            </span>
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition-colors"
              title="Konfiguro kategorit"
            >
              <Settings className="w-3.5 h-3.5" />{t('common.kategorit')}</button>
          </div>
          {visibleProducts.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">{t('common.nukKaKategoriTeZgjedhuraHap')}</div>
          ) : (
            <div className="p-2 space-y-2">
              {productsByCategory.map(([catName, items]) => (
                <div key={catName}>
                  <p className="px-1 pb-1 text-[10px] font-semibold text-teal-700 uppercase tracking-wide">
                    {catName}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {items.map((p) => {
                      const isSelected = selectedProductId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProductId(isSelected ? null : p.id)}
                          className={`relative px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-500'
                              : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-teal-600 text-white flex items-center justify-center shadow">
                              <CheckCircle2 className="w-3 h-3" />
                            </div>
                          )}
                          <p
                            className={`text-sm truncate ${
                              isSelected ? 'text-teal-900 font-bold' : 'text-slate-900 font-medium'
                            }`}
                            title={p.name}
                          >
                            {shortProductName(p.name, p.category_name)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Complete button bar */}
      <div
        className={`sticky-above-nav rounded-xl border p-3 transition-colors ${
          canComplete
            ? 'bg-white border-teal-200 shadow-md'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Selektimi aktual</p>
            <p className="text-sm text-gray-700">
              <span className="font-semibold">
                {selectedWorker?.full_name ?? <span className="text-gray-400">{t('common.zgjidhPuntorin')}</span>}
              </span>
              <span className="text-gray-400 mx-2">·</span>
              <span className="font-semibold">
                {selectedProduct?.name ?? <span className="text-gray-400">{t('common.zgjidhProduktin')}</span>}
              </span>
              <span className="text-gray-400 mx-2">·</span>
              <span className="font-bold text-teal-700">+{batchSize} paleta</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(selectedWorkerId || selectedProductId) && (
              <button
                type="button"
                onClick={resetSelection}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Pastro
              </button>
            )}
            <button
              type="button"
              onClick={handleComplete}
              disabled={!canComplete}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Perfundo (+{batchSize})
            </button>
          </div>
        </div>
      </div>

      {/* Daily depot reports */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <FileText className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            {t('depot.repairWorkers.pastCompanyReports')}
          </h3>
        </div>
        <div className="divide-y divide-gray-50">
          {reports.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">
              {t('depot.repairWorkers.noReports')}
            </p>
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
                      {open ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(r.report_date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(r.details?.workers ?? []).length}{' '}
                        {t('depot.repairWorkers.workersFinished')}
                      </p>
                    </div>
                    <span className="text-base font-bold text-teal-700 flex-shrink-0">
                      {r.total_quantity}
                    </span>
                  </button>
                  {open && (
                    <div className="bg-gray-50 px-5 py-4 space-y-3 border-t border-gray-100">
                      {(r.details?.workers ?? []).map((w) => (
                        <div
                          key={w.worker_id}
                          className="bg-white rounded-lg border border-gray-100 p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                                <Wrench className="w-4 h-4 text-teal-600" />
                              </div>
                              <p className="text-sm font-semibold text-gray-900">
                                {w.worker_name}
                              </p>
                            </div>
                            <span className="text-base font-bold text-teal-700">
                              {w.total_quantity}
                            </span>
                          </div>
                          {(w.by_product ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {(w.by_product ?? []).map((p) => (
                                <span
                                  key={p.name}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-teal-50 border border-teal-100"
                                >
                                  <span className="text-teal-700">{p.name}</span>
                                  <span className="font-semibold text-teal-800">
                                    {p.quantity}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          {(w.by_category ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {(w.by_category ?? []).map((c) => (
                                <span
                                  key={c.name}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-gray-50 border border-gray-200"
                                >
                                  <span className="text-gray-600">{c.name}</span>
                                  <span className="font-semibold text-gray-800">
                                    {c.quantity}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showCategoryModal && (
        <div
          className="fixed inset-0 z-modal bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowCategoryModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl modal-panel flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{t('common.kategoritPerReparim')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{t('common.zgjidhCilatKategoriShfaqenNeTabelen')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 modal-body-scroll p-3">
              {categories.length === 0 ? (
                <p className="p-6 text-center text-sm text-gray-400">{t('common.nukKaKategori')}</p>
              ) : (
                <div className="space-y-1.5">
                  {categories
                    .slice()
                    .sort((a, b) => compareCategoriesByPriority(a.name, b.name))
                    .map((c) => {
                      const checked = c.show_in_repair;
                      const busy = savingCategoryId === c.id;
                      const isOpen = expandedCategoryId === c.id;
                      const catProducts = (productsByCategoryId.get(c.id) ?? [])
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name));
                      return (
                        <div
                          key={c.id}
                          className={`rounded-xl border overflow-hidden ${
                            checked ? 'border-teal-200' : 'border-gray-200'
                          }`}
                        >
                          <div
                            className={`flex items-center gap-2 px-2 py-2 ${
                              checked ? 'bg-teal-50' : 'bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategoryVisibility(c);
                              }}
                              disabled={busy}
                              className="flex items-center justify-center flex-shrink-0 p-1 rounded hover:bg-white/60"
                              title={checked ? 'C\'aktivizo kategorine' : 'Aktivizo kategorine'}
                            >
                              <div
                                className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                                  checked
                                    ? 'bg-teal-600 border-teal-600'
                                    : 'bg-white border-gray-300'
                                }`}
                              >
                                {busy ? (
                                  <Loader2 className="w-3 h-3 text-teal-600 animate-spin" />
                                ) : checked ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                ) : null}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedCategoryId(isOpen ? null : c.id)}
                              className="flex-1 flex items-center gap-2 text-left px-1 py-1"
                            >
                              <span
                                className={`flex-1 text-sm ${
                                  checked ? 'font-semibold text-teal-900' : 'text-gray-700'
                                }`}
                              >
                                {c.name}
                              </span>
                              <span className="text-[11px] text-gray-500">
                                {catProducts.filter((p) => p.show_in_repair).length}/
                                {catProducts.length}
                              </span>
                              {isOpen ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                          {isOpen && (
                            <div className="border-t border-gray-100 bg-white px-2 py-2 space-y-1">
                              {catProducts.length === 0 ? (
                                <p className="text-xs text-gray-400 px-2 py-2">{t('common.nukKaProdukteNeKeteKategori2')}</p>
                              ) : (
                                catProducts.map((p) => {
                                  const pChecked = p.show_in_repair;
                                  const pBusy = savingProductId === p.id;
                                  const pInactive = !p.is_active;
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => !pInactive && toggleProductVisibility(p)}
                                      disabled={pBusy || pInactive}
                                      title={pInactive ? 'Produkt joaktiv - kerko adminin te aktivizoje' : ''}
                                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors ${
                                        pInactive
                                          ? 'bg-amber-50/40 cursor-not-allowed'
                                          : pChecked
                                          ? 'bg-teal-50/60 hover:bg-teal-50'
                                          : 'hover:bg-gray-50'
                                      }`}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                          pInactive
                                            ? 'bg-gray-100 border-gray-300'
                                            : pChecked
                                            ? 'bg-teal-600 border-teal-600'
                                            : 'bg-white border-gray-300'
                                        }`}
                                      >
                                        {pBusy ? (
                                          <Loader2 className="w-2.5 h-2.5 text-teal-600 animate-spin" />
                                        ) : pChecked && !pInactive ? (
                                          <CheckCircle2 className="w-3 h-3 text-white" />
                                        ) : null}
                                      </div>
                                      <span
                                        className={`flex-1 text-sm ${
                                          pInactive
                                            ? 'text-gray-400 italic'
                                            : pChecked
                                            ? 'text-teal-900 font-medium'
                                            : 'text-gray-600'
                                        }`}
                                      >
                                        {p.name}
                                      </span>
                                      {pInactive && (
                                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{t('common.inactive')}</span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            <div className="modal-footer px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl sm:rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
              >{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Totali i sotem i depos — moved BELOW past reports */}
      <div className="bg-gradient-to-br from-teal-600 to-emerald-600 rounded-xl p-5 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-teal-100">
              {t('depot.repairWorkers.todayCompanyTotal')}
            </p>
            <p className="text-4xl font-bold mt-1">{companyTodayTotal}</p>
            <p className="text-xs text-teal-100 mt-1">
              {activeWorkersCount} puntor aktiv sot · {openRepairs.length} regjistrime
            </p>
          </div>
          <button
            onClick={handleReportToAdmin}
            disabled={reporting || openRepairs.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-teal-700 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {reporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {t('depot.repairWorkers.reportToAdmin')}
          </button>
        </div>
      </div>
    </div>
  );
}
