import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FeatureGate from '../../components/subscription/FeatureGate';
import type { AuditLog } from '../../types';

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
};

function AuditLogContent() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');

  const actionLabels: Record<string, { label: string; className: string }> = {
    create: { label: t('company.auditLog.actions.create'), className: 'bg-green-100 text-green-700' },
    update: { label: t('company.auditLog.actions.update'), className: 'bg-blue-100 text-blue-700' },
    delete: { label: t('company.auditLog.actions.delete'), className: 'bg-red-100 text-red-700' },
  };

  const entityLabels: Record<string, string> = {
    driver: t('company.auditLog.entities.driver'),
    depot: t('company.auditLog.entities.depot'),
    delivery_note: t('company.auditLog.entities.delivery_note'),
    stock: t('company.auditLog.entities.stock'),
    stock_movement: t('company.auditLog.entities.stock_movement'),
    document: t('company.auditLog.entities.document'),
    category: t('company.auditLog.entities.category'),
  };

  useEffect(() => {
    if (profile?.company_id) fetchLogs();
  }, [profile?.company_id]);

  async function fetchLogs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, user:profiles!audit_logs_user_id_fkey(id, full_name, email, avatar_url, role)')
        .eq('company_id', profile!.company_id!)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setLogs(data ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = logs.filter((log) => {
    if (filterAction && log.action !== filterAction) return false;
    if (filterEntity && log.entity_type !== filterEntity) return false;
    if (search) {
      const q = search.toLowerCase();
      const userName = (log.user as any)?.full_name?.toLowerCase() ?? '';
      const details = JSON.stringify(log.details).toLowerCase();
      if (!userName.includes(q) && !details.includes(q) && !log.entity_type.includes(q)) return false;
    }
    return true;
  });

  const uniqueEntities = [...new Set(logs.map((l) => l.entity_type))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('company.auditLog.title')}</h1>
        <p className="text-gray-500 mt-1">{t('company.auditLog.subtitle')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
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
              const details = log.details as Record<string, string>;
              const detailName = details?.name || details?.email || details?.note_number || '';

              return (
                <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
                      {(log.user as any)?.avatar_url ? (
                        <img src={(log.user as any).avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {(log.user as any)?.full_name ?? t('common.user')}
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
