import { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  X,
  Package,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Save,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { notifyUsers } from '../../utils/notifications';

type TrailerStatus = 'available' | 'claimed' | 'dispatched' | 'cancelled';

interface TrailerItem {
  id: string;
  trailer_load_id: string;
  product_title: string;
  category_product_id: string | null;
  product_name: string;
  quantity: number;
  position: number;
  category_product?: {
    id: string;
    name: string;
    category_id: string | null;
    category?: { id: string; name: string } | null;
  } | null;
}

export interface TrailerLoad {
  id: string;
  company_id: string;
  depot_id: string | null;
  plate_number: string;
  title: string;
  notes: string | null;
  status: TrailerStatus;
  is_loaded: boolean;
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

interface Driver {
  id: string;
  full_name: string;
}

interface Category {
  id: string;
  name: string;
}

interface CategoryProduct {
  id: string;
  name: string;
  category_id: string | null;
}

function isEuroPalete(name: string) {
  return /euro\s*pale(?:te|t[aë])/i.test(name);
}

function sortCategoriesEuroFirst(list: Category[]): Category[] {
  const euro = list.filter((c) => isEuroPalete(c.name));
  const rest = list.filter((c) => !isEuroPalete(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  return [...euro, ...rest];
}

function formatPlate(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, ' ').trim();
}

export function LicensePlate({ plate, size = 'md' }: { plate: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const padding =
    size === 'lg' ? 'py-3' : size === 'xs' ? 'py-1' : size === 'sm' ? 'py-1.5' : 'py-2.5';
  const text =
    size === 'lg'
      ? 'text-3xl lg:text-4xl'
      : size === 'xs'
        ? 'text-xs'
        : size === 'sm'
          ? 'text-base'
          : 'text-2xl';
  const stripeText = size === 'lg' ? 'text-[11px]' : size === 'xs' ? 'text-[7px]' : 'text-[9px]';
  const stripePx = size === 'xs' ? 'px-1' : 'px-1.5';
  const mainPx = size === 'xs' ? 'px-1.5' : 'px-3';

  return (
    <div className="inline-flex items-stretch rounded-md overflow-hidden border-2 border-black bg-white shadow-sm">
      <div
        className={`bg-blue-700 text-white flex flex-col items-center justify-center ${stripePx} ${padding}`}
      >
        <div className="flex gap-[1px]">
          <span className="w-1 h-1 bg-yellow-300 rounded-full" />
        </div>
        <span className={`${stripeText} font-bold leading-none mt-0.5`}>D</span>
      </div>
      <div className={`flex items-center ${mainPx} ${padding} flex-1`}>
        <span
          className={`font-mono font-black tracking-[0.12em] text-black ${text} uppercase leading-none whitespace-nowrap`}
        >
          {plate || 'XX-0000'}
        </span>
      </div>
    </div>
  );
}

interface TrailersManagerProps {
  title?: string;
  subtitle?: string;
  canRegister?: boolean;
}

export default function TrailersManager({
  title = 'Rimorkiot',
  subtitle = 'Regjistro targat nje here, pastaj ngarko shpejt nga klikimi i tabeles',
  canRegister = true,
}: TrailersManagerProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [trailers, setTrailers] = useState<TrailerLoad[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trailer_load_items' },
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
      setError(null);
      const [trailerRes, driverRes, categoryRes, productRes] = await Promise.all([
        supabase
          .from('trailer_loads')
          .select(`
            *,
            assigned_driver:profiles!trailer_loads_assigned_driver_id_fkey(id, full_name),
            claimed_driver:profiles!trailer_loads_claimed_by_driver_id_fkey(id, full_name),
            items:trailer_load_items(
              *,
              category_product:category_products(id, name, category_id, category:product_categories(id, name))
            )
          `)
          .eq('company_id', companyId)
          .order('plate_number', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('company_id', companyId)
          .eq('role', 'driver')
          .eq('is_active', true)
          .order('full_name'),
        supabase
          .from('product_categories')
          .select('id, name')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('category_products')
          .select('id, name, category_id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
      ]);
      if (trailerRes.error) throw trailerRes.error;
      if (driverRes.error) throw driverRes.error;
      if (categoryRes.error) throw categoryRes.error;
      if (productRes.error) throw productRes.error;
      const rows = (trailerRes.data ?? []) as TrailerLoad[];
      for (const r of rows) {
        r.items = (r.items ?? []).slice().sort((a, b) => a.position - b.position);
      }
      setTrailers(rows);
      setDrivers(driverRes.data ?? []);
      setCategories(sortCategoriesEuroFirst((categoryRes.data ?? []) as Category[]));
      setProducts((productRes.data ?? []) as CategoryProduct[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ngarkimit');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trailers;
    return trailers.filter(
      (t) =>
        t.plate_number.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.assigned_driver?.full_name ?? '').toLowerCase().includes(q) ||
        (t.claimed_driver?.full_name ?? '').toLowerCase().includes(q),
    );
  }, [trailers, search]);

  async function handleDelete(id: string) {
    if (!confirm(t('company.trailers.confirmDelete') || 'Fshij kete rimorkio?')) return;
    const { error: err } = await supabase.from('trailer_loads').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    setToast('Rimorkia u fshi');
    setExpandedId(null);
    void fetchAll();
  }

  async function handleResetTrailer(id: string) {
    try {
      const { error: delErr } = await supabase.from('trailer_load_items').delete().eq('trailer_load_id', id);
      if (delErr) throw delErr;
      await supabase.rpc('reassign_trailer_load', { load_id: id, new_driver_id: null });
      await supabase.from('trailer_loads').update({ title: '', notes: '' }).eq('id', id);
      setToast('Rimorkia u rikthye ne te lire');
      void fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    }
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-teal-600" />
            {title}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {canRegister && (
          <button
            onClick={() => setRegisterOpen(true)}
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Regjistro rimorkio
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.kerkoSipasTargeTitulliOseShoferit')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
          />
        </div>
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
          <p className="text-sm text-gray-500 mb-3">{t('common.asnjeRimorkioERegjistruarEnde')}</p>
          {canRegister && (
            <button
              onClick={() => setRegisterOpen(true)}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Regjistro te paren
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((tr) => (
            <TrailerPlateCard
              key={tr.id}
              trailer={tr}
              expanded={expandedId === tr.id}
              onToggle={() => setExpandedId((prev) => (prev === tr.id ? null : tr.id))}
              drivers={drivers}
              categories={categories}
              products={products}
              onSaved={(msg) => {
                setToast(msg);
                setExpandedId(null);
                void fetchAll();
              }}
              onDelete={() => handleDelete(tr.id)}
              onReset={() => handleResetTrailer(tr.id)}
              onError={(msg) => setError(msg)}
            />
          ))}
        </div>
      )}

      {registerOpen && companyId && profile && (
        <RegisterPlateModal
          companyId={companyId}
          depotId={depotId}
          createdBy={profile.id}
          onClose={() => setRegisterOpen(false)}
          onSaved={(msg) => {
            setToast(msg);
            void fetchAll();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-[1100] bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}

function TrailerPlateCard({
  trailer,
  expanded,
  onToggle,
  drivers,
  categories,
  products,
  onSaved,
  onDelete,
  onReset,
  onError,
}: {
  trailer: TrailerLoad;
  expanded: boolean;
  onToggle: () => void;
  drivers: Driver[];
  categories: Category[];
  products: CategoryProduct[];
  onSaved: (msg: string) => void;
  onDelete: () => void;
  onReset: () => void;
  onError: (msg: string) => void;
}) {
  const driver = trailer.claimed_driver ?? trailer.assigned_driver;
  const itemCount = (trailer.items ?? []).length;
  const totalQty = (trailer.items ?? []).reduce((s, i) => s + i.quantity, 0);

  const statusLabel = !trailer.is_loaded
    ? 'E lire'
    : trailer.claimed_by_driver_id
      ? 'E caktuar'
      : 'E ngarkuar';
  const statusCls = !trailer.is_loaded
    ? 'bg-slate-100 text-slate-700 border-slate-200'
    : trailer.claimed_by_driver_id
      ? 'bg-sky-100 text-sky-700 border-sky-200'
      : 'bg-amber-100 text-amber-800 border-amber-200';
  const stripeCls = !trailer.is_loaded
    ? 'bg-slate-300'
    : trailer.claimed_by_driver_id
      ? 'bg-sky-500'
      : 'bg-amber-500';

  return (
    <div
      className={`bg-white rounded-xl border transition-all ${
        expanded ? 'border-teal-400 shadow-lg ring-2 ring-teal-100' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <button onClick={onToggle} className="w-full text-left p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <LicensePlate plate={trailer.plate_number} />
          <ChevronDown
            className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
        {trailer.title && <p className="text-sm font-semibold text-gray-900 truncate">{trailer.title}</p>}

        {itemCount > 0 && (
          <div className="space-y-1">
            {(trailer.items ?? []).slice(0, 3).map((it) => {
              const label = [it.product_name, it.product_title].filter(Boolean).join(' · ');
              return (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-md px-2 py-1.5"
                >
                  <span className="flex items-center gap-1.5 min-w-0 text-gray-800">
                    <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate font-medium">{label || '—'}</span>
                  </span>
                  <span className="font-bold tabular-nums text-gray-900 flex-shrink-0">
                    {it.quantity.toLocaleString()}
                  </span>
                </div>
              );
            })}
            {itemCount > 3 && (
              <p className="text-[11px] text-gray-500 pl-1">
                +{itemCount - 3} me shume · {totalQty.toLocaleString()} cope ne total
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
          <span className={`px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${statusCls}`}>
            {statusLabel}
          </span>
          {driver && (
            <span className="inline-flex items-center gap-1 text-gray-700 font-medium truncate max-w-[55%]">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
              <span className="truncate">{driver.full_name}</span>
            </span>
          )}
        </div>

        <div className={`h-1 rounded-full ${stripeCls}`} />
      </button>

      {expanded && (
        <TrailerLoadEditor
          trailer={trailer}
          drivers={drivers}
          categories={categories}
          products={products}
          onSaved={onSaved}
          onDelete={onDelete}
          onReset={onReset}
          onError={onError}
        />
      )}
    </div>
  );
}

interface ItemDraft {
  id?: string;
  category_id: string;
  category_product_id: string;
  product_title: string;
  quantity: string;
}

function emptyDraft(): ItemDraft {
  return { category_id: '', category_product_id: '', product_title: '', quantity: '' };
}

function TrailerLoadEditor({
  trailer,
  drivers,
  categories,
  products,
  onSaved,
  onDelete,
  onReset,
  onError,
}: {
  trailer: TrailerLoad;
  drivers: Driver[];
  categories: Category[];
  products: CategoryProduct[];
  onSaved: (msg: string) => void;
  onDelete: () => void;
  onReset: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(trailer.title ?? '');
  const [notes, setNotes] = useState(trailer.notes ?? '');
  const [assignedDriverId, setAssignedDriverId] = useState<string>(
    trailer.claimed_by_driver_id ?? trailer.assigned_driver_id ?? '',
  );
  const [items, setItems] = useState<ItemDraft[]>(() => {
    if (trailer.items && trailer.items.length > 0) {
      return trailer.items.map((i) => ({
        id: i.id,
        category_id: i.category_product?.category_id ?? '',
        category_product_id: i.category_product_id ?? '',
        product_title: i.product_title,
        quantity: String(i.quantity),
      }));
    }
    return [emptyDraft()];
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const productsByCategory = useMemo(() => {
    const m = new Map<string, CategoryProduct[]>();
    for (const p of products) {
      if (!p.category_id) continue;
      if (!m.has(p.category_id)) m.set(p.category_id, []);
      m.get(p.category_id)!.push(p);
    }
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [products]);

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function onCategoryChange(idx: number, categoryId: string) {
    updateItem(idx, { category_id: categoryId, category_product_id: '' });
  }

  async function handleSave() {
    setFormError(null);
    const prevAssigned = trailer.claimed_by_driver_id ?? trailer.assigned_driver_id ?? null;
    const nextAssigned = assignedDriverId || null;

    const cleanItems = items
      .map((i) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        product_title: i.product_title.trim(),
      }))
      .filter((i) => i.category_id || i.category_product_id || i.quantity > 0 || i.product_title);

    for (const it of cleanItems) {
      if (!it.category_id) return setFormError(t('company.trailers.pickCategoryPerItem'));
      if (!it.category_product_id) return setFormError(t('company.trailers.pickProductPerItem'));
      if (it.quantity <= 0) return setFormError('Sasia duhet te jete me e madhe se 0');
    }

    try {
      setSaving(true);

      const { error: updErr } = await supabase
        .from('trailer_loads')
        .update({ title: title.trim(), notes: notes.trim() })
        .eq('id', trailer.id);
      if (updErr) throw updErr;

      const { error: delErr } = await supabase
        .from('trailer_load_items')
        .delete()
        .eq('trailer_load_id', trailer.id);
      if (delErr) throw delErr;

      if (cleanItems.length > 0) {
        const itemRows = cleanItems.map((i, idx) => {
          const prod = products.find((p) => p.id === i.category_product_id);
          return {
            trailer_load_id: trailer.id,
            product_title: i.product_title,
            category_product_id: i.category_product_id,
            product_name: prod?.name ?? '',
            quantity: i.quantity,
            position: idx,
          };
        });
        const { error: insErr } = await supabase.from('trailer_load_items').insert(itemRows);
        if (insErr) throw insErr;
      }

      if (prevAssigned !== nextAssigned) {
        const { error: rpcErr } = await supabase.rpc('reassign_trailer_load', {
          load_id: trailer.id,
          new_driver_id: nextAssigned,
        });
        if (rpcErr) throw rpcErr;
        if (nextAssigned) {
          await notifyUsers({
            userIds: [nextAssigned],
            type: 'assignment',
            titleKey: 'notifications.trailer.assignedTitle',
            messageKey: 'notifications.trailer.assignedMessage',
            params: { plate: trailer.plate_number, title: title.trim() },
            referenceId: trailer.id,
            fallbackTitle: 'Rimorkio e re per ty',
            fallbackMessage: `Rimorkia ${trailer.plate_number}${title ? ` · ${title}` : ''} eshte caktuar per ty`,
          });
        }
        if (prevAssigned && prevAssigned !== nextAssigned) {
          await notifyUsers({
            userIds: [prevAssigned],
            type: 'assignment',
            titleKey: 'notifications.trailer.removedTitle',
            messageKey: 'notifications.trailer.removedMessage',
            params: { plate: trailer.plate_number },
            referenceId: trailer.id,
            fallbackTitle: 'Rimorkio e hequr',
            fallbackMessage: `Rimorkia ${trailer.plate_number} nuk eshte me e jotja`,
          });
        }
      }

      onSaved('Ngarkesa u ruajt');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gabim gjate ruajtjes';
      setFormError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-gray-200 p-4 space-y-4 bg-gray-50/50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1 uppercase tracking-wide">
            Titulli
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kautex"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1 uppercase tracking-wide">{t('common.shoferi')}</label>
          <select
            value={assignedDriverId}
            onChange={(e) => setAssignedDriverId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none text-sm"
          >
            <option value="">{t('common.dashNoDriver')}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900">{t('common.lineItems')}</h3>
          <button
            onClick={() => setItems((p) => [...p, emptyDraft()])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Shto artikull
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => {
            const prodList = item.category_id ? productsByCategory.get(item.category_id) ?? [] : [];
            return (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg p-2.5">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-4">
                    <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{t('common.kategoria')}</label>
                    <select
                      value={item.category_id}
                      onChange={(e) => onCategoryChange(idx, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    >
                      <option value="">— Zgjidh —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                      Produkti
                    </label>
                    <select
                      value={item.category_product_id}
                      onChange={(e) => updateItem(idx, { category_product_id: e.target.value })}
                      disabled={!item.category_id}
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">— Zgjidh —</option>
                      {prodList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                      Titulli
                    </label>
                    <input
                      value={item.product_title}
                      onChange={(e) => updateItem(idx, { product_title: e.target.value })}
                      placeholder="Black"
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div className="col-span-5 md:col-span-1">
                    <label className="block text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{t('common.quantity')}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                      placeholder="660"
                      className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none tabular-nums"
                    />
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    <button
                      onClick={() => setItems((p) => (p.length === 1 ? p : p.filter((_, i) => i !== idx)))}
                      disabled={items.length === 1}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-gray-700 mb-1 uppercase tracking-wide">{t('common.notes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none resize-none"
        />
      </div>

      {formError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <div className="flex gap-2">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-lg"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Fshij
          </button>
          {trailer.is_loaded && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 px-3 py-2 rounded-lg"
            >
              Rikthe ne te lire
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Ruaj ndryshimet
        </button>
      </div>
    </div>
  );
}

function RegisterPlateModal({
  companyId,
  depotId,
  createdBy,
  onClose,
  onSaved,
}: {
  companyId: string;
  depotId: string | null;
  createdBy: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [plate, setPlate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(keepOpen: boolean) {
    const plateClean = formatPlate(plate);
    if (!plateClean) {
      setErr(t('company.trailers.enterPlate'));
      return;
    }
    try {
      setSaving(true);
      setErr(null);
      const { error } = await supabase.from('trailer_loads').insert({
        company_id: companyId,
        depot_id: depotId,
        plate_number: plateClean,
        title: '',
        notes: '',
        status: 'available',
        created_by: createdBy,
      });
      if (error) throw error;
      onSaved('Tabela u regjistrua');
      if (keepOpen) {
        setPlate('');
      } else {
        onClose();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-600" />
            Regjistro tabelen
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('common.numriITabeles')}</label>
            <input
              autoFocus
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="LÖ QK 3006"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none font-mono uppercase tracking-wider font-bold text-lg"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">{t('common.pasiRegjistronTabelenKlikonMbiTe')}</p>
          </div>

          {plate && (
            <div className="flex justify-center py-3 bg-gray-50 rounded-lg">
              <LicensePlate plate={formatPlate(plate)} size="lg" />
            </div>
          )}

          {err && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >{t('common.cancel')}</button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold text-sm rounded-lg disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Ruaj dhe shto tjeter
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-lg disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Ruaj dhe mbyll
          </button>
        </div>
      </div>
    </div>
  );
}
