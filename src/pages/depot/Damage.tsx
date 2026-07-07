import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, ShieldAlert, Package, Minus, Plus, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface CategoryProduct {
  id: string;
  name: string;
  category_id: string;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface StockRow {
  id: string;
  category_product_id: string;
  condition: string;
  quantity: number;
}

interface DamageReport {
  id: string;
  product_name: string | null;
  condition_from: string;
  quantity: number;
  reason: string | null;
  created_at: string;
  reporter?: { full_name?: string | null } | null;
}

const CONDITION_LABELS: Record<string, string> = {
  good: 'I gatshëm',
  ready_a: 'Ready A',
  ready_b: 'Ready B',
  ready_c: 'Ready C',
  repaired: 'I riparuar',
  sorting: 'Ne sortim',
};

export default function DepotDamage() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [history, setHistory] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'report' | 'history'>('report');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState('');
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    if (!profile?.company_id || !profile.depot_id) return;
    setLoading(true);
    const [prodRes, catRes, stockRes, histRes] = await Promise.all([
      supabase
        .from('category_products')
        .select('id, name, category_id')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('product_categories')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .order('name'),
      supabase
        .from('stock')
        .select('id, category_product_id, condition, quantity')
        .eq('company_id', profile.company_id)
        .eq('depot_id', profile.depot_id)
        .gt('quantity', 0),
      supabase
        .from('stock_damage_reports')
        .select('id, product_name, condition_from, quantity, reason, created_at, reporter:profiles!stock_damage_reports_reported_by_fkey(full_name)')
        .eq('company_id', profile.company_id)
        .eq('depot_id', profile.depot_id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setProducts((prodRes.data as CategoryProduct[]) ?? []);
    setCategories((catRes.data as CategoryRow[]) ?? []);
    setStock((stockRes.data as StockRow[]) ?? []);
    setHistory((histRes.data as unknown as DamageReport[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, profile?.depot_id]);

  // Good-stock available per product in this depot (what can be marked damaged).
  const goodByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) {
      if (s.condition !== 'good') continue;
      m.set(s.category_product_id, (m.get(s.category_product_id) ?? 0) + (s.quantity || 0));
    }
    return m;
  }, [stock]);

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  // Only products that actually have good stock to damage, grouped by category.
  const groups = useMemo(() => {
    const byCat = new Map<string, CategoryProduct[]>();
    for (const p of products) {
      if ((goodByProduct.get(p.id) ?? 0) <= 0) continue;
      const arr = byCat.get(p.category_id) ?? [];
      arr.push(p);
      byCat.set(p.category_id, arr);
    }
    return Array.from(byCat.entries())
      .map(([cid, items]) => ({ cid, name: catName.get(cid) ?? '—', items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, goodByProduct, catName]);

  function bump(delta: number) {
    const cur = parseInt(quantity || '0', 10) || 0;
    setQuantity(String(Math.max(0, cur + delta)));
  }

  async function applyDamage(p: CategoryProduct) {
    setError(null);
    setSuccess(null);
    const q = parseInt(quantity || '0', 10);
    if (q <= 0) {
      setError(t('depot.damage.enterQtyFirst') || 'Shkruani sasinë e dëmtuar në fillim.');
      return;
    }
    const avail = goodByProduct.get(p.id) ?? 0;
    if (q > avail) {
      setError(`${p.name}: stoku i mirë është vetëm ${avail}.`);
      return;
    }
    if (!profile?.depot_id) return setError(t('depot.damage.noDepot') || 'Llogaria juaj nuk ka depo te caktuar');

    setBusyProductId(p.id);
    const { error: rpcErr } = await supabase.rpc('report_stock_damage', {
      p_depot_id: profile.depot_id,
      p_category_product_id: p.id,
      p_quantity: q,
      p_reason: reason || null,
      p_condition_from: 'good',
    });
    setBusyProductId(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(`${q} × ${p.name} → të dëmtuara`);
    setQuantity('');
    void load();
    setTimeout(() => setSuccess(null), 2500);
  }

  if (!profile?.depot_id) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{t('common.llogariaJuajNukKaDepoTe')}</p>
        </div>
      </div>
    );
  }

  const qtyNum = parseInt(quantity || '0', 10) || 0;

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" /> {t('depot.damage.title') || 'Dëmtimet'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          {t('depot.damage.subtitle') || 'Shkruani sasinë, pastaj prekni produktin që u dëmtua.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex bg-slate-100 rounded-lg p-1 gap-1 text-sm">
        <button
          onClick={() => setTab('report')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${tab === 'report' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600'}`}
        >
          {t('depot.damage.tabReport') || 'Dëmto'}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors inline-flex items-center gap-1.5 ${tab === 'history' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600'}`}
        >
          <FileText className="w-3.5 h-3.5" />{t('depot.damage.tabHistory') || 'Raportet'}
          {history.length > 0 && <span className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-1.5">{history.length}</span>}
        </button>
      </div>

      {tab === 'report' ? (
        <>
          {/* Quantity: sticky at top so it stays visible while tapping products */}
          <div className="sticky top-0 z-10 bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{t('common.sasiaEDemtuar') || 'Sasia e dëmtuar'}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bump(-1)}
                className="w-11 h-11 rounded-lg border border-slate-300 text-slate-700 flex items-center justify-center active:bg-slate-100 flex-shrink-0"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => bump(1)}
                className="w-11 h-11 rounded-lg border border-slate-300 text-slate-700 flex items-center justify-center active:bg-slate-100 flex-shrink-0"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('depot.damage.reasonPlaceholder') || 'Arsyeja (opsionale) — p.sh. gjatë ngarkimit'}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {error && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">{error}</div>
            )}
            {success && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{success}
              </div>
            )}
          </div>

          {/* Product buttons — small, mobile-first. Tap to damage `quantity`. */}
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
              <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              {t('depot.damage.noGoodStock') || 'Nuk ka stok të mirë për të dëmtuar.'}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.cid}>
                  <p className="px-0.5 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{g.name}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {g.items.map((p) => {
                      const good = goodByProduct.get(p.id) ?? 0;
                      const disabled = busyProductId !== null || qtyNum <= 0 || qtyNum > good;
                      return (
                        <button
                          key={p.id}
                          onClick={() => applyDamage(p)}
                          disabled={disabled}
                          className="flex flex-col items-start gap-0.5 px-2 py-2 rounded-lg border border-slate-200 bg-white text-left active:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <span className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2 w-full">{p.name}</span>
                          <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                            {busyProductId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {good}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">{t('depot.damage.historyTitle') || 'Historiku i dëmtimeve'}</h2>
          </div>
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
          ) : history.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">{t('common.asnjeDemtimIRaportuarEnde')}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map((h) => (
                <li key={h.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{h.product_name ?? '—'}</p>
                    <p className="text-xs text-slate-500">
                      {CONDITION_LABELS[h.condition_from] ?? h.condition_from} → I dëmtuar
                      {h.reason ? ` · ${h.reason}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(h.created_at).toLocaleString()} {h.reporter?.full_name ? `· ${h.reporter.full_name}` : ''}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-amber-700 flex-shrink-0">{h.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
