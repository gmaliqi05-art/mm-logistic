import { useState, useEffect } from 'react';
import {
  Shield,
  Check,
  X,
  Trash2,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Feature, CompanyFeature } from '../../types';

const ALL_FEATURES: Array<{ key: Feature; label: string; description: string }> = [
  {
    key: 'documents_signing',
    label: 'Document Signing',
    description: 'Ability to sign and manage documents digitally',
  },
  {
    key: 'basic_reports',
    label: 'Basic Reports',
    description: 'Access to basic reporting and analytics',
  },
  {
    key: 'categories',
    label: 'Categories',
    description: 'Manage product categories',
  },
  {
    key: 'advanced_reports',
    label: 'Advanced Reports',
    description: 'Detailed analytics and custom reports',
  },
  {
    key: 'export_pdf',
    label: 'PDF Export',
    description: 'Export data and reports as PDF',
  },
  {
    key: 'export_excel',
    label: 'Excel Export',
    description: 'Export data to Excel spreadsheets',
  },
  {
    key: 'audit_log',
    label: 'Audit Log',
    description: 'Track all changes and user actions',
  },
  {
    key: 'bulk_operations',
    label: 'Bulk Operations',
    description: 'Perform bulk actions on multiple items',
  },
  {
    key: 'stock_alerts',
    label: 'Stock Alerts',
    description: 'Receive alerts for low stock levels',
  },
  {
    key: 'data_export',
    label: 'Data Export',
    description: 'Export all company data',
  },
];

interface CompanyFeaturesManagerProps {
  companyId: string;
  companyName: string;
  onClose: () => void;
}

export default function CompanyFeaturesManager({
  companyId,
  companyName,
  onClose,
}: CompanyFeaturesManagerProps) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [features, setFeatures] = useState<CompanyFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchFeatures();
  }, [companyId]);

  async function fetchFeatures() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('company_features')
        .select('*')
        .eq('company_id', companyId);

      if (err) throw err;
      setFeatures(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleFeature(feature: Feature, currentlyEnabled: boolean) {
    const existingFeature = features.find((f) => f.feature === feature);

    try {
      setSaving(true);
      setError(null);

      if (existingFeature) {
        const { error: err } = await supabase
          .from('company_features')
          .update({
            is_enabled: !currentlyEnabled,
            enabled_by: profile!.id,
            enabled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingFeature.id);

        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('company_features').insert({
          company_id: companyId,
          feature,
          is_enabled: true,
          enabled_by: profile!.id,
          notes: notes || `Manually enabled by ${profile!.full_name}`,
        });

        if (err) throw err;
      }

      await fetchFeatures();
      setNotes('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveFeature(featureId: string) {
    try {
      setSaving(true);
      setError(null);

      const { error: err } = await supabase
        .from('company_features')
        .delete()
        .eq('id', featureId);

      if (err) throw err;

      await fetchFeatures();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const enabledFeaturesSet = new Set(
    features.filter((f) => f.is_enabled).map((f) => f.feature)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Manual Feature Override</h3>
          <p className="text-sm text-gray-500 mt-1">
            Manage premium features for <span className="font-medium">{companyName}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Manual Override System</p>
          <p className="text-blue-700">
            Features enabled here will override the company's subscription plan. Use this for
            special deals, partnerships, or trial extensions.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {ALL_FEATURES.map((feature) => {
          const isEnabled = enabledFeaturesSet.has(feature.key);
          const existingFeature = features.find((f) => f.feature === feature.key);

          return (
            <div
              key={feature.key}
              className={`border rounded-lg p-4 transition-all ${
                isEnabled
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg flex-shrink-0 ${
                    isEnabled ? 'bg-teal-100' : 'bg-gray-100'
                  }`}
                >
                  {isEnabled ? (
                    <Check className="w-4 h-4 text-teal-600" />
                  ) : (
                    <Shield className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{feature.label}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{feature.description}</p>
                      {existingFeature && (
                        <p className="text-xs text-gray-400 mt-1">
                          {existingFeature.notes || 'No notes'}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleFeature(feature.key, isEnabled)}
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                          isEnabled
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-teal-600 text-white hover:bg-teal-700'
                        }`}
                      >
                        {isEnabled ? 'Disable' : 'Enable'}
                      </button>

                      {existingFeature && (
                        <button
                          onClick={() => handleRemoveFeature(existingFeature.id)}
                          disabled={saving}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title={t('common.removeOverrideRevertToPlanBased')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          {features.filter((f) => f.is_enabled).length} of {ALL_FEATURES.length} features manually
          enabled
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
