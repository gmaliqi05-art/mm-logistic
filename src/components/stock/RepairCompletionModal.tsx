import { useEffect, useState } from 'react';
import { X, Loader2, Wrench, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface Props {
  stockId: string;
  onClose: () => void;
  onApplied?: () => void;
}

interface StockDetail {
  id: string;
  company_id: string;
  depot_id: string | null;
  category_id: string | null;
  quantity: number;
  category_name?: string;
  depot_name?: string;
}

interface CategoryProduct {
  id: string;
  name: string;
}

interface ReparatureOption {
  id: string;
  full_name: string;
}

export default function RepairCompletionModal({ stockId, onClose, onApplied }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [reparatures, setReparatures] = useState<ReparatureOption[]>([]);
  const [targetProductId, setTargetProductId] = useState('');
  const [reparatorId, setReparatorId] = useState('');
  const [repairedQty, setRepairedQty] = useState<string>('');
  const [scrappedQty, setScrappedQty] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('stock')
        .select('id, company_id, depot_id, category_id, quantity, category:product_categories(name), depot:depots(name)')
        .eq('id', stockId)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message ?? 'Stoku nuk u gjet');
        setLoading(false);
        return;
      }
      const cat = Array.isArray((data as any).category) ? (data as any).category[0] : (data as any).category;
      const dep = Array.isArray((data as any).depot) ? (data as any).depot[0] : (data as any).depot;
      setDetail({
        id: data.id,
        company_id: data.company_id,
        depot_id: data.depot_id,
        category_id: data.category_id,
        quantity: data.quantity,
        category_name: cat?.name ?? null,
        depot_name: dep?.name ?? null,
      });
      if (data.category_id) {
        const { data: prods } = await supabase
          .from('category_products')
          .select('id, name')
          .eq('company_id', data.company_id)
          .eq('category_id', data.category_id)
          .eq('is_active', true)
          .order('name');
        if (!cancelled && prods) {
          setProducts(prods);
          if (prods.length > 0) setTargetProductId(prods[0].id);
        }
      }
      const { data: workers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', data.company_id)
        .eq('role', 'depot_worker')
        .eq('worker_category', 'reparature')
        .eq('is_active', true)
        .order('full_name');
      if (!cancelled && workers) {
        setReparatures(workers as ReparatureOption[]);
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [stockId]);

  async function submit() {
    if (!detail) return;
    setError(null);
    const r = parseInt(repairedQty || '0', 10);
    const s = parseInt(scrappedQty || '0', 10);
    if (r < 0 || s < 0 || r + s <= 0) {
      setError(t('stock.repairModal.addQty'));
      return;
    }
    if (r + s > detail.quantity) {
      setError(`${t('stock.repairModal.totalExceeds')} ${r + s} > ${detail.quantity}`);
      return;
    }
    if (r > 0 && !targetProductId) {
      setError(t('stock.repairModal.pickProduct'));
      return;
    }
    if (!reparatorId) {
      setError(t('stock.repairModal.pickReparator'));
      return;
    }
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc('apply_repair_from_stock', {
      p_stock_id: detail.id,
      p_repaired_qty: r,
      p_scrapped_qty: s,
      p_target_category_product_id: targetProductId || null,
      p_worker_id: reparatorId,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      onApplied?.();
      onClose();
    }, 900);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Raporto riparim</h2>
              <p className="text-xs text-slate-500">
                {detail?.category_name ?? '—'}
                {detail?.depot_name ? ` · ${detail.depot_name}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : detail ? (
          <div className="p-5 space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-amber-600 font-medium">Stoku defekt i disponueshem</p>
              <p className="text-3xl font-bold text-amber-800 mt-1">{detail.quantity}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumField label="Te riparuara" value={repairedQty} onChange={setRepairedQty} max={detail.quantity} />
              <NumField label="Scrap (hedhur)" value={scrappedQty} onChange={setScrappedQty} max={detail.quantity} />
            </div>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Produkti i synuar (ku shkojne te riparuarat)</span>
              <select
                value={targetProductId}
                onChange={(e) => setTargetProductId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Zgjidhni produktin...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Reparatori qe e ka kryer punen</span>
              <select
                value={reparatorId}
                onChange={(e) => setReparatorId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Zgjidhni reparatorin...</option>
                {reparatures.map((w) => (
                  <option key={w.id} value={w.id}>{w.full_name}</option>
                ))}
              </select>
            </label>

            {error && (
              <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4" /> Raportimi u aplikua me sukses
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-100">
                Anulo
              </button>
              <button
                onClick={submit}
                disabled={saving || detail.quantity <= 0}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Aplikoni raportimin
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 text-sm text-rose-700">{error}</div>
        )}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </label>
  );
}
