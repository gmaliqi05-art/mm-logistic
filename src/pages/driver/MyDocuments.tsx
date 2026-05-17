import { useEffect, useState } from 'react';
import { CreditCard, GraduationCap, Stethoscope, Contact as IdCard, BookUser, Home, Stamp, AlertTriangle, CheckCircle2, Clock, ScanLine, Loader2, FileText, Calendar, ChevronDown, ChevronUp, Image, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';
import DriverCVSummary from '../../components/fleet/DriverCVSummary';

type ExpiryStatus = 'valid' | 'warn' | 'critical' | 'expired' | 'unknown';

interface DocRow {
  key: string;
  icon: typeof CreditCard;
  title: string;
  subtitle: string;
  expiry: string | null;
  photoFront?: string;
  photoBack?: string;
}

interface RecentScan {
  id: string;
  doc_category: string | null;
  status: string;
  created_at: string;
  expiry_date?: string | null;
}

function statusOf(expiry: string | null): { status: ExpiryStatus; days: number | null } {
  if (!expiry) return { status: 'unknown', days: null };
  const d = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(d)) return { status: 'unknown', days: null };
  if (d < 0) return { status: 'expired', days: d };
  if (d <= 14) return { status: 'critical', days: d };
  if (d <= 60) return { status: 'warn', days: d };
  return { status: 'valid', days: d };
}

