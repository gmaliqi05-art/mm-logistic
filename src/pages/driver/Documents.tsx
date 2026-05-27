import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox,
  Send,
  Search,
  X,
  AlertTriangle,
  FileText,
  User,
  Clock,
  Download,
  CheckCircle2,
  Truck,
  Package,
  MapPin,
  History,
  CalendarDays,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';

type Tab = 'completed' | 'received' | 'sent';

type CompletedNote = {
  id: string;
  note_number: string;
  type: 'delivery' | 'pickup';
  status: string;
  partner_name: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  reference_number: string | null;
  delivered_at: string | null;
  scheduled_delivery_at: string | null;
  scheduled_pickup_at: string | null;
  scanned_photo_url: string | null;
  notes: string | null;
};

export default function DriverDocuments() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'completed';
  const [tab, setTabState] = useState<Tab>(
    initialTab === 'received' || initialTab === 'sent' || initialTab === 'completed' ? initialTab : 'completed'
  );
  const setTab = (next: Tab) => {
    setTabState(next);
    const p = new URLSearchParams(searchParams);
    p.set('tab', next);
    setSearchParams(p, { replace: true });
  };

  const [completedNotes, setCompletedNotes] = useState<CompletedNote[]>([]);
  const [selectedCompleted, setSelectedCompleted] = useState<CompletedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    if (profile?.id) fetchAll();
  }, [profile?.id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('delivery_notes')
        .select('id, note_number, type, status, partner_name, delivery_address, pickup_address, reference_number, delivered_at, scheduled_delivery_at, scheduled_pickup_at, scanned_photo_url, notes')
        .eq('assigned_driver_id', profile!.id)
        .in('status', ['completed', 'confirmed', 'delivered'])
        .order('delivered_at', { ascending: false, nullsFirst: false })
        .limit(300);
      if (err) throw err;
      setCompletedNotes((data as CompletedNote[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function noteDate(n: CompletedNote): Date | null {
    const d = n.delivered_at || (n.type === 'pickup' ? n.scheduled_pickup_at : n.scheduled_delivery_at);
    return d ? new Date(d) : null;
  }

  function sameLocalDay(iso: string | null, ymd: string): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}` === ymd;
  }

  const filtered = completedNotes.filter((n) => {
    if (tab === 'received' && n.type !== 'pickup') return false;
    if (tab === 'sent' && n.type !== 'delivery') return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        n.note_number.toLowerCase().includes(q) ||
        (n.partner_name || '').toLowerCase().includes(q) ||
        (n.reference_number || '').toLowerCase().includes(q) ||
        (n.delivery_address || '').toLowerCase().includes(q) ||
        (n.pickup_address || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (dateFilter) {
      const candidates = [n.delivered_at, n.scheduled_delivery_at, n.scheduled_pickup_at];
      if (!candidates.some((c) => sameLocalDay(c, dateFilter))) return false;
    }
    return true;
  });

  const historyCount = completedNotes.length;
  const receivedCount = completedNotes.filter((n) => n.type === 'pickup').length;
  const sentCount = completedNotes.filter((n) => n.type === 'delivery').length;

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('driver.documents.title')}</h1>
        <p className="text-gray-500 mt-1">{t('driver.documents.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-4 border-b border-gray-200 overflow-x-auto">
        <TabButton
          active={tab === 'completed'}
          onClick={() => setTab('completed')}
          icon={History}
          label={t('driver.documents.historyTab')}
          count={historyCount}
          activeColor="emerald"
        />
        <TabButton
          active={tab === 'received'}
          onClick={() => setTab('received')}
          icon={Inbox}
          label={t('driver.documents.receivedTab')}
          count={receivedCount}
          activeColor="teal"
        />
        <TabButton
          active={tab === 'sent'}
          onClick={() => setTab('sent')}
          icon={Send}
          label={t('driver.documents.sentTab')}
          count={sentCount}
          activeColor="teal"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('driver.documents.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white"
          />
        </div>
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full sm:w-52 pl-10 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              aria-label="clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {(search || dateFilter) && (
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
          <span>{filtered.length} {filtered.length === 1 ? t('driver.home.task') : t('driver.home.tasks')}</span>
          {dateFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full">
              <CalendarDays className="w-3 h-3" />
              {new Date(dateFilter).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <PageSkeleton rows={6} cols={4} showStats={false} />
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} t={t} noteDateFn={noteDate} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((n) => (
            <CompletedNoteCard key={n.id} note={n} onClick={() => setSelectedCompleted(n)} t={t} />
          ))}
        </div>
      )}

      {selectedCompleted && (
        <CompletedNoteDetail note={selectedCompleted} onClose={() => setSelectedCompleted(null)} t={t} />
      )}
    </div>
  );
}

function TabButton({
  active, onClick, icon: Icon, label, count, activeColor,
}: {
  active: boolean; onClick: () => void; icon: typeof History; label: string; count: number; activeColor: 'teal' | 'emerald';
}) {
  const activeCls = activeColor === 'emerald'
    ? 'border-emerald-600 text-emerald-600'
    : 'border-teal-600 text-teal-600';
  const badgeCls = activeColor === 'emerald'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-teal-100 text-teal-700';
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? activeCls : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${active ? badgeCls : 'bg-gray-100 text-gray-600'}`}>
        {count}
      </span>
    </button>
  );
}

