import { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  X,
  MapPin,
  Package,
  ChevronRight,
  Navigation,
  Hash,
  CalendarClock,
  User,
  PlayCircle,
  FileText,
  ScanLine,
  Sparkles,
  ArrowRight,
  Search,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { matchProduct } from '../../utils/productMatcher';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { DeliveryNote } from '../../types';
import SmartDocScanner, { type SmartScanResult } from '../../components/scanner/SmartDocScanner';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';

export type T = (key: string) => string;

export type NoteRow = DeliveryNote & {
  depot?: { name: string } | null;
};

const statusStyles: Record<string, { cls: string; dot: string; labelKey: string }> = {
  sent: { cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', labelKey: 'driver.home.statusSent' },
  in_transit: { cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', labelKey: 'driver.home.statusInTransit' },
  pending_company_review: { cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', labelKey: 'driver.home.statusReview' },
  pending_stock_confirmation: { cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', labelKey: 'driver.home.statusStock' },
  delivered: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', labelKey: 'driver.home.statusCompleted' },
  completed: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', labelKey: 'driver.home.statusCompleted' },
  confirmed: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', labelKey: 'driver.home.statusCompleted' },
};

function getStatusMeta(status: string, t: T) {
  const s = statusStyles[status] ?? statusStyles.sent;
  return { label: t(s.labelKey), cls: s.cls, dot: s.dot };
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getNoteDate(n: NoteRow): Date {
  const scheduled = n.type === 'pickup' ? (n as any).scheduled_pickup_at : (n as any).scheduled_delivery_at;
  return new Date(scheduled ?? n.created_at);
}

export default function DriverDashboard() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteRow | null>(null);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<'default' | 'today' | '7d' | '30d' | 'all'>('default');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErrors, setConfirmErrors] = useState<Record<string, string>>({});
  const [showMyDocsScanner, setShowMyDocsScanner] = useState(false);

  async function handleQuickConfirm(id: string) {
    setConfirmingId(id);
    setConfirmErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'in_transit' } : n)));
    try {
      const { error: err } = await supabase
        .from('delivery_notes')
        .update({ status: 'in_transit', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (err) throw err;
      setToast(t('driver.taskDetail.dispatchSuccess'));
    } catch (err: any) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'sent' } : n)));
      setConfirmErrors((prev) => ({ ...prev, [id]: err.message || t('driver.home.confirmError') }));
    } finally {
      setConfirmingId(null);
    }
  }

  useEffect(() => {
    if (profile?.id) fetchData();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`driver-dashboard-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_notes', filter: `assigned_driver_id=eq.${profile.id}` },
        () => fetchData(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n: any = payload.new;
          setToast(n?.title ? `${n.title}` : t('driver.home.newNotification'));
          fetchData();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function fetchData() {
    try {
      setLoading((prev) => (notes.length === 0 ? true : prev));
      setError(null);
      const { data, error: err } = await supabase
        .from('delivery_notes')
        .select('*, depot:depots!delivery_notes_assigned_depot_id_fkey(name)')
        .eq('assigned_driver_id', profile!.id)
        .neq('status', 'draft')
        .order('scheduled_delivery_at', { ascending: true, nullsFirst: false })
        .limit(300);
      if (err) throw err;
      setNotes((data as any) ?? []);
    } catch (err: any) {
      setError(err.message || t('driver.home.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const { todayDeliveries, todayPickups, tomorrowDeliveries, tomorrowPickups } = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isActive = (n: NoteRow) => n.status === 'sent' || n.status === 'in_transit';
    const active = notes.filter(isActive);

    return {
      todayDeliveries: active.filter((n) => n.type === 'delivery' && sameDay(getNoteDate(n), today)),
      todayPickups: active.filter((n) => n.type === 'pickup' && sameDay(getNoteDate(n), today)),
      tomorrowDeliveries: active.filter((n) => n.type === 'delivery' && sameDay(getNoteDate(n), tomorrow)),
      tomorrowPickups: active.filter((n) => n.type === 'pickup' && sameDay(getNoteDate(n), tomorrow)),
    };
  }, [notes]);

  const filteredResults = useMemo(() => {
    if (range === 'default' && !search.trim()) return [] as NoteRow[];
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    let after: Date | null = null;
    if (range === 'today') after = startOfToday;
    else if (range === '7d') { after = new Date(startOfToday); after.setDate(after.getDate() - 7); }
    else if (range === '30d') { after = new Date(startOfToday); after.setDate(after.getDate() - 30); }
    const q = search.trim().toLowerCase();

    return notes.filter((n) => {
      if (n.status === 'draft') return false;
      if (after) {
        const d = getNoteDate(n);
        if (d < after) return false;
      }
      if (!q) return true;
      const hay = [
        n.note_number,
        (n as any).partner_name,
        n.pickup_address,
        n.delivery_address,
        (n as any).reference_number,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [notes, search, range]);

  const showResults = range !== 'default' || !!search.trim();

  const totalToday = todayDeliveries.length + todayPickups.length;
  const totalTomorrow = tomorrowDeliveries.length + tomorrowPickups.length;
  const subtitle = t('driver.home.tasksSummary')
    .replace('{today}', String(totalToday))
    .replace('{tomorrow}', String(totalTomorrow));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
          {t('driver.home.greeting')}, {profile?.full_name?.split(' ')[0] ?? t('roles.driver')}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <button
        onClick={() => setShowMyDocsScanner(true)}
        className="w-full bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-2xl p-4 shadow-sm text-left flex items-center gap-3 hover:from-teal-700 hover:to-teal-800 transition-colors"
      >
        <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
          <ScanLine className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Skano dokumentet e mia</p>
          <p className="text-xs text-teal-50 mt-0.5">Patente, Kod 95, G25, ADR — AI ekstrakton te dhenat</p>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-75" />
      </button>

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
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {([
            { k: 'default', label: t('driver.home.rangeDefault') },
            { k: 'today', label: t('driver.home.rangeToday') },
            { k: '7d', label: t('driver.home.range7d') },
            { k: '30d', label: t('driver.home.range30d') },
            { k: 'all', label: t('driver.home.rangeAll') },
          ] as const).map((r) => (
            <button
              key={r.k}
              type="button"
              onClick={() => setRange(r.k)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                range === r.k
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {showResults ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-gray-900">{t('driver.home.results')}</p>
              <p className="text-[11px] text-gray-500">
                {filteredResults.length} {filteredResults.length === 1 ? t('driver.home.task') : t('driver.home.tasks')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setSearch(''); setRange('default'); }}
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              {t('driver.home.clearFilters')}
            </button>
          </div>
          <div className="p-3">
            {filteredResults.length === 0 ? (
              <EmptyBlock icon={Search} text={t('driver.home.noResults')} />
            ) : (
              <div className="space-y-2">
                {filteredResults.map((n) => (
                  <TaskCard
                    key={n.id}
                    note={n}
                    onClick={() => setSelected(n)}
                    kind={n.type === 'pickup' ? 'pickup' : 'delivery'}
                    t={t}
                    onConfirm={handleQuickConfirm}
                    confirming={confirmingId === n.id}
                    confirmError={confirmErrors[n.id] || null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!showResults && <DayGroup
        title={t('driver.home.today')}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' })}
        accent="teal"
        deliveries={todayDeliveries}
        pickups={todayPickups}
        onSelect={setSelected}
        onConfirm={handleQuickConfirm}
        confirmingId={confirmingId}
        confirmErrors={confirmErrors}
        t={t}
      />}

      {!showResults && <DayGroup
        title={t('driver.home.tomorrow')}
        subtitle={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' }); })()}
        accent="blue"
        deliveries={tomorrowDeliveries}
        pickups={tomorrowPickups}
        onSelect={setSelected}
        onConfirm={handleQuickConfirm}
        confirmingId={confirmingId}
        confirmErrors={confirmErrors}
        t={t}
      />}

      <Link
        to="/driver/documents"
        className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{t('driver.home.completedBlock')}</p>
            <p className="text-xs text-gray-500">{t('driver.home.completedBlockDesc')}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
        </div>
      </Link>

      <Link
        to="/driver/overdue"
        className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-900 hover:bg-amber-100 transition-colors"
      >
        <div className="p-2 bg-amber-500 rounded-lg">
          <AlertCircle className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t('driver.home.overdueBlock')}</p>
          <p className="text-xs text-amber-800/80">{t('driver.home.overdueBlockDesc')}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-amber-700" />
      </Link>

      {selected && (
        <TaskDetailSheet
          note={selected}
          t={t}
          onClose={() => setSelected(null)}
          onUpdated={async (msg) => {
            await fetchData();
            if (msg) setToast(msg);
            setSelected(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 max-w-[90vw] animate-in slide-in-from-bottom">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {showMyDocsScanner && profile?.id && (
        <FleetDocScanner
          mode="driver"
          presetTargetId={profile.id}
          onClose={() => setShowMyDocsScanner(false)}
          onSaved={() => { setShowMyDocsScanner(false); setToast('Dokumenti u skanua dhe u dergua tek admin.'); }}
        />
      )}
    </div>
  );
}

function DayGroup({
  title, subtitle, accent, deliveries, pickups, onSelect, onConfirm, confirmingId, confirmErrors, t,
}: {
  title: string;
  subtitle: string;
  accent: 'teal' | 'blue';
  deliveries: NoteRow[];
  pickups: NoteRow[];
  onSelect: (n: NoteRow) => void;
  onConfirm: (id: string) => void;
  confirmingId: string | null;
  confirmErrors: Record<string, string>;
  t: T;
}) {
  const accentCls = accent === 'teal'
    ? 'from-teal-500 to-emerald-600'
    : 'from-blue-500 to-cyan-600';
  const total = deliveries.length + pickups.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`bg-gradient-to-r ${accentCls} px-4 py-3 text-white flex items-center justify-between`}>
        <div>
          <p className="text-sm font-bold uppercase tracking-wide">{title}</p>
          <p className="text-[11px] text-white/85 capitalize">{subtitle}</p>
        </div>
        <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
          {total} {total === 1 ? t('driver.home.task') : t('driver.home.tasks')}
        </span>
      </div>

      <div className="p-3 space-y-3">
        <Section
          title={t('driver.home.deliveries')}
          subtitle={t('driver.home.deliveriesSubtitle')}
          icon={Truck}
          accent="teal"
          count={deliveries.length}
        >
          {deliveries.length === 0 ? (
            <EmptyBlock icon={Truck} text={t('driver.home.noDeliveries')} />
          ) : (
            <div className="space-y-2">
              {deliveries.map((n) => (
                <TaskCard
                  key={n.id}
                  note={n}
                  onClick={() => onSelect(n)}
                  kind="delivery"
                  t={t}
                  onConfirm={onConfirm}
                  confirming={confirmingId === n.id}
                  confirmError={confirmErrors[n.id] || null}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title={t('driver.home.pickups')}
          subtitle={t('driver.home.pickupsSubtitle')}
          icon={Package}
          accent="orange"
          count={pickups.length}
        >
          {pickups.length === 0 ? (
            <EmptyBlock icon={Package} text={t('driver.home.noPickups')} />
          ) : (
            <div className="space-y-2">
              {pickups.map((n) => (
                <TaskCard
                  key={n.id}
                  note={n}
                  onClick={() => onSelect(n)}
                  kind="pickup"
                  t={t}
                  onConfirm={onConfirm}
                  confirming={confirmingId === n.id}
                  confirmError={confirmErrors[n.id] || null}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title, subtitle, icon: Icon, accent, count, children,
}: {
  title: string; subtitle?: string; icon: typeof Truck;
  accent: 'teal' | 'orange' | 'emerald'; count: number; children: React.ReactNode;
}) {
  const accents = { teal: 'bg-teal-500', orange: 'bg-orange-500', emerald: 'bg-emerald-500' };
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2.5 px-1">
        <div className={`${accents[accent]} p-1.5 rounded-lg`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500 leading-tight">{subtitle}</p>}
        </div>
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyBlock({ icon: Icon, text }: { icon: typeof Truck; text: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
      <Icon className="w-7 h-7 text-gray-200 mx-auto mb-2" />
      <p className="text-xs text-gray-400">{text}</p>
    </div>
  );
}

function TaskCard({
  note, onClick, kind, t, onConfirm, confirming, confirmError,
}: {
  note: NoteRow;
  onClick: () => void;
  kind: 'delivery' | 'pickup';
  t: T;
  onConfirm?: (id: string) => void;
  confirming?: boolean;
  confirmError?: string | null;
}) {
  const isPickup = kind === 'pickup';
  const scheduled = isPickup ? (note as any).scheduled_pickup_at : (note as any).scheduled_delivery_at;
  const address = isPickup ? note.pickup_address : note.delivery_address;
  const status = getStatusMeta(note.status, t);
  const isInProcess = note.status === 'in_transit';
  const canConfirm = note.status === 'sent' && !!onConfirm;

  const accentRing = isInProcess
    ? 'border-l-emerald-500'
    : isPickup ? 'border-l-orange-400' : 'border-l-teal-400';
  const cardBg = isInProcess
    ? 'bg-gradient-to-br from-emerald-50 via-teal-50 to-white ring-2 ring-emerald-300/60 shadow-emerald-500/10 shadow-lg'
    : 'bg-white shadow-sm hover:shadow-md';
  const borderWidth = isInProcess ? 'border-l-8' : 'border-l-4';

  return (
    <div
      className={`relative w-full rounded-xl border border-gray-100 ${borderWidth} ${accentRing} ${cardBg} transition-all duration-300`}
    >
      {isInProcess && (
        <div className="absolute -top-2 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[10px] font-bold shadow-md shadow-emerald-600/30 tracking-wider">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          {t('driver.home.inProcess')}
        </div>
      )}

      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-3.5 active:scale-[0.99] transition-transform rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-bold ${isInProcess ? 'text-emerald-900' : 'text-gray-900'}`}>
                {note.note_number}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${status.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${isInProcess ? 'animate-pulse' : ''}`} />
                {status.label}
              </span>
              {isPickup && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                  <Package className="w-2.5 h-2.5" /> {t('driver.home.pickupBadge')}
                </span>
              )}
            </div>
            {(note as any).partner_name && (
              <p className={`text-sm font-medium mt-1.5 flex items-center gap-1.5 ${isInProcess ? 'text-emerald-900' : 'text-gray-800'}`}>
                <User className={`w-3.5 h-3.5 ${isInProcess ? 'text-emerald-600' : 'text-gray-400'}`} />
                {(note as any).partner_name}
              </p>
            )}
            {address && (
              <p className={`text-xs mt-1 flex items-start gap-1.5 ${isInProcess ? 'text-emerald-800/90' : 'text-gray-500'}`}>
                <MapPin className={`w-3 h-3 flex-shrink-0 mt-0.5 ${isInProcess ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="line-clamp-2">{address}</span>
              </p>
            )}
            <div className={`flex items-center gap-3 mt-2 text-[11px] flex-wrap ${isInProcess ? 'text-emerald-800/90' : 'text-gray-500'}`}>
              {isPickup && (note as any).reference_number && (
                <span className="inline-flex items-center gap-1 font-semibold text-orange-700">
                  <Hash className="w-3 h-3" /> {(note as any).reference_number}
                </span>
              )}
              {scheduled && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" />
                  {new Date(scheduled).toLocaleString(undefined, {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
              {note.depot?.name && (
                <span className="inline-flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> {note.depot.name}
                </span>
              )}
            </div>
            {isInProcess && (
              <p className="mt-2 text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1.5">
                <PlayCircle className="w-3.5 h-3.5" />
                {t('driver.home.inProcessHint')}
              </p>
            )}
          </div>
          <ChevronRight className={`w-5 h-5 flex-shrink-0 mt-1 ${isInProcess ? 'text-emerald-400' : 'text-gray-300'}`} />
        </div>
      </button>

      {canConfirm && (
        <div className="px-3.5 pb-3 pt-0 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfirm!(note.id); }}
            disabled={confirming}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('driver.home.confirming')}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('driver.home.quickConfirm')}
              </>
            )}
          </button>
          {confirmError && (
            <p className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {confirmError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskDetailSheet({
  note, onClose, onUpdated, t,
}: {
  note: NoteRow;
  onClose: () => void;
  onUpdated: (successMessage?: string) => void | Promise<void>;
  t: T;
}) {
  const [uploading, setUploading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{
    id: string;
    quantity: number;
    condition: string;
    notes: string | null;
    category?: { name: string } | null;
    category_product?: { name: string } | null;
  }>>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setItemsLoading(true);
      const { data } = await supabase
        .from('delivery_note_items')
        .select('id, quantity, condition, notes, category:product_categories(name), category_product:category_products(name)')
        .eq('delivery_note_id', note.id);
      if (!active) return;
      setItems((data as any) ?? []);
      setItemsLoading(false);
    })();
    return () => { active = false; };
  }, [note.id]);

  const isPickup = note.type === 'pickup';
  const scheduled = isPickup ? (note as any).scheduled_pickup_at : (note as any).scheduled_delivery_at;
  const address = isPickup ? note.pickup_address : note.delivery_address;
  const alreadyDelivered = note.status === 'delivered' || note.status === 'confirmed';
  const isInTransit = note.status === 'in_transit';
  const canDispatch = note.status === 'sent';
  const scannedUrl = (note as any).scanned_photo_url as string | null;
  const status = getStatusMeta(note.status, t);

  async function handleDispatch() {
    setDispatching(true);
    setLocalError(null);
    try {
      const { error: err } = await supabase
        .from('delivery_notes')
        .update({ status: 'in_transit', updated_at: new Date().toISOString() })
        .eq('id', note.id);
      if (err) throw err;
      await onUpdated(t('driver.taskDetail.dispatchSuccess'));
    } catch (err: any) {
      setLocalError(err.message || t('driver.taskDetail.errorGeneric'));
    } finally {
      setDispatching(false);
    }
  }

  async function handleSmartScanResult(result: SmartScanResult) {
    setShowScanner(false);
    setUploading(true);
    setLocalError(null);
    try {
      const { data: scanRow } = await supabase
        .from('acc_scanned_documents')
        .select('storage_path, file_mime')
        .eq('id', result.scanId)
        .maybeSingle();

      let publicUrl = result.fileUrl;
      if (scanRow?.storage_path) {
        const { data: file, error: dlErr } = await supabase.storage
          .from('acc-scans')
          .download(scanRow.storage_path);
        if (!dlErr && file) {
          const ext = (scanRow.file_mime?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          const targetPath = `delivery-notes/${note.id}/scan-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('attachments')
            .upload(targetPath, file, { contentType: scanRow.file_mime || 'image/jpeg', upsert: true });
          if (!upErr) {
            publicUrl = supabase.storage.from('attachments').getPublicUrl(targetPath).data.publicUrl;
          }
        }
      }

      const ex = result.extracted;
      const update: Record<string, any> = {
        scanned_photo_url: publicUrl,
        status: 'pending_company_review',
        ai_extracted_json: ex,
        ai_confidence: ex.confidence ?? null,
        updated_at: new Date().toISOString(),
      };

      const detectedName = ex.supplier_name || ex.customer_name || '';
      if (detectedName && !note.partner_name) {
        update.partner_name = detectedName;
      }

      if (ex.invoice_number && !(note as any).reference_number) {
        update.reference_number = ex.invoice_number;
      }

      const extraNotes: string[] = [];
      if (ex.invoice_date) extraNotes.push(`Data: ${ex.invoice_date}`);
      if (ex.invoice_number) extraNotes.push(`Nr. dok: ${ex.invoice_number}`);
      if (ex.total && ex.total > 0) extraNotes.push(`Totali: ${ex.total.toFixed(2)} ${(ex as any).currency || ''}`.trim());
      if (ex.line_items && ex.line_items.length > 0) {
        const lines = ex.line_items.slice(0, 8).map((li) => {
          const qty = li.quantity ? `${li.quantity}${li.unit ? ' ' + li.unit : ''} x ` : '';
          return `- ${qty}${li.description}`;
        });
        extraNotes.push('Artikujt:\n' + lines.join('\n'));
      }
      if (extraNotes.length > 0) {
        const prefix = note.notes ? `${note.notes}\n\n` : '';
        update.notes = `${prefix}[Skanim AI]\n${extraNotes.join('\n')}`;
      }

      const { error: updateErr } = await supabase
        .from('delivery_notes')
        .update(update)
        .eq('id', note.id);
      if (updateErr) throw updateErr;

      if (ex.line_items && ex.line_items.length > 0) {
        const [{ data: products }, { data: cats }] = await Promise.all([
          supabase.from('acc_products').select('id, name, sku, category_id').eq('company_id', note.company_id),
          supabase.from('product_categories').select('id, name').eq('company_id', note.company_id),
        ]);

        const rows = ex.line_items
          .filter((li) => li.description && (li.quantity ?? 0) > 0)
          .map((li) => {
            const match = matchProduct(li.description, products ?? [], cats ?? []);
            return {
              delivery_note_id: note.id,
              product_id: match.productId,
              category_id: match.categoryId,
              quantity: Math.round(li.quantity || 0),
              condition: 'good',
              notes: `${li.description}${li.unit ? ' (' + li.unit + ')' : ''}`,
            };
          });
        if (rows.length > 0) {
          await supabase.from('delivery_note_items').insert(rows as any);
        }
      }

      if (note.company_id) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('company_id', note.company_id)
          .eq('role', 'company_admin')
          .eq('is_active', true);
        if (admins && admins.length > 0) {
          const rows = admins.map((a) => ({
            user_id: a.id,
            title: 'Dergese per shqyrtim',
            message: `${note.note_number} u skanua nga shoferi dhe pret miratim.`,
            type: 'system',
            reference_id: note.id,
          }));
          await supabase.from('notifications').insert(rows as any);
        }
      }

      await onUpdated(t('driver.taskDetail.scanSuccess'));
    } catch (err: any) {
      setLocalError(err.message || t('driver.taskDetail.errorSaving'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl lg:rounded-2xl w-full lg:max-w-lg max-h-[88vh] lg:max-h-[92vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl lg:rounded-t-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">{note.note_number}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${status.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isPickup ? t('driver.documents.badgePickup') : t('driver.documents.badgeDelivery')}
              {(note as any).partner_name ? ` - ${(note as any).partner_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isPickup && (note as any).reference_number && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide">{t('driver.documents.labelReference')}</p>
              <p className="text-lg font-bold text-orange-900 mt-0.5">{(note as any).reference_number}</p>
              <p className="text-[11px] text-orange-700 mt-1">{t('driver.taskDetail.referenceHint')}</p>
            </div>
          )}

          {address && (
            <InfoRow
              icon={MapPin}
              iconBg={isPickup ? 'bg-orange-100' : 'bg-teal-100'}
              iconColor={isPickup ? 'text-orange-700' : 'text-teal-700'}
              label={isPickup ? t('driver.taskDetail.pickupAddress') : t('driver.taskDetail.deliveryAddress')}
              value={address}
            />
          )}

          {scheduled && (
            <InfoRow
              icon={CalendarClock}
              iconBg="bg-blue-100"
              iconColor="text-blue-700"
              label={t('driver.taskDetail.scheduledTime')}
              value={new Date(scheduled).toLocaleString(undefined, {
                weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            />
          )}

          {note.depot?.name && (
            <InfoRow
              icon={Navigation}
              iconBg="bg-gray-100"
              iconColor="text-gray-700"
              label={t('driver.taskDetail.depot')}
              value={note.depot.name}
            />
          )}

          {note.notes && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{t('driver.documents.labelNotes')}</p>
              <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{note.notes}</p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-500" />
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Artikujt e ngarkeses</p>
              {!itemsLoading && (
                <span className="ml-auto text-[11px] text-gray-500">{items.length}</span>
              )}
            </div>
            {itemsLoading ? (
              <div className="px-3 py-4 flex items-center justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-500 italic">Pa artikuj te regjistruar.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((it) => {
                  const condCls =
                    it.condition === 'good' ? 'bg-emerald-100 text-emerald-700' :
                    it.condition === 'damaged' ? 'bg-red-100 text-red-700' :
                    it.condition === 'needs_repair' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700';
                  return (
                    <li key={it.id} className="px-3 py-2.5 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {it.category_product?.name || it.category?.name || 'Artikull'}
                        </p>
                        {it.category_product?.name && it.category?.name && (
                          <p className="text-[11px] text-gray-500 truncate">{it.category.name}</p>
                        )}
                        {it.notes && <p className="text-[11px] text-gray-500 mt-0.5 whitespace-pre-wrap">{it.notes}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-sm font-bold text-gray-900">x{it.quantity}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${condCls}`}>
                          {it.condition}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {scannedUrl && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('driver.documents.labelScanned')}</p>
              <img src={scannedUrl} alt="Scanned" className="w-full rounded-xl border border-gray-200" />
            </div>
          )}

          {(note as any).dispatched_at && !alreadyDelivered && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <PlayCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">{t('driver.taskDetail.dispatchedLabel')}</p>
                <p className="text-sm font-semibold text-amber-900">
                  {new Date((note as any).dispatched_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {(note as any).delivered_at && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">{t('driver.taskDetail.deliveredLabel')}</p>
                <p className="text-sm font-semibold text-emerald-900">
                  {new Date((note as any).delivered_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {localError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{localError}</p>
            </div>
          )}
        </div>

        {!alreadyDelivered && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
            {canDispatch && (
              <button
                onClick={handleDispatch}
                disabled={dispatching || uploading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 active:scale-95 transition-transform disabled:opacity-60"
              >
                {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                {t('driver.taskDetail.confirmDispatch')}
              </button>
            )}

            {(isInTransit || canDispatch) && (
              <>
                {canDispatch && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">{t('driver.taskDetail.or')}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScanner(true); }}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white font-semibold text-sm shadow-lg shadow-teal-600/25 active:scale-95 transition-transform disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <ScanLine className="w-4 h-4" />
                    </>
                  )}
                  {uploading ? t('driver.taskDetail.saving') : t('driver.taskDetail.scanWithAi')}
                </button>
                <p className="text-[11px] text-gray-500 text-center leading-snug">
                  {t('driver.taskDetail.scanHint')}
                </p>
              </>
            )}

            {scannedUrl && (
              <Link
                to={`/driver/documents?id=${note.id}`}
                className="flex items-center justify-center gap-2 py-2.5 text-xs text-gray-500 hover:text-gray-700"
              >
                <FileText className="w-3.5 h-3.5" />
                {t('driver.taskDetail.openFullDetails')}
              </Link>
            )}
          </div>
        )}

        {alreadyDelivered && (
          <div className="p-4 bg-emerald-50 border-t border-emerald-100 flex items-center justify-center gap-2 text-emerald-700 text-sm font-semibold rounded-b-3xl lg:rounded-b-2xl">
            <CheckCircle2 className="w-4 h-4" />
            {t('driver.taskDetail.taskCompleted')}
          </div>
        )}
      </div>

    </div>
    {showScanner && (
      <SmartDocScanner
        role="driver"
        title={t('driver.taskDetail.scanDocTitle').replace('{number}', note.note_number)}
        subtitle={isPickup ? t('driver.taskDetail.scanPickupSubtitle') : t('driver.taskDetail.scanDeliverySubtitle')}
        onClose={() => setShowScanner(false)}
        onConfirm={handleSmartScanResult}
      />
    )}
    </>
  );
}

function InfoRow({
  icon: Icon, iconBg, iconColor, label, value,
}: {
  icon: typeof MapPin; iconBg: string; iconColor: string; label: string; value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg}`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
