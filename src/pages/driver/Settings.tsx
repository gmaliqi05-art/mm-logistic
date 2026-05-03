import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Loader2,
  ScanLine,
  Mail,
  Phone,
  Building2,
  Warehouse,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Shield,
  FileText,
  Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';
import PushNotificationSettings from '../../components/PushNotificationSettings';

type RecentDoc = {
  id: string;
  doc_category: string | null;
  status: string;
  created_at: string;
  expiry_date?: string | null;
};

const L = {
  title: 'Cilesimet',
  subtitle: 'Profili im dhe dokumentet',
  email: 'Email',
  phone: 'Telefon',
  company: 'Kompania',
  depot: 'Depo',
  changePhoto: 'Ndrysho foton',
  uploadPhoto: 'Ngarko foton',
  photoSaved: 'Foto u ruajt me sukses',
  photoRemoved: 'Foto u hoq',
  errorImageOnly: 'Vetem imazhe lejohen',
  errorTooLarge: 'Imazhi nuk mund te jete me i madh se 5MB',
  errorSaving: 'Gabim gjate ruajtjes',
  documentsTitle: 'Dokumentet e mia',
  documentsSubtitle: 'Skano patenten, Kod 95, G25, ADR — AI ekstrakton te dhenat.',
  scanCta: 'Skano dokumentet e mia',
  scanDescription: 'Patente, Kod 95, G25, ADR — AI ekstrakton te dhenat',
  recentDocs: 'Dokumentet e fundit',
  noDocs: 'Nuk ka dokumente te skanuara',
  expires: 'Skadon',
  docSaved: 'Dokumenti u skanua dhe u dergua tek admin.',
  statusPending: 'Per shqyrtim',
  statusApproved: 'Aprovuar',
  statusRejected: 'Refuzuar',
};

export default function DriverSettings() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [depotName, setDepotName] = useState<string>('');
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile) return;
      const [companyRes, depotRes, docsRes] = await Promise.all([
        profile.company_id
          ? supabase.from('companies').select('name').eq('id', profile.company_id).maybeSingle()
          : Promise.resolve({ data: null }),
        profile.depot_id
          ? supabase.from('depots').select('name').eq('id', profile.depot_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('fleet_scanned_documents')
          .select('id, doc_category, status, created_at, extracted_data')
          .eq('target_driver_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (cancelled) return;
      setCompanyName((companyRes.data as any)?.name ?? '');
      setDepotName((depotRes.data as any)?.name ?? '');
      const docs = ((docsRes as any).data ?? []).map((d: any) => ({
        id: d.id,
        doc_category: d.doc_category,
        status: d.status,
        created_at: d.created_at,
        expiry_date:
          d.extracted_data?.license?.expiry_date ||
          d.extracted_data?.qualification?.expiry_date ||
          d.extracted_data?.medical?.expiry_date ||
          null,
      }));
      setRecentDocs(docs);
      setLoadingDocs(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError(L.errorImageOnly);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError(L.errorTooLarge);
      return;
    }
    setPhotoError(null);
    try {
      setUploading(true);
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${profile.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', profile.id);
      if (updateErr) throw updateErr;
      if (refreshProfile) await refreshProfile();
      setToast(L.photoSaved);
    } catch (err: any) {
      setPhotoError(err.message || L.errorSaving);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemovePhoto() {
    if (!profile?.avatar_url) return;
    try {
      setUploading(true);
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
      if (refreshProfile) await refreshProfile();
      setToast(L.photoRemoved);
    } finally {
      setUploading(false);
    }
  }

  const initial = profile?.full_name?.charAt(0).toUpperCase() ?? 'U';

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{L.title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{L.subtitle}</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-teal-600 to-teal-700 h-20" />
        <div className="px-5 pb-5 -mt-12">
          <div className="flex items-end justify-between gap-3">
            <div className="relative">
              <div className="w-24 h-24 rounded-full ring-4 ring-white bg-teal-100 overflow-hidden flex items-center justify-center shadow-md">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-teal-700">{initial}</span>
                )}
              </div>
              {uploading && (
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {profile?.avatar_url ? L.changePhoto : L.uploadPhoto}
              </button>
              {profile?.avatar_url && (
                <button
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {photoError && <p className="mt-2 text-xs text-red-600">{photoError}</p>}

          <div className="mt-4">
            <h2 className="text-lg font-bold text-gray-900">{profile?.full_name ?? '-'}</h2>
            <p className="text-sm text-gray-500">{t('roles.driver')}</p>
          </div>

          <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
            <InfoRow icon={Mail} label={L.email} value={profile?.email ?? '-'} />
            <InfoRow icon={Phone} label={L.phone} value={profile?.phone ?? '-'} />
            <InfoRow icon={Building2} label={L.company} value={companyName || '-'} />
            <InfoRow icon={Warehouse} label={L.depot} value={depotName || '-'} />
          </dl>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-bold text-gray-900">{L.documentsTitle}</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">{L.documentsSubtitle}</p>

        <button
          onClick={() => setShowScanner(true)}
          className="w-full bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-xl p-4 shadow-sm text-left flex items-center gap-3 hover:from-teal-700 hover:to-teal-800 transition-colors"
        >
          <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
            <ScanLine className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{L.scanCta}</p>
            <p className="text-xs text-teal-50 mt-0.5">{L.scanDescription}</p>
          </div>
          <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-75" />
        </button>

        <div className="mt-5">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{L.recentDocs}</h4>
          {loadingDocs ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : recentDocs.length === 0 ? (
            <p className="text-sm text-gray-400 py-3 text-center">{L.noDocs}</p>
          ) : (
            <ul className="space-y-2">
              {recentDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50"
                >
                  <div className="p-2 rounded-lg bg-white border border-gray-100 flex-shrink-0">
                    <FileText className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {formatCategory(d.doc_category)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(d.created_at).toLocaleDateString()}</span>
                      {d.expiry_date && (
                        <span className="text-gray-400">
                          {' '}
                          • {L.expires}: {new Date(d.expiry_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusPill status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-bold text-gray-900">Njoftimet</h3>
        </div>
        <PushNotificationSettings />
      </section>

      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-80 hover:opacity-100">
            <span className="text-lg leading-none">×</span>
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
            setToast(L.docSaved);
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="p-2 rounded-lg bg-gray-50 flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="text-sm font-medium text-gray-900 truncate">{value}</dd>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending_review: { cls: 'bg-amber-100 text-amber-700', label: L.statusPending },
    approved: { cls: 'bg-emerald-100 text-emerald-700', label: L.statusApproved },
    rejected: { cls: 'bg-red-100 text-red-700', label: L.statusRejected },
  };
  const meta = map[status] ?? { cls: 'bg-gray-100 text-gray-700', label: L.statusPending };
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function formatCategory(cat: string | null): string {
  if (!cat) return '-';
  const map: Record<string, string> = {
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
  return map[cat] ?? cat;
}
