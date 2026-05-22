import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Truck,
  X,
  Hash,
  ChevronRight,
  User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { TaskDetailSheet, type NoteRow } from './Dashboard';

interface OverdueRow {
  id: string;
  note_number: string;
  type: 'delivery' | 'pickup';
  status: string;
  partner_name: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  scheduled_delivery_at: string | null;
  scheduled_pickup_at: string | null;
  reference_number: string | null;
}

const OVERDUE_STATUSES = [
  'sent',
  'in_transit',
  'pending_company_review',
  'pending_stock_confirmation',
  'delivered',
];

const statusBadge: Record<string, { cls: string; label: string }> = {
  sent: { cls: 'bg-blue-100 text-blue-700', label: 'Ne Pritje' },
  in_transit: { cls: 'bg-amber-100 text-amber-700', label: 'E Nisur' },
  pending_company_review: { cls: 'bg-sky-100 text-sky-700', label: 'Ne Shqyrtim' },
  pending_stock_confirmation: { cls: 'bg-orange-100 text-orange-700', label: 'Per Stok' },
  delivered: { cls: 'bg-emerald-100 text-emerald-700', label: 'E Dorezuar' },
  cancelled: { cls: 'bg-red-100 text-red-700', label: 'Anuluar nga Admini' },
};

function scheduledOf(n: OverdueRow): Date | null {
  const raw = n.type === 'pickup' ? n.scheduled_pickup_at : n.scheduled_delivery_at;
  return raw ? new Date(raw) : null;
}

function daysOverdue(n: OverdueRow): number {
  const d = scheduledOf(n);
  if (!d) return 0;
  // Count whole days between the scheduled day and today (both at 00:00
  // local). Same-day deliveries return 0 — they aren't late yet — and
  // are filtered out of the overdue list by the query cutoff.
  const scheduledStart = new Date(d);
  scheduledStart.setHours(0, 0, 0, 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const diffMs = todayStart.getTime() - scheduledStart.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function DriverOverdue() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'delivery' | 'pickup'>('');
  const [selected, setSelected] = useState<NoteRow | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) fetchNotes();
  }, [profile?.id]);

  async function fetchNotes() {
    if (!profile?.id) return;
    try {
      setLoading(true);
      setError(null);
      // Cutoff = start of today (local 00:00). A note scheduled for today
      // is not overdue until the next day starts; only yesterday-or-earlier
      // shows up here.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const cutoffIso = todayStart.toISOString();
      const { data, error: qErr } = await supabase
        .from('delivery_notes')
        .select(
          'id, note_number, type, status, partner_name, delivery_address, pickup_address, scheduled_delivery_at, scheduled_pickup_at, reference_number'
        )
        .eq('assigned_driver_id', profile.id)
        .in('status', OVERDUE_STATUSES)
        .or(
          `and(type.eq.delivery,scheduled_delivery_at.lt.${cutoffIso}),and(type.eq.pickup,scheduled_pickup_at.lt.${cutoffIso})`
        )
        .order('scheduled_delivery_at', { ascending: true, nullsFirst: false });
      if (qErr) throw qErr;
      setNotes((data ?? []) as OverdueRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Ngarkimi deshtoi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(tm);
  }, [toast]);

  async function openNote(n: OverdueRow) {
    if (n.status === 'cancelled') {
      setToast('Kjo porosi eshte anuluar nga admini i kompanise.');
      return;
    }
    try {
      setOpeningId(n.id);
      const { data, error: qErr } = await supabase
        .from('delivery_notes')
        .select('*, depot:depots!delivery_notes_assigned_depot_id_fkey(name)')
        .eq('id', n.id)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) throw new Error('Dokumenti nuk u gjet');
      setSelected(data as unknown as NoteRow);
    } catch (e: any) {
      setError(e?.message ?? 'Hapja deshtoi');
    } finally {
      setOpeningId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (typeFilter && n.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        n.note_number,
        n.partner_name,
        n.delivery_address,
        n.pickup_address,
        n.reference_number,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [notes, search, typeFilter]);

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Link
          to="/driver"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            {t('driver.overdue.title')}
          </h1>
          <p className="text-xs text-gray-500">{t('driver.overdue.subtitle')}</p>
        </div>
        <button
          onClick={fetchNotes}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('driver.home.searchPlaceholder')}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {([
            { k: '', label: t('driver.overdue.all') },
            { k: 'delivery', label: t('driver.overdue.deliveries') },
            { k: 'pickup', label: t('driver.overdue.pickups') },
          ] as const).map((r) => (
            <button
              key={r.k || 'all'}
              type="button"
              onClick={() => setTypeFilter(r.k)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                typeFilter === r.k
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-gray-300" />
          <p className="mt-3 text-gray-700 font-medium">{t('driver.overdue.emptyTitle')}</p>
          <p className="text-sm text-gray-500">{t('driver.overdue.emptyDesc')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => {
            const isPickup = n.type === 'pickup';
            const sched = scheduledOf(n);
            const od = daysOverdue(n);
            const address = isPickup ? n.pickup_address : n.delivery_address;
            const sb = statusBadge[n.status];
            const isCancelled = n.status === 'cancelled';
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openNote(n)}
                  disabled={openingId === n.id}
                  className={`w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${isPickup ? 'border-l-orange-400' : 'border-l-teal-400'} p-3.5 hover:shadow-md active:scale-[0.99] transition-all ${isCancelled ? 'opacity-80' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{n.note_number}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {od > 0 ? t('driver.overdue.daysLate').replace('{n}', String(od)) : t('driver.overdue.dueToday')}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                          {isPickup ? <><Package className="w-2.5 h-2.5" /> {t('driver.overdue.pickup')}</> : <><Truck className="w-2.5 h-2.5" /> {t('driver.overdue.delivery')}</>}
                        </span>
                        {sb && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sb.cls}`}>
                            {sb.label}
                          </span>
                        )}
                      </div>
                      {n.partner_name && (
                        <p className="text-sm font-medium text-gray-800 mt-1.5 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {n.partner_name}
                        </p>
                      )}
                      {address && (
                        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
                          <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{address}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
                        {sched && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {sched.toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {n.reference_number && (
                          <span className="inline-flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {n.reference_number}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <TaskDetailSheet
          note={selected}
          t={t}
          onClose={() => setSelected(null)}
          onUpdated={async (msg) => {
            setSelected(null);
            if (msg) setToast(msg);
            await fetchNotes();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-[90vw]">
          {toast}
        </div>
      )}
    </div>
  );
}
