import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
  toggle: 'bg-amber-50 text-amber-700 border-amber-200',
  login: 'bg-slate-50 text-slate-700 border-slate-200',
  export: 'bg-teal-50 text-teal-700 border-teal-200',
  settings_change: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SuperAdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from('sa_audit_logs')
        .select('id, actor_id, actor_email, action, entity_type, entity_id, entity_label, details, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryError) throw queryError;
      setRows((data ?? []) as AuditRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  const actions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.action));
    return Array.from(s).sort();
  }, [rows]);

  const entityTypes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.entity_type));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      if (entityFilter !== 'all' && r.entity_type !== entityFilter) return false;
      if (!term) return true;
      return (
        r.actor_email.toLowerCase().includes(term) ||
        r.entity_label.toLowerCase().includes(term) ||
        r.entity_id.toLowerCase().includes(term) ||
        r.action.toLowerCase().includes(term) ||
        r.entity_type.toLowerCase().includes(term)
      );
    });
  }, [rows, search, actionFilter, entityFilter]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Every super admin action recorded for compliance and traceability
            </p>
          </div>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by actor, entity, action..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            <option value="all">All entities</option>
            {entityTypes.map((et) => (
              <option key={et} value={et}>{et}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No audit entries match your filters yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((row) => {
              const isOpen = expanded.has(row.id);
              const hasDetails = row.details && Object.keys(row.details).length > 0;
              const style = ACTION_STYLES[row.action] ?? 'bg-slate-50 text-slate-700 border-slate-200';
              return (
                <div key={row.id} className="px-4 lg:px-6 py-4">
                  <button
                    onClick={() => hasDetails && toggleExpand(row.id)}
                    className={`w-full flex items-start gap-3 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="mt-1 flex-shrink-0 w-5">
                      {hasDetails ? (
                        isOpen ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${style}`}>
                          {row.action}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">{row.entity_type}</span>
                        {row.entity_label && (
                          <span className="text-sm text-gray-600 truncate">— {row.entity_label}</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span>by {row.actor_email || 'unknown'}</span>
                        <span>{formatDate(row.created_at)}</span>
                        {row.entity_id && <span className="font-mono text-[11px]">id: {row.entity_id}</span>}
                      </div>
                    </div>
                  </button>
                  {isOpen && hasDetails && (
                    <pre className="mt-3 ml-8 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(row.details, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">Showing the most recent {filtered.length} of {rows.length} entries.</p>
    </div>
  );
}
