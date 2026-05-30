import { useEffect, useState } from 'react';
import { Loader2, FileText, CheckCircle2, XCircle, Clock, RefreshCw, ScanLine, Truck, CircleUser as UserCircle, Download, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';

interface ScanRow {
  id: string;
  mode: 'vehicle' | 'driver';
  doc_category: string;
  detected_category: string;
  file_name: string;
  file_mime: string;
  storage_path: string;
  status: string;
  linked_entity_type: string;
  linked_entity_id: string | null;
  error_message: string;
  extracted_json: Record<string, unknown> | null;
  created_at: string;
  uploaded_by: string | null;
}

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  uploaded: { label: 'Ngarkuar', cls: 'bg-slate-100 text-slate-700', icon: Clock },
  processing: { label: 'Duke procesuar', cls: 'bg-blue-100 text-blue-700', icon: Loader2 },
  parsed: { label: 'Pret konfirmim', cls: 'bg-amber-100 text-amber-800', icon: FileText },
  saved: { label: 'Ruajtur', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Deshtoi', cls: 'bg-red-100 text-red-700', icon: XCircle },
};

const CATEGORY_LABELS: Record<string, string> = {
  zulassung: 'Zulassung',
  hu_tuv: 'HU/TUV',
  au: 'AU',
  sp: 'SP',
  uvv: 'UVV',
  tacho: 'Tacho',
  haftpflicht: 'Haftpflicht',
  vollkasko: 'Vollkasko',
  teilkasko: 'Teilkasko',
  ladung: 'Ladung',
  kfz_steuer: 'Kfz-Steuer',
  fuehrerschein: 'Patente',
  kod95: 'Kod 95',
  adr: 'ADR',
  fahrerkarte: 'Fahrerkarte',
  gabelstapler: 'Gabelstapler',
  ladungssicherung: 'Ladungssicherung',
  erste_hilfe: 'Erste Hilfe',
  g25_medical: 'G25',
  other: 'Tjeter',
};

export default function FleetScans() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState<'vehicle' | 'driver' | null>(null);
  const [filter, setFilter] = useState<'all' | 'vehicle' | 'driver' | 'pending'>('all');

  useEffect(() => { load(); }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('fleet_scanned_documents')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows((data as ScanRow[] | null) ?? []);
    setLoading(false);
  }

  async function downloadFile(row: ScanRow) {
    const { data } = await supabase.storage.from('fleet-scans').createSignedUrl(row.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function deleteRow(row: ScanRow) {
    if (!confirm(t('common.deleteFleetScanConfirm'))) return;
    await supabase.storage.from('fleet-scans').remove([row.storage_path]);
    await supabase.from('fleet_scanned_documents').delete().eq('id', row.id);
    load();
  }

  const filtered = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status === 'parsed';
    return r.mode === filter;
  });

  const pendingCount = rows.filter(r => r.status === 'parsed').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ScanLine className="w-7 h-7 text-teal-600" /> Skanime Flote / Shofer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dokumentet e skanuara arkivohen automatikisht per perputhje me GoBD
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowScanner('vehicle')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700"
          >
            <Truck className="w-4 h-4" /> Skano dokument mjeti
          </button>
          <button
            onClick={() => setShowScanner('driver')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800"
          >
            <UserCircle className="w-4 h-4" /> Skano dokument shoferi
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {([
          { v: 'all', l: `Te gjitha (${rows.length})` },
          { v: 'pending', l: `Pret konfirmim (${pendingCount})` },
          { v: 'vehicle', l: 'Mjete' },
          { v: 'driver', l: 'Shofere' },
        ] as const).map(f => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              filter === f.v
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            {f.l}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <RefreshCw className="w-4 h-4" /> Rifresko
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-8 h-8 mx-auto text-teal-600 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-200 rounded-xl">
          <ScanLine className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">Ende nuk ka skanime</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">{t('common.type')}</th>
                  <th className="px-3 py-2.5">Kategoria</th>
                  <th className="px-3 py-2.5">{t('common.file')}</th>
                  <th className="px-3 py-2.5">{t('common.status')}</th>
                  <th className="px-3 py-2.5">{t('common.date')}</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(row => {
                  const s = STATUS_STYLES[row.status] || STATUS_STYLES.uploaded;
                  const Icon = s.icon;
                  const cat = row.detected_category || row.doc_category;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${row.mode === 'vehicle' ? 'text-teal-700' : 'text-slate-700'}`}>
                          {row.mode === 'vehicle' ? <Truck className="w-3.5 h-3.5" /> : <UserCircle className="w-3.5 h-3.5" />}
                          {row.mode === 'vehicle' ? 'Mjet' : 'Shofer'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-800 font-medium">{CATEGORY_LABELS[cat] || cat}</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate max-w-[200px]">{row.file_name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>
                          <Icon className={`w-3 h-3 ${row.status === 'processing' ? 'animate-spin' : ''}`} />
                          {s.label}
                        </span>
                        {row.error_message && <p className="text-[11px] text-red-600 mt-0.5">{row.error_message}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{new Date(row.created_at).toLocaleString('de-DE')}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => downloadFile(row)}
                            title="Shiko PDF"
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteRow(row)}
                            title="Fshij"
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showScanner && (
        <FleetDocScanner
          mode={showScanner}
          onClose={() => { setShowScanner(null); load(); }}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
