import { useEffect, useState } from 'react';
import {
  Activity,
  Database,
  HardDrive,
  Wifi,
  ShieldCheck,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Status = 'ok' | 'warning' | 'error';

interface CheckResult {
  name: string;
  label: string;
  status: Status;
  latency_ms: number;
  message: string;
  details?: Record<string, unknown>;
  checked_at: string;
}

const CHECK_DEFS: Array<{
  name: string;
  label: string;
  description: string;
  icon: typeof Database;
  run: () => Promise<{ status: Status; latency_ms: number; message: string; details?: Record<string, unknown> }>;
}> = [
  {
    name: 'database_read',
    label: 'Database read',
    description: 'Latency on a lightweight SELECT against profiles',
    icon: Database,
    run: async () => {
      const start = performance.now();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      const latency = Math.round(performance.now() - start);
      if (error) return { status: 'error', latency_ms: latency, message: error.message };
      const status: Status = latency > 1500 ? 'warning' : 'ok';
      return { status, latency_ms: latency, message: status === 'ok' ? 'Database responsive' : 'Database is slow' };
    },
  },
  {
    name: 'auth_session',
    label: 'Auth session',
    description: 'Verifies the active session token can be refreshed',
    icon: ShieldCheck,
    run: async () => {
      const start = performance.now();
      const { data, error } = await supabase.auth.getSession();
      const latency = Math.round(performance.now() - start);
      if (error) return { status: 'error', latency_ms: latency, message: error.message };
      if (!data.session) return { status: 'warning', latency_ms: latency, message: 'No active session' };
      return { status: 'ok', latency_ms: latency, message: 'Session active' };
    },
  },
  {
    name: 'storage_api',
    label: 'Storage API',
    description: 'Lists Supabase storage buckets',
    icon: HardDrive,
    run: async () => {
      const start = performance.now();
      const { data, error } = await supabase.storage.listBuckets();
      const latency = Math.round(performance.now() - start);
      if (error) return { status: 'error', latency_ms: latency, message: error.message };
      return {
        status: 'ok',
        latency_ms: latency,
        message: `${data?.length ?? 0} buckets reachable`,
        details: { buckets: data?.map((b) => b.name) ?? [] },
      };
    },
  },
  {
    name: 'realtime_endpoint',
    label: 'Realtime endpoint',
    description: 'TCP connectivity check to Realtime websocket host',
    icon: Wifi,
    run: async () => {
      const start = performance.now();
      try {
        const url = new URL(import.meta.env.VITE_SUPABASE_URL ?? '');
        const probe = await fetch(`${url.origin}/auth/v1/health`, { method: 'GET' });
        const latency = Math.round(performance.now() - start);
        if (!probe.ok) {
          return { status: 'warning', latency_ms: latency, message: `HTTP ${probe.status}` };
        }
        return { status: 'ok', latency_ms: latency, message: 'Auth/Realtime gateway reachable' };
      } catch (err) {
        const latency = Math.round(performance.now() - start);
        return { status: 'error', latency_ms: latency, message: err instanceof Error ? err.message : 'Network failure' };
      }
    },
  },
];

const STATUS_BADGE: Record<Status, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_DOT: Record<Status, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

function StatusIcon({ status }: { status: Status }) {
  if (status === 'ok') return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
  if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-600" />;
  return <XCircle className="w-5 h-5 text-red-600" />;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SuperAdminSystemHealth() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  useEffect(() => {
    loadCached();
  }, []);

  async function loadCached() {
    const { data } = await supabase
      .from('system_health_checks')
      .select('check_name, status, latency_ms, message, details, checked_at');
    if (!data) return;
    const merged: CheckResult[] = CHECK_DEFS.map((def) => {
      const row = data.find((r) => r.check_name === def.name);
      return {
        name: def.name,
        label: def.label,
        status: (row?.status as Status) ?? 'warning',
        latency_ms: row?.latency_ms ?? 0,
        message: row?.message ?? 'Not checked yet',
        details: (row?.details as Record<string, unknown> | undefined) ?? undefined,
        checked_at: row?.checked_at ?? new Date(0).toISOString(),
      };
    });
    setResults(merged);
    if (data.length > 0) {
      const latest = data
        .map((r) => r.checked_at)
        .sort()
        .pop();
      setLastRun(latest ?? null);
    }
  }

  async function runAll() {
    setRunning(true);
    setError(null);
    const next: CheckResult[] = [];
    for (const def of CHECK_DEFS) {
      try {
        const outcome = await def.run();
        const checkedAt = new Date().toISOString();
        next.push({
          name: def.name,
          label: def.label,
          ...outcome,
          checked_at: checkedAt,
        });
        await supabase.from('system_health_checks').upsert(
          {
            check_name: def.name,
            status: outcome.status,
            latency_ms: outcome.latency_ms,
            message: outcome.message,
            details: outcome.details ?? {},
            checked_at: checkedAt,
          },
          { onConflict: 'check_name' }
        );
      } catch (err) {
        next.push({
          name: def.name,
          label: def.label,
          status: 'error',
          latency_ms: 0,
          message: err instanceof Error ? err.message : 'Unknown error',
          checked_at: new Date().toISOString(),
        });
      }
    }
    setResults(next);
    setLastRun(new Date().toISOString());
    setRunning(false);
  }

  const summary: Record<Status, number> = { ok: 0, warning: 0, error: 0 };
  results.forEach((r) => {
    summary[r.status] = (summary[r.status] ?? 0) + 1;
  });
  const overall: Status =
    summary.error > 0 ? 'error' : summary.warning > 0 ? 'warning' : 'ok';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Live status of platform infrastructure and integrations
            </p>
          </div>
        </div>
        <button
          onClick={runAll}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-semibold disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? 'Running checks...' : 'Run checks'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-5 ${STATUS_BADGE[overall]}`}>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
            <StatusIcon status={overall} />
            Overall
          </div>
          <div className="mt-2 text-2xl font-bold">
            {overall === 'ok' ? 'Operational' : overall === 'warning' ? 'Degraded' : 'Outage'}
          </div>
          {lastRun && (
            <div className="mt-1 text-xs flex items-center gap-1 opacity-80">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(lastRun)}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-sm text-gray-500">Healthy</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">{summary.ok}</div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-sm text-gray-500">Warnings</div>
          <div className="mt-2 text-3xl font-bold text-amber-600">{summary.warning}</div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="text-sm text-gray-500">Errors</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{summary.error}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {CHECK_DEFS.map((def) => {
          const result = results.find((r) => r.name === def.name);
          const Icon = def.icon;
          const status = result?.status ?? 'warning';
          return (
            <div key={def.name} className="p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-gray-50 text-gray-700 flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{def.label}</span>
                  {result && (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-semibold ${STATUS_BADGE[status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
                      {status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
                {result && (
                  <div className="mt-2 text-sm text-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>{result.message}</span>
                    <span className="text-xs text-gray-500">{result.latency_ms} ms</span>
                    <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(result.checked_at)}
                    </span>
                  </div>
                )}
              </div>
              {result && <StatusIcon status={status} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
