import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

/** Minimal shape of an available-stock row this modal needs. */
export interface ConvertStockRow {
  depot_id: string;
  category_id: string;
  category_name?: string | null;
  category_product_id: string | null;
  product_name?: string | null;
  condition: string;
  quantity: number;
}

interface Props {
  companyId: string;
  /** Depot page: lock to this depot. Company page: omit and pass `depots`. */
  fixedDepotId?: string;
  depots?: Array<{ id: string; name: string }>;
  /** Available stock in scope (a depot's rows, or all depots for the company page). */
  rows: ConvertStockRow[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Class conversion / reclassification. Moves a quantity from one product
 * (class) to another **within the same category** and **same condition**, in
 * either direction. Calls the `convert_stock` RPC, which does the whole
 * transformation atomically (decrement source, increment target, ledger).
 */
export default function StockConvertModal({ companyId, fixedDepotId, depots, rows, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [depotId, setDepotId] = useState(fixedDepotId ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [fromProduct, setFromProduct] = useState('');
  const [toProduct, setToProduct] = useState('');
  const [condition, setCondition] = useState('good');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depotRows = useMemo(() => rows.filter((r) => r.depot_id === depotId), [rows, depotId]);

  // Categories that have stock in the selected depot.
  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of depotRows) if (r.category_id) m.set(r.category_id, r.category_name ?? '—');
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [depotRows]);

  // Conditions in which the chosen source class actually has stock.
  const conditionsForFrom = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of depotRows) {
      if (r.category_id === categoryId && r.category_product_id === fromProduct && r.quantity > 0) {
        m.set(r.condition, (m.get(r.condition) ?? 0) + r.quantity);
      }
    }
    return m;
  }, [depotRows, categoryId, fromProduct]);

  const available = conditionsForFrom.get(condition) ?? 0;

  // Source classes = products of the category that hold stock in this depot.
  const fromOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of depotRows) {
      if (r.category_id === categoryId && r.category_product_id && r.quantity > 0) {
        m.set(r.category_product_id, r.product_name ?? '—');
      }
    }
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [depotRows, categoryId]);

  // Load ALL products of the category as target options (target may have 0 stock yet).
  useEffect(() => {
    if (!categoryId || !companyId) {
      setProducts([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('category_products')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('category_id', categoryId)
        .order('name');
      if (active) setProducts(((data ?? []) as Array<{ id: string; name: string }>));
    })();
    return () => {
      active = false;
    };
  }, [categoryId, companyId]);

  // Keep the condition valid for the chosen source class.
  useEffect(() => {
    if (conditionsForFrom.size > 0 && !conditionsForFrom.has(condition)) {
      setCondition(conditionsForFrom.has('good') ? 'good' : [...conditionsForFrom.keys()][0]);
    }
  }, [conditionsForFrom]); // eslint-disable-line react-hooks/exhaustive-deps

  const qtyNum = Number(quantity);
  const canSubmit =
    depotId && categoryId && fromProduct && toProduct && fromProduct !== toProduct &&
    qtyNum > 0 && qtyNum <= available && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('convert_stock', {
        p_depot_id: depotId,
        p_category_id: categoryId,
        p_from_product_id: fromProduct,
        p_to_product_id: toProduct,
        p_condition: condition,
        p_quantity: qtyNum,
        p_reason: reason,
      });
      if (rpcErr) throw rpcErr;
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-semibold text-slate-900">{t('company.stockConvert.title')}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {!fixedDepotId && depots && (
          <label className="block text-sm">
            <span className="text-slate-600">{t('company.stockConvert.depot')}</span>
            <select value={depotId} onChange={(e) => { setDepotId(e.target.value); setCategoryId(''); setFromProduct(''); setToProduct(''); }}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2">
              <option value="">—</option>
              {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="text-slate-600">{t('company.stockConvert.category')}</span>
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setFromProduct(''); setToProduct(''); }}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" disabled={!depotId}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">{t('company.stockConvert.fromClass')}</span>
            <select value={fromProduct} onChange={(e) => setFromProduct(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" disabled={!categoryId}>
              <option value="">—</option>
              {fromOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">{t('company.stockConvert.toClass')}</span>
            <select value={toProduct} onChange={(e) => setToProduct(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" disabled={!categoryId}>
              <option value="">—</option>
              {products.filter((p) => p.id !== fromProduct).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">{t('company.stockConvert.condition')}</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" disabled={!fromProduct}>
              {[...conditionsForFrom.keys()].length === 0 ? <option value="good">good</option>
                : [...conditionsForFrom.keys()].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">{t('company.stockConvert.quantity')}</span>
            <input type="number" min={1} max={available} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" disabled={!fromProduct} />
            <span className="text-xs text-slate-400">{t('company.stockConvert.available')}: {available}</span>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">{t('company.stockConvert.reason')}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={t('company.stockConvert.reasonPlaceholder')}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" />
        </label>

        {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            {t('company.stockConvert.cancel')}
          </button>
          <button onClick={() => void submit()} disabled={!canSubmit}
            className="text-sm px-4 py-2 rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {submitting ? t('company.stockConvert.converting') : t('company.stockConvert.convert')}
          </button>
        </div>
      </div>
    </div>
  );
}
