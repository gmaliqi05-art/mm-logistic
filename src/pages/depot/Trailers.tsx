import { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  X,
  User,
  Package,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notifyUsers } from '../../utils/notifications';

type TrailerStatus = 'available' | 'claimed' | 'dispatched' | 'cancelled';

interface TrailerLoad {
  id: string;
  company_id: string;
  depot_id: string | null;
  plate_number: string;
  title: string;
  notes: string | null;
  status: TrailerStatus;
  assigned_driver_id: string | null;
  claimed_by_driver_id: string | null;
  claimed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assigned_driver?: { id: string; full_name: string } | null;
  claimed_driver?: { id: string; full_name: string } | null;
  items?: TrailerItem[];
}

interface TrailerItem {
  id: string;
  trailer_load_id: string;
  product_title: string;
  category_product_id: string | null;
  product_name: string;
  quantity: number;
  position: number;
}

interface Driver {
  id: string;
  full_name: string;
}

interface CategoryProduct {
  id: string;
  name: string;
}

const statusStyle: Record<TrailerStatus, { label: string; cls: string }> = {
  available: { label: 'E lire', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  claimed: { label: 'E marrur', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  dispatched: { label: 'E derguar', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  cancelled: { label: 'E anuluar', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

export default function DepotTrailersPage() {
  const { profile } = useAuth();
  const [trailers, setTrailers] = useState<TrailerLoad[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TrailerStatus | 'all'>('all');
  const [editing, setEditing] = useState<TrailerLoad | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const companyId = profile?.company_id ?? null;
  const depotId = profile?.depot_id ?? null;

  useEffect(() => {
    if (!companyId) return;
    void fetchAll();

    const channel = supabase
      .channel(`trailer_loads_${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trailer_loads', filter: `company_id=eq.${companyId}` },
        () => {
          void fetchAll();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  async function fetchAll() {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const [trailerRes, driverRes, productRes] = await Promise.all([
        supabase
          .from('trailer_loads')
          .select(`
            *,
            assigned_driver:profiles!trailer_loads_assigned_driver_id_fkey(id, full_name),
            claimed_driver:profiles!trailer_loads_claimed_by_driver_id_fkey(id, full_name),
            items:trailer_load_items(*)
          `)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('company_id', companyId)
          .eq('role', 'driver')
          .eq('is_active', true)
          .order('full_name'),
        supabase
          .from('category_products')
          .select('id, name')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
      ]);
      if (trailerRes.error) throw trailerRes.error;
      if (driverRes.error) throw driverRes.error;
      if (productRes.error) throw productRes.error;
      const rows = (trailerRes.data ?? []) as TrailerLoad[];
      for (const r of rows) {
        r.items = (r.items ?? []).slice().sort((a, b) => a.position - b.position);
      }
      setTrailers(rows);
      setDrivers(driverRes.data ?? []);
      setProducts(productRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ngarkimit');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trailers.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.plate_number.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.assigned_driver?.full_name ?? '').toLowerCase().includes(q) ||
        (t.claimed_driver?.full_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [trailers, statusFilter, search]);

  async function handleDelete(id: string) {
    if (!confirm('Fshij kete rimorkio?')) return;
    const { error: err } = await supabase.from('trailer_loads').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    setToast('Rimorkia u fshi');
    void fetchAll();
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-teal-600" />
            Rimorkiot
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Regjistro tabelat dhe ngarkesat e rimorkiove per shoferet
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Rimorkio e re
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kerko sipas targe, titulli ose shoferit"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TrailerStatus | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
        >
          <option value="all">Te gjitha</option>
          <option value="available">E lire</option>
          <option value="claimed">E marrur</option>
          <option value="dispatched">E derguar</option>
          <option value="cancelled">E anuluar</option>
        </select>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <Truck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Asnje rimorkio e regjistruar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((tr) => (
            <TrailerCard
              key={tr.id}
              trailer={tr}
              onEdit={() => setEditing(tr)}
              onDelete={() => handleDelete(tr.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TrailerFormModal
          trailer={editing === 'new' ? null : editing}
          drivers={drivers}
          products={products}
          companyId={companyId!}
          depotId={depotId}
          createdBy={profile!.id}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setToast(msg);
            void fetchAll();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}

function TrailerCard({
  trailer,
  onEdit,
  onDelete,
}: {
  trailer: TrailerLoad;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = statusStyle[trailer.status];
  const totalQty = (trailer.items ?? []).reduce((s, i) => s + i.quantity, 0);
  const driver = trailer.claimed_driver ?? trailer.assigned_driver ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-mono text-sm font-bold tracking-wide">
            {trailer.plate_number}
          </div>
          {trailer.title && (
            <p className="text-base font-semibold text-gray-900 mt-2 truncate">{trailer.title}</p>
          )}
        </div>
        <span className={`text-[11px] uppercase tracking-wide font-bold px-2 py-1 rounded-full border ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <Package className="w-4 h-4 flex-shrink-0" />
          <span>
            {(trailer.items ?? []).length} artikuj · {totalQty.toLocaleString()} cope
          </span>
        </div>
        {driver ? (
          <div className="flex items-center gap-2 text-teal-700">
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium truncate">{driver.full_name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-400">
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="italic">Pa shofer te caktuar</span>
          </div>
        )}
      </div>

      {(trailer.items ?? []).length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
          {(trailer.items ?? []).slice(0, 3).map((i) => (
            <div key={i.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-700 truncate">
                <span className="font-semibold text-gray-900">{i.product_title || '—'}</span>
                {i.product_name && <span className="text-gray-500"> · {i.product_name}</span>}
              </span>
              <span className="font-bold tabular-nums text-gray-900 flex-shrink-0 ml-2">
                {i.quantity.toLocaleString()}
              </span>
            </div>
          ))}
          {(trailer.items ?? []).length > 3 && (
            <p className="text-[11px] text-gray-500">+{(trailer.items ?? []).length - 3} me shume</p>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-teal-700 px-2 py-1 rounded"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edito
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 px-2 py-1 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Fshij
        </button>
      </div>
    </div>
  );
}

interface ItemDraft {
  id?: string;
  product_title: string;
  category_product_id: string | null;
  product_name: string;
  quantity: string;
}

function TrailerFormModal({
  trailer,
  drivers,
  products,
  companyId,
  depotId,
  createdBy,
  onClose,
  onSaved,
}: {
  trailer: TrailerLoad | null;
  drivers: Driver[];
  products: CategoryProduct[];
  companyId: string;
  depotId: string | null;
  createdBy: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [plate, setPlate] = useState(trailer?.plate_number ?? '');
  const [title, setTitle] = useState(trailer?.title ?? '');
  const [notes, setNotes] = useState(trailer?.notes ?? '');
  const [assignedDriverId, setAssignedDriverId] = useState<string>(trailer?.assigned_driver_id ?? '');
  const [items, setItems] = useState<ItemDraft[]>(() => {
    if (trailer?.items && trailer.items.length > 0) {
      return trailer.items.map((i) => ({
        id: i.id,
        product_title: i.product_title,
        category_product_id: i.category_product_id,
        product_name: i.product_name,
        quantity: String(i.quantity),
      }));
    }
    return [{ product_title: '', category_product_id: null, product_name: '', quantity: '' }];
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { product_title: '', category_product_id: null, product_name: '', quantity: '' }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function onProductChange(idx: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    updateItem(idx, {
      category_product_id: productId || null,
      product_name: p?.name ?? '',
    });
  }

  async function handleSave() {
    setFormError(null);
    const plateTrim = plate.trim().toUpperCase();
    if (!plateTrim) {
      setFormError('Numri i tabeles eshte i detyrueshem');
      return;
    }
    const cleanItems = items
      .map((i) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        product_title: i.product_title.trim(),
      }))
      .filter((i) => i.product_title || i.category_product_id || i.quantity > 0);
    if (cleanItems.length === 0) {
      setFormError('Shto te pakten nje artikull');
      return;
    }
    if (cleanItems.some((i) => i.quantity <= 0)) {
      setFormError('Sasia duhet te jete me e madhe se 0');
      return;
    }

    try {
      setSaving(true);
      const prevAssigned = trailer?.assigned_driver_id ?? null;
      const nextAssigned = assignedDriverId || null;

      let loadId = trailer?.id ?? null;
      if (trailer) {
        const { error } = await supabase
          .from('trailer_loads')
          .update({
            plate_number: plateTrim,
            title: title.trim(),
            notes: notes.trim(),
            assigned_driver_id: nextAssigned,
            depot_id: depotId,
          })
          .eq('id', trailer.id);
        if (error) throw error;

        const { error: delErr } = await supabase
          .from('trailer_load_items')
          .delete()
          .eq('trailer_load_id', trailer.id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from('trailer_loads')
          .insert({
            company_id: companyId,
            depot_id: depotId,
            plate_number: plateTrim,
            title: title.trim(),
            notes: notes.trim(),
            assigned_driver_id: nextAssigned,
            created_by: createdBy,
          })
          .select('id')
          .maybeSingle();
        if (error) throw error;
        loadId = data?.id ?? null;
      }

      if (!loadId) throw new Error('Gabim gjate ruajtjes');

      const itemRows = cleanItems.map((i, idx) => ({
        trailer_load_id: loadId!,
        product_title: i.product_title,
        category_product_id: i.category_product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        position: idx,
      }));
      const { error: insErr } = await supabase.from('trailer_load_items').insert(itemRows);
      if (insErr) throw insErr;

      if (nextAssigned && nextAssigned !== prevAssigned) {
        await notifyUsers({
          userIds: [nextAssigned],
          type: 'assignment',
          titleKey: 'notifications.trailer.assignedTitle',
          messageKey: 'notifications.trailer.assignedMessage',
          params: { plate: plateTrim, title: title.trim() },
          referenceId: loadId,
          fallbackTitle: 'Rimorkio e re per ty',
          fallbackMessage: `Rimorkia ${plateTrim}${title ? ` · ${title}` : ''} eshte caktuar per ty`,
        });
      }

      onSaved(trailer ? 'Rimorkia u perditesua' : 'Rimorkia u ruajt');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 flex items-end lg:items-center justify-center p-0 lg:p-4">
      <div className="bg-white w-full lg:max-w-2xl lg:rounded-2xl rounded-t-2xl max-h-[95vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-teal-600" />
              {trailer ? 'Edito Rimorkion' : 'Rimorkio e re'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Targa, titulli dhe artikujt e ngarkeses</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Numri i tabeles</label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="LO-QK 3004"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none font-mono uppercase tracking-wide font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Titulli</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Kautex"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Shofer (opsional)</label>
            <select
              value={assignedDriverId}
              onChange={(e) => setAssignedDriverId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
            >
              <option value="">— Asnje, shoferi e merr vet —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Shenime (opsionale)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none resize-none"
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">Artikujt e ngarkeses</h3>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Shto rresht
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                        Titulli
                      </label>
                      <input
                        value={item.product_title}
                        onChange={(e) => updateItem(idx, { product_title: e.target.value })}
                        placeholder="Black"
                        className="w-full px-2.5 py-2 text-sm rounded-md border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div className="col-span-8 md:col-span-5">
                      <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                        Produkti
                      </label>
                      <select
                        value={item.category_product_id ?? ''}
                        onChange={(e) => onProductChange(idx, e.target.value)}
                        className="w-full px-2.5 py-2 text-sm rounded-md border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                      >
                        <option value="">—</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                        Sasia
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        placeholder="660"
                        className="w-full px-2.5 py-2 text-sm rounded-md border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none tabular-nums"
                      />
                    </div>
                    <div className="col-span-1 flex items-end justify-end">
                      <button
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Anulo
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-lg disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Ruaj
          </button>
        </div>
      </div>
    </div>
  );
}