const STATUS_CHIP: Record<ExpiryStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  valid: { label: 'Ne rregull', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  warn: { label: 'Skadon se shpejti', cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
  critical: { label: 'Urgjent', cls: 'bg-orange-50 text-orange-800 border-orange-200', Icon: AlertTriangle },
  expired: { label: 'Skaduar', cls: 'bg-red-50 text-red-700 border-red-200', Icon: AlertTriangle },
  unknown: { label: 'Pa afat', cls: 'bg-gray-50 text-gray-600 border-gray-200', Icon: Clock },
};

const CATEGORY_LABELS: Record<string, string> = {
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

export default function DriverMyDocuments() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [loadingScans, setLoadingScans] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, { front?: string; back?: string }>>({});
  const [view, setView] = useState<'docs' | 'cv'>('docs');

  useEffect(() => {
    if (!profile?.id) return;
    load(profile.id);
    loadScans(profile.id);
  }, [profile?.id]);

  async function load(driverId: string) {
    setLoading(true);
    const [lic, qual, med, ident] = await Promise.all([
      supabase.from('driver_licenses').select('id, license_number, expiry_date, photo_front_url, photo_back_url').eq('driver_id', driverId),
      supabase.from('driver_qualifications').select('id, qualification_type, expiry_date, photo_front_url, photo_back_url').eq('driver_id', driverId),
      supabase.from('driver_medical').select('id, exam_type, expiry_date').eq('driver_id', driverId),
      supabase.from('driver_identity_documents').select('id, document_type, document_number, expiry_date, photo_front_url, photo_back_url').eq('driver_id', driverId),
    ]);

    const out: DocRow[] = [];
    (lic.data ?? []).forEach((l) => {
      out.push({
        key: `lic-${l.id}`,
        icon: CreditCard,
        title: 'Patenta',
        subtitle: l.license_number ? `Nr. ${l.license_number}` : '',
        expiry: l.expiry_date,
        photoFront: l.photo_front_url || undefined,
        photoBack: l.photo_back_url || undefined,
      });
    });
    (qual.data ?? []).forEach((q) => {
      const labels: Record<string, string> = {
        kod95: 'Kod 95 (BKrFQG)', adr: 'ADR', fahrerkarte: 'Fahrerkarte', gabelstapler: 'Gabelstapler',
        ladungssicherung: 'Ladungssicherung', erste_hilfe: 'Erste Hilfe',
      };
      out.push({
        key: `qual-${q.id}`,
        icon: GraduationCap,
        title: labels[q.qualification_type] || q.qualification_type,
        subtitle: '',
        expiry: q.expiry_date,
        photoFront: q.photo_front_url || undefined,
        photoBack: q.photo_back_url || undefined,
      });
    });
    (med.data ?? []).forEach((m) => {
      out.push({
        key: `med-${m.id}`,
        icon: Stethoscope,
        title: `${m.exam_type.toUpperCase()} Mjeksor`,
        subtitle: '',
        expiry: m.expiry_date,
      });
    });
    (ident.data ?? []).forEach((i) => {
      const meta: Record<string, { title: string; icon: typeof CreditCard }> = {
        national_id: { title: 'Karta e Identitetit', icon: IdCard },
        passport: { title: 'Pasaporta', icon: BookUser },
        residence_permit: { title: 'Leja e Qendrimit', icon: Home },
        work_visa: { title: 'Viza e Punes', icon: Stamp },
      };
      const m = meta[i.document_type] || { title: i.document_type, icon: IdCard };
      out.push({
        key: `id-${i.id}`,
        icon: m.icon,
        title: m.title,
        subtitle: i.document_number ? `Nr. ${i.document_number}` : '',
        expiry: i.expiry_date,
        photoFront: i.photo_front_url || undefined,
        photoBack: i.photo_back_url || undefined,
      });
    });

    const order: Record<ExpiryStatus, number> = { expired: 0, critical: 1, warn: 2, valid: 3, unknown: 4 };
    out.sort((a, b) => order[statusOf(a.expiry).status] - order[statusOf(b.expiry).status]);
    setRows(out);
    setLoading(false);
  }

  async function loadScans(driverId: string) {
    setLoadingScans(true);
    const { data } = await supabase
      .from('fleet_scanned_documents')
      .select('id, doc_category, status, created_at, extracted_json')
      .eq('mode', 'driver')
      .eq('target_entity_id', driverId)
      .order('created_at', { ascending: false })
      .limit(5);
    const scans = (data ?? []).map((d: any) => ({
      id: d.id,
      doc_category: d.doc_category,
      status: d.status,
      created_at: d.created_at,
      expiry_date:
        d.extracted_json?.license?.expiry_date ||
        d.extracted_json?.qualification?.expiry_date ||
        d.extracted_json?.medical?.expiry_date ||
        null,
    }));
    setRecentScans(scans);
    setLoadingScans(false);
  }

  async function handleExpand(key: string, photoFront?: string, photoBack?: string) {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (photoUrls[key]) return;
    const urls: { front?: string; back?: string } = {};
    if (photoFront) {
      const { data } = await supabase.storage.from('fleet-scans').createSignedUrl(photoFront, 600);
      if (data?.signedUrl) urls.front = data.signedUrl;
    }
    if (photoBack) {
      const { data } = await supabase.storage.from('fleet-scans').createSignedUrl(photoBack, 600);
      if (data?.signedUrl) urls.back = data.signedUrl;
    }
    setPhotoUrls((prev) => ({ ...prev, [key]: urls }));
  }

  const counts = rows.reduce(
    (acc, r) => {
      const s = statusOf(r.expiry).status;
      acc[s] += 1;
      return acc;
    },
    { valid: 0, warn: 0, critical: 0, expired: 0, unknown: 0 } as Record<ExpiryStatus, number>,
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dokumentet e Mia</h1>
            <p className="text-sm text-gray-500 mt-1">Patenta, Kod 95, ID, pasaporte, vize, mjeksor — te gjitha afatet ne nje vend.</p>
          </div>
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 text-white text-sm font-semibold shadow-sm hover:from-teal-700 hover:to-teal-800 transition-colors flex-shrink-0"
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">Skano Dokumentin</span>
            <span className="sm:hidden">Skano</span>
          </button>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('docs')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'docs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <FileText className="w-4 h-4" />
            Dokumentet
          </button>
          <button
            onClick={() => setView('cv')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'cv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <ClipboardList className="w-4 h-4" />
            Profili im (CV)
          </button>
        </div>
      </header>

      {view === 'cv' && profile?.id ? (
        <DriverCVSummary driverId={profile.id} />
      ) : (
      <>
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Ne rregull" value={counts.valid} cls="bg-emerald-50 text-emerald-700" />
        <StatCard label="Afer skadences" value={counts.warn + counts.critical} cls="bg-amber-50 text-amber-700" />
        <StatCard label="Skaduar" value={counts.expired} cls="bg-red-50 text-red-700" />
        <StatCard label="Pa afat" value={counts.unknown} cls="bg-gray-50 text-gray-700" />
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <ScanLine className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Asnje dokument i regjistruar.</p>
          <button
            onClick={() => setShowScanner(true)}
            className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-700"
          >
            Skano dokumentin e pare
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = r.icon;
            const { status, days } = statusOf(r.expiry);
            const chip = STATUS_CHIP[status];
            const Chip = chip.Icon;
            const hasPhotos = !!(r.photoFront || r.photoBack);
            const isExpanded = expandedKey === r.key;
            return (
              <article key={r.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div
                  className={`flex items-start gap-3 p-4 ${hasPhotos ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
                  onClick={hasPhotos ? () => handleExpand(r.key, r.photoFront, r.photoBack) : undefined}
                >
                  <div className="p-2 rounded-lg bg-teal-50 text-teal-600"><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm">{r.title}</h3>
                      {r.subtitle && <span className="text-xs text-gray-500">{r.subtitle}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${chip.cls}`}>
                        <Chip className="w-3 h-3" />
                        {chip.label}
                      </span>
                      {r.expiry && (
                        <span className="text-xs text-gray-500">
                          Skadon {new Date(r.expiry).toLocaleDateString('sq-AL')}
                          {days !== null && days >= 0 && ` · ${days} dite`}
                          {days !== null && days < 0 && ` · ${Math.abs(days)} dite me vonese`}
                        </span>
                      )}
                    </div>
                  </div>
                  {hasPhotos && (
                    <div className="flex items-center gap-1 text-gray-400 flex-shrink-0 mt-1">
                      <Image className="w-4 h-4" />
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  )}
                </div>
                {isExpanded && hasPhotos && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {r.photoFront && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ana e perparme</p>
                          {photoUrls[r.key]?.front ? (
                            <img src={photoUrls[r.key].front} alt="Para" className="w-full rounded-lg border border-gray-200 object-cover max-h-48" />
                          ) : (
                            <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-200">
                              <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                            </div>
                          )}
                        </div>
                      )}
                      {r.photoBack && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ana e pasme</p>
                          {photoUrls[r.key]?.back ? (
                            <img src={photoUrls[r.key].back} alt="Pas" className="w-full rounded-lg border border-gray-200 object-cover max-h-48" />
                          ) : (
                            <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-200">
                              <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Recent Scans */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Skanimet e fundit</h3>
        {loadingScans ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : recentScans.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">Nuk ka skanimete te fundit</p>
        ) : (
          <ul className="space-y-2">
            {recentScans.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
                <div className="p-2 rounded-lg bg-white border border-gray-100 flex-shrink-0">
                  <FileText className="w-4 h-4 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {CATEGORY_LABELS[d.doc_category ?? ''] ?? d.doc_category ?? '-'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(d.created_at).toLocaleDateString()}</span>
                    {d.expiry_date && (
                      <span className="text-gray-400">
                        {' '} Skadon: {new Date(d.expiry_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <ScanStatusPill status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-gray-500">
        Do te njoftoheni automatikisht 90 / 60 / 30 / 14 / 7 dite para skadences se cdo dokumenti.
      </p>
      </>
      )}

      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-80 hover:opacity-100">
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      {showScanner && profile?.id && (
        <FleetDocScanner
          mode="driver"
          presetTargetId={profile.id}
          onClose={() => setShowScanner(false)}
          onSaved={() => {
            setShowScanner(false);
            setToast('Dokumenti u skanua me sukses.');
            if (profile?.id) {
              load(profile.id);
              loadScans(profile.id);
            }
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function ScanStatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending_review: { cls: 'bg-amber-100 text-amber-700', label: 'Per shqyrtim' },
    saved: { cls: 'bg-emerald-100 text-emerald-700', label: 'Ruajtur' },
    approved: { cls: 'bg-emerald-100 text-emerald-700', label: 'Aprovuar' },
    rejected: { cls: 'bg-red-100 text-red-700', label: 'Refuzuar' },
  };
  const meta = map[status] ?? { cls: 'bg-gray-100 text-gray-700', label: status };
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
