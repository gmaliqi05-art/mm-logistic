import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, Send, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface CategoryProduct {
  id: string;
  name: string;
  category_id: string;
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
  const [stock, setStock] = useState<StockRow[]>([]);
  const [history, setHistory] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState('');
  const [conditionFrom, setConditionFrom] = useState('good');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function load() {
    if (!profile?.company_id || !profile.depot_id) return;
    setLoading(true);
    const [prodRes, stockRes, histRes] = await Promise.all([
      supabase
        .from('category_products')
        .select('id, name, category_id')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
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
    setStock((stockRes.data as StockRow[]) ?? []);
    setHistory((histRes.data as unknown as DamageReport[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, profile?.depot_id]);

  const available = useMemo(() => {
    if (!productId) return 0;
    return stock
      .filter((s) => s.category_product_id === productId && s.condition === conditionFrom)
      .reduce((acc, s) => acc + (s.quantity || 0), 0);
  }, [productId, conditionFrom, stock]);

  async function submit() {
    setError(null);
    setSuccess(false);
    const q = parseInt(quantity || '0', 10);
    if (!productId) return setError(t('depot.damage.pickProduct') || 'Zgjidhni produktin');
    if (q <= 0) return setError(t('depot.stock.positiveQty') || 'Sasia duhet te jete me e madhe se 0');
    if (q > available) {
      const condLabel = CONDITION_LABELS[conditionFrom] ?? conditionFrom;
      const tpl = t('depot.damage.exceedsAvailable') || 'Stoku ne gjendjen "{condition}" eshte vetem {available}';
      return setError(tpl.replace('{condition}', String(condLabel)).replace('{available}', String(available)));
    }
    if (!profile?.depot_id) return setError(t('depot.damage.noDepot') || 'Llogaria juaj nuk ka depo te caktuar');

    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('report_stock_damage', {
      p_depot_id: profile.depot_id,
      p_category_product_id: productId,
      p_quantity: q,
      p_reason: reason || null,
      p_condition_from: conditionFrom,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(true);
    setQuantity('');
    setReason('');
    void load();
    setTimeout(() => setSuccess(false), 2500);
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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-600" /> Raportim demtimi
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t('common.regjistroniPaletatQeDemtohenNeStok')}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Produkti</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">{t('common.zgjidhniProduktin')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Gjendja burim</span>
            <select
              value={conditionFrom}
              onChange={(e) => setConditionFrom(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{t('common.sasiaEDemtuar')}</span>
            <input
              type="number"
              min={0}
              max={available}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">Ne gjendje: {available}</p>
          </label>
          <label className="block sm:col-span-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Arsyeja (opsionale)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="p.sh. derguar gabimisht, transport, etj."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
        </div>

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</div>
        )}
        {success && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />{t('common.demtimiURegjistruaStokuUPerditesua')}</div>
        )}

        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={submitting || !productId || available <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Raporto demtimin
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Historiku i demtimeve</h2>
        </div>
        {loading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
        ) : history.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 text-center">{t('common.asnjeDemtimIRaportuarEnde')}</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{h.product_name ?? '—'}</p>
                  <p className="text-xs text-slate-500">
                    {CONDITION_LABELS[h.condition_from] ?? h.condition_from} -&gt; I demtuar
                    {h.reason ? ` · ${h.reason}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(h.created_at).toLocaleString()} {h.reporter?.full_name ? `· ${h.reporter.full_name}` : ''}
                  </p>
                </div>
                <span className="text-lg font-bold text-amber-700">{h.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
