import { useState, useEffect, useCallback } from 'react';
import { Layers, Play, Square, Loader2, Wrench, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface DepotWorker {
  id: string;
  full_name: string | null;
  worker_category: string | null;
}

interface ActiveSession {
  id: string;
  worker_id: string;
  started_at: string;
}

function elapsed(fromIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Manager control to activate/stop SORTING for depot workers. Workers are on
 * repair (reparatur) by default; activating sorting opens a
 * `depot_sorting_sessions` row (repair time pauses), stopping it closes the row
 * (repair time resumes). One active session per worker is enforced in the DB.
 *
 * `batchId` (optional) links each started session to the sorting batch open on
 * the page, so reports can tie sorting time to a specific load.
 */
export default function SortingSessionPanel({ batchId }: { batchId?: string | null }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<DepotWorker[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const companyId = profile?.company_id ?? null;
  const depotId = profile?.depot_id ?? null;

  const load = useCallback(async () => {
    if (!companyId) return;
    const wq = supabase
      .from('profiles')
      .select('id, full_name, worker_category')
      .eq('company_id', companyId)
      .eq('role', 'depot_worker')
      .eq('worker_category', 'reparature')
      .eq('is_active', true)
      .order('full_name');
    if (depotId) wq.eq('depot_id', depotId);

    const sq = supabase
      .from('depot_sorting_sessions')
      .select('id, worker_id, started_at')
      .eq('company_id', companyId)
      .is('ended_at', null);
    if (depotId) sq.eq('depot_id', depotId);

    const [wRes, sRes] = await Promise.all([wq, sq]);
    if (!wRes.error) setWorkers((wRes.data ?? []) as DepotWorker[]);
    if (!sRes.error) setSessions((sRes.data ?? []) as ActiveSession[]);
  }, [companyId, depotId]);

  useEffect(() => { void load(); }, [load]);

  // Live-tick the elapsed timers while at least one session is active.
  useEffect(() => {
    if (sessions.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [sessions.length]);

  const activeByWorker = new Map(sessions.map((s) => [s.worker_id, s]));

  async function start(workerId: string) {
    if (!companyId || !depotId) return;
    setBusy(workerId);
    try {
      await supabase.from('depot_sorting_sessions').insert({
        company_id: companyId,
        depot_id: depotId,
        worker_id: workerId,
        batch_id: batchId ?? null,
        started_by: profile!.id,
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function stop(workerId: string) {
    const s = activeByWorker.get(workerId);
    if (!s) return;
    setBusy(workerId);
    try {
      await supabase
        .from('depot_sorting_sessions')
        .update({ ended_at: new Date().toISOString(), ended_by: profile!.id })
        .eq('id', s.id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function stopAll() {
    if (sessions.length === 0) return;
    setBusy('__all__');
    try {
      await supabase
        .from('depot_sorting_sessions')
        .update({ ended_at: new Date().toISOString(), ended_by: profile!.id })
        .in('id', sessions.map((s) => s.id));
      await load();
    } finally {
      setBusy(null);
    }
  }

  const activeCount = sessions.length;

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">
              {t('depot.timeTracking.panelTitle')}
              {activeCount > 0 && (
                <span className="ml-2 text-[11px] font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">
                  {activeCount} {t('depot.timeTracking.active')}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{t('depot.timeTracking.panelSubtitle')}</p>
          </div>
        </div>
        {activeCount > 0 && (
          <button
            onClick={stopAll}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Square className="w-3 h-3" />
            {t('depot.timeTracking.stopAll')}
          </button>
        )}
      </div>

      {!depotId ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {t('depot.timeTracking.needDepot')}
        </p>
      ) : workers.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">{t('depot.timeTracking.noWorkers')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {workers.map((w) => {
            const s = activeByWorker.get(w.id);
            const isSorting = !!s;
            const isBusy = busy === w.id;
            return (
              <div
                key={w.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
                  isSorting ? 'border-indigo-300 bg-indigo-50/60' : 'border-gray-200 bg-white'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isSorting ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isSorting ? <Layers className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{w.full_name || '-'}</p>
                  <p className={`text-[11px] ${isSorting ? 'text-indigo-700' : 'text-slate-500'}`}>
                    {isSorting ? (
                      <>
                        {t('depot.timeTracking.sorting')} · {elapsed(s!.started_at, now)}
                      </>
                    ) : (
                      t('depot.timeTracking.onRepair')
                    )}
                  </p>
                </div>
                {isSorting ? (
                  <button
                    onClick={() => stop(w.id)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                    {t('depot.timeTracking.stop')}
                  </button>
                ) : (
                  <button
                    onClick={() => start(w.id)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {t('depot.timeTracking.activate')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
