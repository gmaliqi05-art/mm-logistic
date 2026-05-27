import { useState } from 'react';
import {
  Download,
  FileText,
  Package,
  Truck,
  Warehouse,
  Loader2,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FeatureGate from '../../components/subscription/FeatureGate';

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
  table: string;
  filename: string;
}

function toCsvString(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DataExportContent() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const exportOptions: ExportOption[] = [
    { id: 'delivery_notes', label: t('company.dataExport.exports.delivery_notes'), description: t('company.dataExport.exports.delivery_notes_desc'), icon: FileText, table: 'delivery_notes', filename: 'fletedergesat' },
    { id: 'stock', label: t('company.dataExport.exports.stock'), description: t('company.dataExport.exports.stock_desc'), icon: Package, table: 'stock', filename: 'stoku' },
    { id: 'stock_movements', label: t('company.dataExport.exports.stock_movements'), description: t('company.dataExport.exports.stock_movements_desc'), icon: ClipboardList, table: 'stock_movements', filename: 'levizjet_stokut' },
    { id: 'drivers', label: t('company.dataExport.exports.drivers'), description: t('company.dataExport.exports.drivers_desc'), icon: Truck, table: 'profiles', filename: 'shoferet' },
    { id: 'depots', label: t('company.dataExport.exports.depots'), description: t('company.dataExport.exports.depots_desc'), icon: Warehouse, table: 'depots', filename: 'depoiste' },
  ];

  async function handleExport(option: ExportOption) {
    try {
      setExporting(option.id);
      setError(null);
      const companyId = profile!.company_id!;

      let query;
      if (option.table === 'profiles') {
        query = supabase.from('profiles').select('id, email, full_name, phone, role, is_active, created_at').eq('company_id', companyId).eq('role', 'driver');
      } else {
        query = supabase.from(option.table).select('*').eq('company_id', companyId);
      }

      const { data, error: err } = await query.order('created_at', { ascending: false });
      if (err) throw err;

      if (!data || data.length === 0) {
        setError(`${t('company.dataExport.noDataFor')} ${option.label.toLowerCase()}`);
        return;
      }

      const csv = toCsvString(data);
      downloadCsv(csv, option.filename);
      setExported((prev) => new Set([...prev, option.id]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  async function handleExportAll() {
    for (const option of exportOptions) {
      await handleExport(option);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.dataExport.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.dataExport.subtitle')}</p>
        </div>
        <button
          onClick={handleExportAll}
          disabled={!!exporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {t('company.dataExport.exportAll')}
        </button>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {exportOptions.map((option) => {
          const isExporting = exporting === option.id;
          const isExported = exported.has(option.id);
          return (
            <div
              key={option.id}
              className={`bg-white rounded-xl shadow-sm border p-6 transition-all hover:shadow-md ${
                isExported ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${isExported ? 'bg-green-100' : 'bg-teal-100'}`}>
                  <option.icon className={`w-6 h-6 ${isExported ? 'text-green-600' : 'text-teal-600'}`} />
                </div>
                {isExported && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{option.label}</h3>
              <p className="text-sm text-gray-500 mb-4">{option.description}</p>
              <button
                onClick={() => handleExport(option)}
                disabled={isExporting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.exporting')}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {t('company.dataExport.downloadCsv')}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('company.dataExport.infoTitle')}</h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>{t('company.dataExport.info1')}</li>
          <li>{t('company.dataExport.info2')}</li>
          <li>{t('company.dataExport.info3')}</li>
        </ul>
      </div>
    </div>
  );
}

export default function CompanyDataExport() {
  return (
    <FeatureGate feature="data_export">
      <DataExportContent />
    </FeatureGate>
  );
}
