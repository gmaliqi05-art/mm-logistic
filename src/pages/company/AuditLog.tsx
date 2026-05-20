import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Search,
  User,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Truck,
  Warehouse,
  FileText,
  Package,
  Building2,
  AlertCircle,
  Wrench,
  Layers,
  ReceiptText,
  ShieldAlert,
  Calendar,
  Loader2,
  Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FeatureGate from '../../components/subscription/FeatureGate';
import type { AuditLog } from '../../types';

const PAGE_SIZE = 100;

const actionIcons: Record<string, typeof Plus> = {
  create: Plus,
  update: Edit2,
  delete: Trash2,
};

const entityIcons: Record<string, typeof User> = {
  driver: Truck,
  depot: Warehouse,
  delivery_note: FileText,
  stock: Package,
  stock_movements: Package,
  stock_alerts: AlertCircle,
  vehicles: Truck,
  vehicle_inspections: ShieldAlert,
  vehicle_insurance: ShieldAlert,
  vehicle_taxes: ReceiptText,
  driver_licenses: ShieldAlert,
  driver_qualifications: ShieldAlert,
  driver_medical: ShieldAlert,
  acc_contacts: Building2,
  acc_invoices: ReceiptText,
  pallet_sorting_batches: Layers,
  depot_repairs: Wrench,
};

/**
 * Audit log rows come from two writers:
 *   - Manual logAudit() calls in pages/company/{Depots,Drivers,DeliveryNotes}.tsx
 *     where `details` is hand-shaped like { name, email, note_number, ... }
 *   - The generic audit_row_changes() DB trigger (migration 20260520140000)
 *     where `details` is { after } / { before } / { changed } JSONB.
 *
 * This helper picks a single human label from whichever shape we got.
 */
function extractSummary(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const d = details as Record<string, unknown>;

  // Manual-call shape — direct keys
  const manual = (d.name || d.email || d.note_number || d.license_plate || d.full_name) as string | undefined;
  if (typeof manual === 'string' && manual) return manual;

  // Trigger shape — pick best human-readable field from the snapshot
  const snapshot = (d.after ?? d.before ?? d.changed) as Record<string, unknown> | undefined;
  if (snapshot && typeof snapshot === 'object') {
    const label = (snapshot.name
      || snapshot.full_name
      || snapshot.note_number
      || snapshot.invoice_number
      || snapshot.license_plate
      || snapshot.title) as string | undefined;
    if (typeof label === 'string' && label) return label;
  }
  return '';
}

