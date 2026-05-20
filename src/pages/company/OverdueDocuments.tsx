import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Loader2,
  Filter,
  Calendar,
  User,
  MapPin,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type NoteType = 'delivery' | 'pickup';

interface OverdueNote {
  id: string;
  note_number: string;
  type: NoteType;
  status: string;
  partner_name: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  scheduled_delivery_at: string | null;
  scheduled_pickup_at: string | null;
  scanned_photo_url: string | null;
  assigned_driver_id: string | null;
  notes: string | null;
  created_at: string;
}

const ACTIVE_STATUSES = [
  'draft',
  'sent',
  'in_transit',
  'pending_company_review',
  'pending_stock_confirmation',
  'delivered',
];

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  pending_company_review: 'bg-sky-100 text-sky-700',
  pending_stock_confirmation: 'bg-orange-100 text-orange-700',
  delivered: 'bg-emerald-100 text-emerald-700',
};

function statusLabel(s: string, t: (k: string) => string) {
  switch (s) {
    case 'draft': return t('companyAdmin.overdue.statusDraft');
    case 'sent': return t('companyAdmin.overdue.statusStarted');
    case 'in_transit': return t('companyAdmin.overdue.statusInTransport');
    case 'pending_company_review': return t('companyAdmin.overdue.statusForReview');
    case 'pending_stock_confirmation': return t('companyAdmin.overdue.statusForStockConfirm');
    case 'delivered': return t('companyAdmin.overdue.statusDelivered');
    default: return s;
  }
}

function scheduledOf(n: OverdueNote): Date | null {
  const raw = n.type === 'pickup' ? n.scheduled_pickup_at : n.scheduled_delivery_at;
  return raw ? new Date(raw) : null;
}

function daysOverdue(n: OverdueNote): number {
  const d = scheduledOf(n);
  if (!d) return 0;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function CompanyOverdueDocuments() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<OverdueNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | NoteType>('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<OverdueNote | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile?.company_id) fetchNotes();
  }, [profile?.company_id]);

  async function fetchNotes() {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);
      const nowIso = new Date().toISOString();
      const { data, error: qErr } = await supabase
        .from('delivery_notes')
        .select(
          'id, note_number, type, status, partner_name, delivery_address, pickup_address, scheduled_delivery_at, scheduled_pickup_at, scanned_photo_url, assigned_driver_id, notes, created_at'
        )
        .eq('company_id', profile.company_id)
        .in('status', ACTIVE_STATUSES)
        .or(
          `and(type.eq.delivery,scheduled_delivery_at.lt.${nowIso}),and(type.eq.pickup,scheduled_pickup_at.lt.${nowIso})`
        )
        .order('scheduled_delivery_at', { ascending: true, nullsFirst: false });

      if (qErr) throw qErr;
      setNotes((data ?? []) as OverdueNote[]);
    } catch (e: any) {
      setError(e?.message ?? 'Ngarkimi deshtoi');
    } finally {
      setLoading(false);
    }
  }

  async function approve(note: OverdueNote) {
    if (!profile?.id) return;
    try {
      setActionId(note.id);
      const { error: uErr } = await supabase
        .from('delivery_notes')
        .update({
          status: 'completed',
          confirmed_at: new Date().toISOString(),
          stock_confirmed_at: new Date().toISOString(),
          stock_confirmed_by: profile.id,
        })
        .eq('id', note.id);
      if (uErr) throw uErr;
      setBanner({ kind: 'success', text: `${note.note_number} u miratua dhe u mbyll.` });
      await fetchNotes();
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Veprimi deshtoi' });
    } finally {
      setActionId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelFor || !profile?.id) return;
    try {
      setActionId(cancelFor.id);
      const { error: uErr } = await supabase
        .from('delivery_notes')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: profile.id,
          cancel_reason: cancelReason.trim() || null,
        })
        .eq('id', cancelFor.id);
      if (uErr) throw uErr;
      setBanner({ kind: 'success', text: `${cancelFor.note_number} u anulua.` });
      setCancelFor(null);
      setCancelReason('');
      await fetchNotes();
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Anulimi deshtoi' });
    } finally {
      setActionId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (typeFilter && n.type !== typeFilter) return false;
      if (!q) return true;
      return (
        n.note_number.toLowerCase().includes(q) ||
        (n.partner_name ?? '').toLowerCase().includes(q) ||
        (n.delivery_address ?? '').toLowerCase().includes(q) ||
        (n.pickup_address ?? '').toLowerCase().includes(q)
      );
    });
  }, [notes, search, typeFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            Dokumente te Vonuara
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Fletedergesat dhe fletmarrjet qe kane kaluar daten e caktuar dhe presin miratim ose anulim.
          </p>
        </div>
        <button
          onClick={fetchNotes}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Rifresko
        </button>
      </header>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            banner.kind === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-inherit opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('companyAdmin.overdue.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as '' | NoteType)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Te gjitha</option>
            <option value="delivery">Fletedergesa</option>
            <option value="pickup">Fletmarrje</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
          <p className="mt-3 text-gray-700 font-medium">Asnje dokument i vonuar</p>
          <p className="text-sm text-gray-500">Te gjitha fletedergesat dhe fletmarrjet jane ne afat.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((n) => {
            const od = daysOverdue(n);
            const sched = scheduledOf(n);
            const address = n.type === 'pickup' ? n.pickup_address : n.delivery_address;
            const hasScan = !!n.scanned_photo_url;
            return (
              <li
                key={n.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                        <AlertTriangle className="w-3 h-3" />
                        {od > 0 ? `${od} dite vonese` : 'Skaduar sot'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[n.status] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {statusLabel(n.status, t)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {n.type === 'pickup' ? 'Fletmarrje' : 'Fletedergese'}
                      </span>
                      {hasScan && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
                          I skanuar
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-start gap-2">
                      <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{n.note_number}</p>
                        <p className="text-sm text-gray-600 truncate">
                          {n.partner_name || 'Pa partner'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {sched ? sched.toLocaleString() : '—'}
                      </span>
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate">{address || '—'}</span>
                      </span>
                      {n.assigned_driver_id && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          Shoferi i caktuar
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                    <button
                      onClick={() => approve(n)}
                      disabled={actionId === n.id}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {actionId === n.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Mirato dhe mbyll
                    </button>
                    <button
                      onClick={() => { setCancelFor(n); setCancelReason(''); }}
                      disabled={actionId === n.id}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4" />
                      Anulo
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cancelFor && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('companyAdmin.overdue.cancelTitle')}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{cancelFor.note_number}</p>
              </div>
              <button onClick={() => setCancelFor(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block mt-4 text-sm font-medium text-gray-700">{t('companyAdmin.overdue.cancelReasonLabel')}</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder={t('companyAdmin.overdue.cancelReasonPlaceholder')}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setCancelFor(null)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('common.close')}
              </button>
              <button
                onClick={confirmCancel}
                disabled={actionId === cancelFor.id}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {actionId === cancelFor.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {t('companyAdmin.overdue.confirmCancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
