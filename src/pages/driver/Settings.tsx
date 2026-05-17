import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Loader2,
  Mail,
  Phone,
  Building2,
  Warehouse,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Shield,
  MapPin,
  Save,
  Contact as IdCard,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import PushNotificationSettings from '../../components/PushNotificationSettings';
import { Link } from 'react-router-dom';

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
};

export default function DriverSettings() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [depotName, setDepotName] = useState<string>('');
  const [baseAddress, setBaseAddress] = useState('');
  const [baseLat, setBaseLat] = useState<number | null>(null);
  const [baseLng, setBaseLng] = useState<number | null>(null);
  const [baseSaving, setBaseSaving] = useState(false);
  const [baseLoading, setBaseLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile) return;
      const [companyRes, depotRes, baseRes] = await Promise.all([
        profile.company_id
          ? supabase.from('companies').select('name').eq('id', profile.company_id).maybeSingle()
          : Promise.resolve({ data: null }),
        profile.depot_id
          ? supabase.from('depots').select('name').eq('id', profile.depot_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('profiles')
          .select('base_address, base_lat, base_lng')
          .eq('id', profile.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setCompanyName((companyRes.data as any)?.name ?? '');
      setDepotName((depotRes.data as any)?.name ?? '');
      const base = (baseRes as any)?.data;
      if (base) {
        setBaseAddress(base.base_address ?? '');
        setBaseLat(base.base_lat ?? null);
        setBaseLng(base.base_lng ?? null);
      }
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

  async function saveBase() {
    if (!profile) return;
    setBaseSaving(true);
    try {
      const trimmed = baseAddress.trim();
      let lat = baseLat;
      let lng = baseLng;
      if (trimmed) {
        try {
          setBaseLoading(true);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(trimmed)}`,
            { headers: { 'Accept-Language': 'sq,en' } },
          );
          if (res.ok) {
            const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
            if (arr[0]) {
              lat = Number(arr[0].lat);
              lng = Number(arr[0].lon);
            }
          }
        } finally {
          setBaseLoading(false);
        }
      } else {
        lat = null;
        lng = null;
      }
      await supabase
        .from('profiles')
        .update({ base_address: trimmed || null, base_lat: lat, base_lng: lng })
        .eq('id', profile.id);
      setBaseLat(lat);
      setBaseLng(lng);
      setToast('Baza u ruajt');
    } finally {
      setBaseSaving(false);
    }
  }

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
          <MapPin className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-bold text-gray-900">Lokacioni i bazes</h3>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Kur nuk ka destinacion te caktuar, sistemi do te shfaqe automatikisht rrugen per ne baze.
        </p>
        <div className="space-y-2">
          <input
            type="text"
            value={baseAddress}
            onChange={(e) => setBaseAddress(e.target.value)}
            placeholder="P.sh. Rr. Marubi 8, Shkoder"
            className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-gray-500">
              {baseLat != null && baseLng != null
                ? `${baseLat.toFixed(5)}, ${baseLng.toFixed(5)}`
                : 'Asnje koordinate e ruajtur'}
            </div>
            <button
              type="button"
              onClick={() => void saveBase()}
              disabled={baseSaving || baseLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"
            >
              {baseSaving || baseLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Ruaj
            </button>
          </div>
        </div>
      </section>

      <Link
        to="/driver/my-documents"
        className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-teal-300 hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600 flex-shrink-0">
            <IdCard className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900">{L.documentsTitle}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Shiko patenten, Kod 95, G25, ADR — te ruajtura per ty</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </div>
      </Link>

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