function AuditLogContent() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const actionLabels: Record<string, { label: string; className: string }> = {
    create: { label: t('company.auditLog.actions.create'), className: 'bg-green-100 text-green-700' },
    update: { label: t('company.auditLog.actions.update'), className: 'bg-blue-100 text-blue-700' },
    delete: { label: t('company.auditLog.actions.delete'), className: 'bg-red-100 text-red-700' },
  };

  const entityLabels: Record<string, string> = {
    driver: t('company.auditLog.entities.driver'),
    depot: t('company.auditLog.entities.depot'),
    delivery_note: t('company.auditLog.entities.delivery_note'),
    delivery_notes: t('company.auditLog.entities.delivery_note'),
    stock: t('company.auditLog.entities.stock'),
    stock_movement: t('company.auditLog.entities.stock_movement'),
    stock_movements: t('company.auditLog.entities.stock_movement'),
    stock_alerts: 'Stock alert',
    document: t('company.auditLog.entities.document'),
    category: t('company.auditLog.entities.category'),
    vehicles: 'Vehicle',
    vehicle_inspections: 'Vehicle inspection',
    vehicle_insurance: 'Vehicle insurance',
    vehicle_taxes: 'Vehicle tax',
    driver_licenses: 'Driver license',
    driver_qualifications: 'Driver qualification',
    driver_medical: 'Driver medical',
    acc_contacts: 'Partner',
    acc_invoices: 'Invoice',
    pallet_sorting_batches: 'Sorting batch',
    depot_repairs: 'Repair',
  };

  useEffect(() => {
    if (profile?.company_id) fetchLogs(true);
    // Re-fetch from page 0 whenever a server-side filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, filterAction, filterEntity, filterFrom, filterTo]);

  async function fetchLogs(reset: boolean) {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const offset = reset ? 0 : logs.length;

      let query = supabase
        .from('audit_logs')
        .select('*, user:profiles!audit_logs_user_id_fkey(id, full_name, email, avatar_url, role)')
        .eq('company_id', profile!.company_id!)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filterAction) query = query.eq('action', filterAction);
      if (filterEntity) query = query.eq('entity_type', filterEntity);
      if (filterFrom) query = query.gte('created_at', `${filterFrom}T00:00:00`);
      if (filterTo) query = query.lte('created_at', `${filterTo}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      setHasMore(rows.length === PAGE_SIZE);
      setLogs(reset ? rows : [...logs, ...rows]);
    } catch {
      if (reset) setLogs([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Local-only search (small enough that scanning the in-memory page is fine)
  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((log) => {
      const userName = (log.user as { full_name?: string } | undefined)?.full_name?.toLowerCase() ?? '';
      const details = JSON.stringify(log.details ?? {}).toLowerCase();
      return userName.includes(q) || details.includes(q) || log.entity_type.toLowerCase().includes(q);
    });
  }, [logs, search]);

  const uniqueEntities = useMemo(() => [...new Set(logs.map((l) => l.entity_type))].sort(), [logs]);

  function exportCsv() {
    const header = ['created_at', 'user', 'action', 'entity_type', 'entity_id', 'summary'];
    const lines = [header.join(',')];
    for (const log of filtered) {
      const userName = (log.user as { full_name?: string } | undefined)?.full_name ?? '';
      const summary = extractSummary(log.details).replace(/"/g, '""');
      lines.push([
        log.created_at,
        `"${userName.replace(/"/g, '""')}"`,
        log.action,
        log.entity_type,
        log.entity_id ?? '',
        `"${summary}"`,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.auditLog.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.auditLog.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          CSV
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('company.auditLog.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
        >
          <option value="">{t('common.allActions')}</option>
          <option value="create">{t('company.auditLog.actions.create')}</option>
          <option value="update">{t('company.auditLog.actions.update')}</option>
          <option value="delete">{t('company.auditLog.actions.delete')}</option>
        </select>
        <select
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
        >
          <option value="">{t('common.allEntities')}</option>
          {uniqueEntities.map((e) => (
            <option key={e} value={e}>{entityLabels[e] ?? e}</option>
          ))}
        </select>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            aria-label="from"
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            aria-label="to"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-400 text-lg">{t('company.auditLog.noLogs')}</p>
            <p className="text-gray-300 text-sm mt-1">{t('company.auditLog.noLogsHint')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((log) => {
              const actionCfg = actionLabels[log.action] ?? { label: log.action, className: 'bg-gray-100 text-gray-700' };
              const ActionIcon = actionIcons[log.action] ?? ClipboardList;
              const EntityIcon = entityIcons[log.entity_type] ?? ClipboardList;
              const entityLabel = entityLabels[log.entity_type] ?? log.entity_type;
              const detailName = extractSummary(log.details);

              return (
                <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
                      {(log.user as { avatar_url?: string } | undefined)?.avatar_url ? (
                        <img src={(log.user as { avatar_url: string }).avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {(log.user as { full_name?: string } | undefined)?.full_name ?? t('common.user')}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${actionCfg.className}`}>
                          <ActionIcon className="w-3 h-3" />
                          {actionCfg.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          <EntityIcon className="w-3 h-3" />
                          {entityLabel}
                        </span>
                      </div>
                      {detailName && (
                        <p className="text-sm text-gray-600 mt-0.5">{detailName}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hasMore && filtered.length === logs.length && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchLogs(false)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {loadingMore ? t('common.loading') : t('common.loadMore') || 'Ngarko me shume'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CompanyAuditLog() {
  return (
    <FeatureGate feature="audit_log">
      <AuditLogContent />
    </FeatureGate>
  );
}