function EmptyState({ tab, t }: { tab: Tab; t: (k: string) => string; noteDateFn: (n: CompletedNote) => Date | null }) {
  const Icon = tab === 'received' ? Inbox : tab === 'sent' ? Send : CheckCircle2;
  const text = tab === 'received'
    ? t('driver.home.noPickups')
    : tab === 'sent'
      ? t('driver.home.noDeliveries')
      : t('driver.documents.noCompleted');
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center">
      <Icon className="w-12 h-12 text-gray-300 mb-3" />
      <p className="text-gray-400 text-lg">{text}</p>
    </div>
  );
}

function CompletedNoteCard({ note, onClick, t }: { note: CompletedNote; onClick: () => void; t: (k: string) => string }) {
  const isPickup = note.type === 'pickup';
  const address = isPickup ? note.pickup_address : note.delivery_address;
  const Icon = isPickup ? Package : Truck;
  const accent = isPickup ? 'border-l-orange-400' : 'border-l-teal-400';
  const badgeCls = isPickup ? 'bg-orange-50 text-orange-700' : 'bg-teal-50 text-teal-700';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${accent} p-4 active:scale-[0.99] hover:shadow-md transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg flex-shrink-0 ${badgeCls}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-900">{note.note_number}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeCls}`}>
              {isPickup ? t('driver.documents.badgePickup') : t('driver.documents.badgeDelivery')}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-2.5 h-2.5" /> {t('driver.documents.badgeCompleted')}
            </span>
          </div>
          {note.partner_name && (
            <p className="text-sm font-medium text-gray-800 mt-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              {note.partner_name}
            </p>
          )}
          {address && (
            <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{address}</span>
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
            {note.delivered_at && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <Clock className="w-3 h-3" />
                {new Date(note.delivered_at).toLocaleString(undefined, {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
            {note.reference_number && (
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3 h-3" /> {note.reference_number}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function CompletedNoteDetail({ note, onClose, t }: { note: CompletedNote; onClose: () => void; t: (k: string) => string }) {
  const isPickup = note.type === 'pickup';
  const address = isPickup ? note.pickup_address : note.delivery_address;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl lg:rounded-2xl w-full lg:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">{note.note_number}</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-2.5 h-2.5" /> {t('driver.documents.badgeCompleted')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isPickup ? t('driver.documents.badgePickup') : t('driver.documents.badgeDelivery')}
              {note.partner_name ? ` - ${note.partner_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {note.delivered_at && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                  {isPickup ? t('driver.documents.labelPickedUp') : t('driver.documents.labelDelivered')}
                </p>
                <p className="text-sm font-semibold text-emerald-900">
                  {new Date(note.delivered_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {note.partner_name && (
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-50 flex-shrink-0">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{t('driver.documents.labelPartner')}</p>
                <p className="text-sm text-gray-900 font-medium break-words">{note.partner_name}</p>
              </div>
            </div>
          )}

          {address && (
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-teal-50 flex-shrink-0">
                <MapPin className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {isPickup ? t('driver.taskDetail.pickupAddress') : t('driver.taskDetail.deliveryAddress')}
                </p>
                <p className="text-sm text-gray-900 break-words">{address}</p>
              </div>
            </div>
          )}

          {note.reference_number && (
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-orange-50 flex-shrink-0">
                <FileText className="w-4 h-4 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{t('driver.documents.labelReference')}</p>
                <p className="text-sm text-gray-900 font-mono">{note.reference_number}</p>
              </div>
            </div>
          )}

          {note.notes && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('driver.documents.labelNotes')}</p>
              <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans border border-gray-100">
                {note.notes}
              </pre>
            </div>
          )}

          {note.scanned_photo_url && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{t('driver.documents.labelScanned')}</p>
                <a
                  href={note.scanned_photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> {t('driver.documents.labelOpen')}
                </a>
              </div>
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                <img
                  src={note.scanned_photo_url}
                  alt="Scan"
                  className="w-full max-h-96 object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
