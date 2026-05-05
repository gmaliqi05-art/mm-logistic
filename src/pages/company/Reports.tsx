import { useState, useEffect } from 'react';
import {
  BarChart3,
  FileText,
  Package,
  Truck,
  Warehouse,
  AlertTriangle,
  TrendingUp,
  Download,
  Crown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import { useCompliance } from '../../hooks/useCompliance';
import {
  chartOfAccounts,
  currency as complianceCurrency,
  taxAuthority,
  vatStandardRate,
} from '../../lib/complianceEngine';

interface ReportData {
  totalNotes: number;
  totalStock: number;
  totalDrivers: number;
  totalDepots: number;
  statusCounts: Record<string, number>;
  stockByDepot: { name: string; total: number }[];
  driverActivity: { name: string; count: number }[];
}

function exportToCsv(headers: string[], rows: string[][], filename: string) {
  const bom = '\uFEFF';
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CompanyReports() {
  const { profile } = useAuth();
  const { canAccess } = useSubscription();
  const { t } = useTranslation();
  const { ctx: complianceCtx } = useCompliance();
  const complianceCoa = chartOfAccounts(complianceCtx);
  const complianceAuthority = taxAuthority(complianceCtx);
  const complianceVat = vatStandardRate(complianceCtx);
  const complianceCur = complianceCurrency(complianceCtx);
  const [data, setData] = useState<ReportData>({
    totalNotes: 0,
    totalStock: 0,
    totalDrivers: 0,
    totalDepots: 0,
    statusCounts: {},
    stockByDepot: [],
    driverActivity: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: t('company.deliveryNotes.draft'), color: 'bg-gray-400' },
    sent: { label: t('company.deliveryNotes.sent'), color: 'bg-blue-500' },
    in_transit: { label: t('company.deliveryNotes.inTransit'), color: 'bg-amber-500' },
    delivered: { label: t('company.deliveryNotes.delivered'), color: 'bg-green-500' },
    confirmed: { label: t('company.deliveryNotes.confirmed'), color: 'bg-teal-500' },
  };

  useEffect(() => {
    if (profile?.company_id) fetchReportData();
  }, [profile?.company_id]);

  async function fetchReportData() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [notesRes, stockRes, driversRes, depotsRes, depotListRes] = await Promise.all([
        supabase.from('delivery_notes').select('id, status, assigned_driver_id').eq('company_id', companyId),
        supabase.from('stock').select('quantity, depot_id').eq('company_id', companyId),
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId).eq('role', 'driver'),
        supabase.from('depots').select('id, name').eq('company_id', companyId),
        supabase.from('depots').select('id, name').eq('company_id', companyId),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (stockRes.error) throw stockRes.error;
      if (driversRes.error) throw driversRes.error;
      if (depotsRes.error) throw depotsRes.error;

      const notes = notesRes.data ?? [];
      const stocks = stockRes.data ?? [];
      const drivers = driversRes.data ?? [];
      const depotsList = depotListRes.data ?? [];

      const statusCounts: Record<string, number> = {};
      notes.forEach((n) => {
        statusCounts[n.status] = (statusCounts[n.status] || 0) + 1;
      });

      const depotStockMap: Record<string, number> = {};
      stocks.forEach((s) => {
        depotStockMap[s.depot_id] = (depotStockMap[s.depot_id] || 0) + s.quantity;
      });
      const stockByDepot = depotsList.map((d) => ({
        name: d.name,
        total: depotStockMap[d.id] || 0,
      }));

      const driverNoteCount: Record<string, number> = {};
      notes.forEach((n) => {
        if (n.assigned_driver_id) {
          driverNoteCount[n.assigned_driver_id] = (driverNoteCount[n.assigned_driver_id] || 0) + 1;
        }
      });
      const driverActivity = drivers
        .map((d) => ({
          name: d.full_name,
          count: driverNoteCount[d.id] || 0,
        }))
        .sort((a, b) => b.count - a.count);

      const totalStock = stocks.reduce((sum, s) => sum + s.quantity, 0);

      setData({
        totalNotes: notes.length,
        totalStock,
        totalDrivers: drivers.length,
        totalDepots: depotsList.length,
        statusCounts,
        stockByDepot,
        driverActivity,
      });
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: t('company.reports.totalNotes'), value: data.totalNotes, icon: FileText, color: 'bg-teal-500' },
    { label: t('company.reports.totalStock'), value: data.totalStock, icon: Package, color: 'bg-emerald-500' },
    { label: t('company.reports.totalDrivers'), value: data.totalDrivers, icon: Truck, color: 'bg-cyan-500' },
    { label: t('company.reports.totalDepots'), value: data.totalDepots, icon: Warehouse, color: 'bg-teal-600' },
  ];

  const maxStatusCount = Math.max(...Object.values(data.statusCounts), 1);
  const maxStockByDepot = Math.max(...data.stockByDepot.map((d) => d.total), 1);
  const maxDriverActivity = Math.max(...data.driverActivity.map((d) => d.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button
          onClick={fetchReportData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {complianceCtx.country_code && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 font-semibold text-sm">
                {complianceCtx.country_code}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {complianceCtx.country_name ?? complianceCtx.country_code}
                </p>
                <p className="text-xs text-gray-500">{t('accounting.compliance.title')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {complianceCoa && (
                <div className="px-3 py-1.5 rounded-md bg-gray-50 border border-gray-100">
                  <span className="text-gray-500">{t('accounting.compliance.chartOfAccounts')}:</span>{' '}
                  <span className="font-semibold text-gray-900">{complianceCoa.code}</span>
                </div>
              )}
              {complianceVat !== null && (
                <div className="px-3 py-1.5 rounded-md bg-gray-50 border border-gray-100">
                  <span className="text-gray-500">TVSH:</span>{' '}
                  <span className="font-semibold text-gray-900">{complianceVat}%</span>
                </div>
              )}
              <div className="px-3 py-1.5 rounded-md bg-gray-50 border border-gray-100">
                <span className="text-gray-500">{t('common.currency') || 'Monedha'}:</span>{' '}
                <span className="font-semibold text-gray-900">{complianceCur.code}</span>
              </div>
              {complianceAuthority && (
                <div className="px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-800">
                  {complianceAuthority.name}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.reports.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.reports.subtitle')}</p>
        </div>
        {canAccess('advanced_reports') ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                const headers = [t('common.status'), t('company.reports.count')];
                const rows = Object.entries(data.statusCounts).map(([k, v]) => [statusConfig[k]?.label ?? k, String(v)]);
                exportToCsv(headers, rows, 'raporti_statuseve');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('company.reports.exportCsv')}
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <Crown className="w-4 h-4" />
            {t('company.reports.premiumExport')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`${card.color} p-3 rounded-xl`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('company.reports.notesByStatus')}</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {Object.entries(statusConfig).map(([key, cfg]) => {
              const count = data.statusCounts[key] || 0;
              const pct = maxStatusCount > 0 ? (count / maxStatusCount) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">{cfg.label}</span>
                    <span className="text-sm font-semibold text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`${cfg.color} h-3 rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(data.statusCounts).length === 0 && (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{t('common.noData')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('company.reports.stockByDepot')}</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {data.stockByDepot.length === 0 ? (
              <div className="text-center py-6">
                <Warehouse className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{t('common.noData')}</p>
              </div>
            ) : (
              data.stockByDepot.map((depot) => {
                const pct = maxStockByDepot > 0 ? (depot.total / maxStockByDepot) * 100 : 0;
                return (
                  <div key={depot.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">{depot.name}</span>
                      <span className="text-sm font-semibold text-gray-900">{depot.total}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className="bg-teal-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('company.reports.driverActivity')}</h2>
          </div>
        </div>
        <div className="p-6">
          {data.driverActivity.length === 0 ? (
            <div className="text-center py-6">
              <Truck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{t('company.drivers.noDrivers')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.driverActivity.map((driver, idx) => {
                const pct = maxDriverActivity > 0 ? (driver.count / maxDriverActivity) * 100 : 0;
                return (
                  <div key={driver.name} className="flex items-center gap-4">
                    <div className="w-8 text-center">
                      <span className={`text-sm font-bold ${idx < 3 ? 'text-teal-600' : 'text-gray-400'}`}>
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{driver.name}</span>
                        <span className="text-sm text-gray-500">{driver.count} {t('company.reports.deliveries')}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            idx === 0 ? 'bg-teal-500' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-cyan-500' : 'bg-gray-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
