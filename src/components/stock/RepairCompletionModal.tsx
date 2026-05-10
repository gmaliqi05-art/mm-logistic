import { useEffect, useState } from 'react';
import { X, Loader2, Wrench, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  repairId: string;
  onClose: () => void;
  onApplied?: () => void;
}

interface RepairDetail {
  id: string;
  company_id: string;
  depot_id: string | null;
  category_id: string | null;
  quantity_in: number;
  quantity_repaired: number;
  quantity_scrapped: number;
  category?: { id: string; name: string } | null;
  depot?: { name: string } | null;
}

interface CategoryProduct {
  id: string;
  name: string;
}

export default function RepairCompletionModal({ repairId, onClose, onApplied }: Props) {
  const [detail, setDetail] = useState<RepairDetail | null>(null);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [targetProductId, setTargetProductId] = useState('');
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
        .from('depot_repairs')
        .select('*, category:product_categories(id,name), depot:depots(name)')
        .eq('id', repairId)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message ?? 'Reparimi nuk u gjet');
        setLoading(false);
        return;
      }
      setDetail(data as RepairDetail);
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
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repairId]);

  const remaining = detail ? detail.quantity_in - detail.quantity_repaired - detail.quantity_scrapped : 0;

  async function submit() {
    if (!detail) return;
    setError(null);
    const r = parseInt(repairedQty || '0', 10);
    const s = parseInt(scrappedQty || '0', 10);
    if (r < 0 || s < 0 || r + s <= 0) {
      setError('Shtoni se paku nje sasi te riparuar ose scrap');
      return;
    }
    if (r + s > remaining) {
      setError(`Totali ${r + s} tejkalon te mbeturat (${remaining})`);
      return;
    }
    if (r > 0 && !targetProductId) {
      setError('Zgjidhni produktin e synuar per paletat e riparuara');
      return;
    }
    setSaving(true);
    const { error: rpcErr } = await supabase.rpc('apply_repair_completion', {
      p_repair_id: detail.id,
      p_repaired_qty: r,
      p_scrapped_qty: s,
      p_target_category_product_id: targetProductId || null,
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
            <span className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Raporto riparim</h2>
              <p className="text-xs text-slate-500">
                {detail?.category?.name ?? '—'}
                {detail?.depot?.name ? ` · ${detail.depot.name}` : ''}
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
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Hyri" value={detail.quantity_in} tone="slate" />
              <Stat label="Repar." value={detail.quantity_repaired} tone="emerald" />
              <Stat label="Scrap" value={detail.quantity_scrapped} tone="rose" />
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Mbeten <strong>{remaining}</strong> paleta per raportim.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumField label="Te riparuara" value={repairedQty} onChange={setRepairedQty} max={remaining} />
              <NumField label="Scrap (hedhur)" value={scrappedQty} onChange={setScrappedQty} max={remaining} />
            </div>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Produkti i synuar</span>
              <select
                value={targetProductId}
                onChange={(e) => setTargetProductId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Zgjidhni produktin...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
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
                disabled={saving || remaining <= 0}
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

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'rose' }) {
  const toneMap: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  return (
    <div className={`rounded-lg border p-2 ${toneMap[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
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
