import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  Bell,
  BellOff,
  Package,
  Warehouse,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FeatureGate from '../../components/subscription/FeatureGate';
import type { StockAlert, Depot, ProductCategory, Stock as StockType } from '../../types';

interface AlertForm {
  depot_id: string;
  category_id: string;
  alert_type: string;
  threshold: number;
}

const emptyForm: AlertForm = { depot_id: '', category_id: '', alert_type: 'low_stock', threshold: 10 };

function StockAlertsContent() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [stocks, setStocks] = useState<StockType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AlertForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const alertTypeLabels: Record<string, { label: string; desc: string; className: string }> = {
    low_stock: { label: t('company.stockAlerts.alertTypes.low_stock'), desc: t('company.stockAlerts.alertTypes.low_stock_desc'), className: 'bg-amber-100 text-amber-700' },
    out_of_stock: { label: t('company.stockAlerts.alertTypes.out_of_stock'), desc: t('company.stockAlerts.alertTypes.out_of_stock_desc'), className: 'bg-red-100 text-red-700' },
    damaged_threshold: { label: t('company.stockAlerts.alertTypes.damaged_threshold'), desc: t('company.stockAlerts.alertTypes.damaged_threshold_desc'), className: 'bg-orange-100 text-orange-700' },
  };

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const [alertsRes, depotsRes, catsRes, stockRes] = await Promise.all([
        supabase.from('stock_alerts')
          .select('*, depot:depots(id, name), category:product_categories(id, name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase.from('depots').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('product_categories').select('*').eq('company_id', companyId),
        supabase.from('stock').select('*').eq('company_id', companyId),
      ]);
      if (alertsRes.error) throw alertsRes.error;
      setAlerts(alertsRes.data ?? []);
      setDepots(depotsRes.data ?? []);
      setCategories(catsRes.data ?? []);
      setStocks(stockRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.depot_id || !form.category_id) return;
    try {
      setSaving(true);
      const payload = {
        company_id: profile!.company_id!,
        depot_id: form.depot_id,
        category_id: form.category_id,
        alert_type: form.alert_type,
        threshold: form.threshold,
      };
      if (editingId) {
        const { error: err } = await supabase.from('stock_alerts').update(payload).eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('stock_alerts').insert(payload);
        if (err) throw err;
      }
      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(alert: StockAlert) {
    try {
      const { error: err } = await supabase.from('stock_alerts').update({ is_active: !alert.is_active }).eq('id', alert.id);
      if (err) throw err;
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('company.stockAlerts.confirmDelete'))) return;
    try {
      const { error: err } = await supabase.from('stock_alerts').delete().eq('id', id);
      if (err) throw err;
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  }

  function openEdit(alert: StockAlert) {
    setEditingId(alert.id);
    setForm({ depot_id: alert.depot_id, category_id: alert.category_id, alert_type: alert.alert_type, threshold: alert.threshold });
    setShowModal(true);
  }

  function getTriggeredAlerts() {
    return alerts.filter((alert) => {
      if (!alert.is_active) return false;
      const stock = stocks.find((s) => s.depot_id === alert.depot_id && s.category_id === alert.category_id);
      const qty = stock?.quantity ?? 0;
      if (alert.alert_type === 'out_of_stock') return qty === 0;
      if (alert.alert_type === 'low_stock') return qty > 0 && qty <= alert.threshold;
      if (alert.alert_type === 'damaged_threshold') {
        const damaged = stocks.filter(
          (s) => s.depot_id === alert.depot_id && s.category_id === alert.category_id && s.condition === 'damaged'
        ).reduce((sum, s) => sum + s.quantity, 0);
        return damaged >= alert.threshold;
      }
      return false;
    });
  }

  const triggeredAlerts = getTriggeredAlerts();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.stockAlerts.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.stockAlerts.subtitle')}</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(emptyForm); setShowModal(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('company.stockAlerts.addAlert')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {triggeredAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-semibold text-red-800">
              {triggeredAlerts.length} {triggeredAlerts.length > 1 ? t('company.stockAlerts.activeAlerts_plural') : t('company.stockAlerts.activeAlert')}
            </h3>
          </div>
          <div className="space-y-2">
            {triggeredAlerts.map((alert) => {
              const stock = stocks.find((s) => s.depot_id === alert.depot_id && s.category_id === alert.category_id);
              return (
                <div key={alert.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-700">
                    <strong>{(alert.category as any)?.name}</strong> {t('company.stockAlerts.depot').toLowerCase().replace('depoja', 'ne')} <strong>{(alert.depot as any)?.name}</strong>
                    {' '} - {t('company.stockAlerts.currentQty')}: {stock?.quantity ?? 0} ({t('common.threshold')}: {alert.threshold})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">{t('company.stockAlerts.totalAlerts')}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{alerts.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">{t('company.stockAlerts.activeAlerts')}</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{alerts.filter(a => a.is_active).length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">{t('company.stockAlerts.triggeredAlerts')}</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{triggeredAlerts.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Bell className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-400 text-lg">{t('company.stockAlerts.noAlerts')}</p>
            <p className="text-gray-300 text-sm mt-1">{t('company.stockAlerts.noAlertsHint')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {alerts.map((alert) => {
              const typeCfg = alertTypeLabels[alert.alert_type] ?? { label: alert.alert_type, className: 'bg-gray-100 text-gray-700', desc: '' };
              const isTriggered = triggeredAlerts.some(ta => ta.id === alert.id);
              return (
                <div key={alert.id} className={`p-4 hover:bg-gray-50 transition-colors ${isTriggered ? 'bg-red-50/50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${alert.is_active ? 'bg-teal-100' : 'bg-gray-100'}`}>
                        {alert.is_active ? <Bell className="w-4 h-4 text-teal-600" /> : <BellOff className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeCfg.className}`}>
                            {typeCfg.label}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {t('common.threshold')}: {alert.threshold}
                          </span>
                          {isTriggered && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <AlertTriangle className="w-3 h-3" />
                              {t('common.triggered')}
                            </span>
                          )}
                          {!alert.is_active && (
                            <span className="text-xs text-gray-400">{t('common.inactive')}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1"><Warehouse className="w-3 h-3" /> {(alert.depot as any)?.name}</span>
                          <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {(alert.category as any)?.name}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleActive(alert)} className={`p-2 rounded-lg transition-colors ${alert.is_active ? 'text-green-500 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}>
                        {alert.is_active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(alert)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(alert.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? t('company.stockAlerts.editAlert') : t('company.stockAlerts.addAlert')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stockAlerts.depot')}</label>
                <select value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm">
                  <option value="">{t('company.stockAlerts.selectDepot')}</option>
                  {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stockAlerts.category')}</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm">
                  <option value="">{t('company.stockAlerts.selectCategory')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stockAlerts.alertType')}</label>
                <div className="space-y-2">
                  {Object.entries(alertTypeLabels).map(([key, cfg]) => (
                    <button key={key} onClick={() => setForm({ ...form, alert_type: key })} className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${form.alert_type === key ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                        <p className="text-xs text-gray-500 mt-1">{cfg.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.stockAlerts.thresholdQty')}</label>
                <input type="number" min={0} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !form.depot_id || !form.category_id} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? t('common.saveChanges') : t('company.stockAlerts.addAlert')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompanyStockAlerts() {
  return (
    <FeatureGate feature="stock_alerts">
      <StockAlertsContent />
    </FeatureGate>
  );
}
