import { useEffect, useMemo, useState } from 'react';
import { Truck, Package, Loader2, CheckCircle2, AlertTriangle, Hand, LogOut, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notifyUsers } from '../../utils/notifications';
import { useTranslation } from '../../i18n';

type TrailerStatus = 'available' | 'claimed' | 'dispatched' | 'cancelled';

interface TrailerItem {
  id: string;
  trailer_load_id: string;
  product_title: string;
  product_name: string;
  quantity: number;
  position: number;
  category_product?: {
    id: string;
    name: string;
    category?: { id: string; name: string } | null;
  } | null;
}

interface Trailer {
  id: string;
  plate_number: string;
  title: string;
  notes: string | null;
  status: TrailerStatus;
  assigned_driver_id: string | null;
  claimed_by_driver_id: string | null;
  created_by: string | null;
  company_id: string;
  items?: TrailerItem[];
}

export default function DriverTrailersWidget() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const companyId = profile?.company_id ?? null;
  const driverId = profile?.id ?? null;

  useEffect(() => {
    if (!companyId) return;
    void load();
    const channel = supabase
      .channel(`driver_trailers_${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trailer_loads', filter: `company_id=eq.${companyId}` },
        () => {
          void load();
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

  async function load() {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('trailer_loads')
        .select('*, items:trailer_load_items(*, category_product:category_products(id, name, category:product_categories(id, name)))')
        .eq('company_id', companyId)
        .in('status', ['available', 'claimed'])
        .order('created_at', { ascending: false });
      if (err) throw err;
      const rows = (data ?? []) as Trailer[];
      for (const r of rows) {
        r.items = (r.items ?? []).slice().sort((a, b) => a.position - b.position);
      }
      setTrailers(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gabim');
    } finally {
      setLoading(false);
    }
  }

  const mine = useMemo(
    () =>
      trailers.filter(
        (t) => t.claimed_by_driver_id === driverId || (t.status === 'available' && t.assigned_driver_id === driverId),
      ),
    [trailers, driverId],
  );

  const available = useMemo(
    () =>
      trailers.filter(
        (t) =>
          t.claimed_by_driver_id !== driverId &&
          t.assigned_driver_id !== driverId &&
          (t.status === 'available' || t.status === 'claimed'),
      ),
    [trailers, driverId],
  );

  async function claim(trailer: Trailer) {
    if (!driverId) return;
    const prevDriver = trailer.claimed_by_driver_id ?? trailer.assigned_driver_id ?? null;
    try {
      setClaimingId(trailer.id);
      const { error: err } = await supabase.rpc('reassign_trailer_load', {
        load_id: trailer.id,
        new_driver_id: driverId,
      });
      if (err) throw err;
      setToast('Ke marre rimorkion');
      if (trailer.created_by && trailer.created_by !== driverId) {
        await notifyUsers({
          userIds: [trailer.created_by],
          type: 'assignment',
          titleKey: 'notifications.trailer.claimedTitle',
          messageKey: 'notifications.trailer.claimedMessage',
          params: { plate: trailer.plate_number, driver: profile?.full_name ?? '' },
          referenceId: trailer.id,
          fallbackTitle: 'Rimorkio e marrur',
          fallbackMessage: `Shoferi ${profile?.full_name ?? ''} mori rimorkion ${trailer.plate_number}`,
        });
      }
      if (prevDriver && prevDriver !== driverId) {
        await notifyUsers({
          userIds: [prevDriver],
          type: 'assignment',
          titleKey: 'notifications.trailer.removedTitle',
          messageKey: 'notifications.trailer.removedMessage',
          params: { plate: trailer.plate_number },
          referenceId: trailer.id,
          fallbackTitle: 'Rimorkio e hequr',
          fallbackMessage: `Rimorkia ${trailer.plate_number} nuk eshte me e jotja`,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.couldNotGetTrailer'));
    } finally {
      setClaimingId(null);
    }
  }

  async function release(trailer: Trailer) {
    try {
      setClaimingId(trailer.id);
      const { error: err } = await supabase.rpc('reassign_trailer_load', {
        load_id: trailer.id,
        new_driver_id: null,
      });
      if (err) throw err;
      setToast('E lirove rimorkion');
      if (trailer.created_by && trailer.created_by !== driverId) {
        await notifyUsers({
          userIds: [trailer.created_by],
          type: 'assignment',
          titleKey: 'notifications.trailer.releasedTitle',
          messageKey: 'notifications.trailer.releasedMessage',
          params: { plate: trailer.plate_number, driver: profile?.full_name ?? '' },
          referenceId: trailer.id,
          fallbackTitle: 'Rimorkio e liruar',
          fallbackMessage: `Shoferi ${profile?.full_name ?? ''} liroi rimorkion ${trailer.plate_number}`,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gabim gjate lirimit');
    } finally {
      setClaimingId(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('common.poNgarkohenRimorkiot')}</span>
      </div>
    );
  }

  if (mine.length === 0 && available.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-white rounded-2xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 transition-colors p-4 flex items-center gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
          <Truck className="w-5 h-5 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-900">Rimorkiot</span>
            {mine.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-teal-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {mine.length} e tua
              </span>
            )}
            {available.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {available.length} te lira
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {open ? 'Kliko per te mbyllur' : 'Kliko per te pare detajet'}
          </p>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && mine.length > 0 && (
        <Section title="Rimorkiot e tua" accent="teal">
          <div className="space-y-2">
            {mine.map((t) => (
              <TrailerRow
                key={t.id}
                trailer={t}
                action={
                  <button
                    onClick={() => release(t)}
                    disabled={claimingId === t.id}
                    className="inline-flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60 transition-colors"
                  >
                    {claimingId === t.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    Liroje
                  </button>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {open && available.length > 0 && (
        <Section title="Rimorkiot e disponueshme" accent="slate">
          <div className="space-y-2">
            {available.map((t) => {
              const claimedByOther = t.claimed_by_driver_id && t.claimed_by_driver_id !== driverId;
              return (
                <TrailerRow
                  key={t.id}
                  trailer={t}
                  holderNote={claimedByOther ? 'Aktualisht tek nje shofer tjeter' : undefined}
                  action={
                    <button
                      onClick={() => claim(t)}
                      disabled={claimingId === t.id}
                      className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60 transition-colors"
                    >
                      {claimingId === t.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Hand className="w-3.5 h-3.5" />
                      )}
                      {claimedByOther ? 'Merre' : 'Merre'}
                    </button>
                  }
                />
              );
            })}
          </div>
        </Section>
      )}

      {toast && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: 'teal' | 'slate'; children: React.ReactNode }) {
  const cls = accent === 'teal' ? 'border-teal-200 bg-teal-50/40' : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-2xl border ${cls} p-3.5`}>
      <div className="flex items-center gap-2 mb-2">
        <Truck className={`w-4 h-4 ${accent === 'teal' ? 'text-teal-600' : 'text-gray-600'}`} />
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function TrailerRow({
  trailer,
  action,
  holderNote,
}: {
  trailer: Trailer;
  action?: React.ReactNode;
  holderNote?: string;
}) {
  const totalQty = (trailer.items ?? []).reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 text-white font-mono text-xs font-bold tracking-wide">
            {trailer.plate_number}
          </div>
          {trailer.title && (
            <p className="text-sm font-semibold text-gray-900 mt-1.5 truncate">{trailer.title}</p>
          )}
          {holderNote && <p className="text-[11px] text-amber-700 mt-0.5">{holderNote}</p>}
        </div>
        {action}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-600 mb-1.5">
        <Package className="w-3.5 h-3.5" />
        <span>
          {(trailer.items ?? []).length} artikuj · {totalQty.toLocaleString()} cope
        </span>
      </div>

      {(trailer.items ?? []).length > 0 && (
        <div className="pt-2 border-t border-gray-100 space-y-0.5">
          {(trailer.items ?? []).map((i) => {
            const cat = i.category_product?.category?.name;
            return (
              <div key={i.id} className="flex items-center justify-between text-xs">
                <span className="truncate min-w-0">
                  {cat && <span className="text-gray-500">{cat} · </span>}
                  <span className="text-gray-900">{i.product_name || '—'}</span>
                  {i.product_title && (
                    <span className="font-semibold text-gray-900"> · {i.product_title}</span>
                  )}
                </span>
                <span className="font-bold tabular-nums text-gray-900 flex-shrink-0 ml-2">
                  {i.quantity.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
