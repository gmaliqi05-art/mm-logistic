import { useEffect, useState } from 'react';
import {
  User,
  CreditCard,
  GraduationCap,
  Stethoscope,
  Contact as IdCard,
  BookUser,
  Home,
  Stamp,
  Mail,
  Phone,
  Building2,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Image,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface DriverProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  company_id: string | null;
  depot_id: string | null;
  base_address: string | null;
  residency_status: string | null;
}

interface License {
  id: string;
  license_number: string;
  license_categories: string[];
  issued_date: string | null;
  issued_country: string;
  expiry_date: string;
  photo_front_url: string;
  photo_back_url: string;
}

interface Qualification {
  id: string;
  qualification_type: string;
  number: string;
  issued_date: string | null;
  expiry_date: string;
  module_hours: number;
  issuing_authority: string;
  photo_front_url: string;
  photo_back_url: string;
}

interface Medical {
  id: string;
  exam_type: string;
  exam_date: string | null;
  expiry_date: string;
  doctor: string;
}

interface IdentityDoc {
  id: string;
  document_type: string;
  document_number: string;
  expiry_date: string | null;
  holder_full_name: string;
  holder_nationality: string;
  photo_front_url: string;
  photo_back_url: string;
}

type ExpiryStatus = 'valid' | 'warn' | 'critical' | 'expired' | 'unknown';

function expiryStatus(date: string | null): { status: ExpiryStatus; days: number | null } {
  if (!date) return { status: 'unknown', days: null };
  const d = Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(d)) return { status: 'unknown', days: null };
  if (d < 0) return { status: 'expired', days: d };
  if (d <= 14) return { status: 'critical', days: d };
  if (d <= 60) return { status: 'warn', days: d };
  return { status: 'valid', days: d };
}

const STATUS_STYLES: Record<ExpiryStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  valid: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ne rregull', Icon: CheckCircle2 },
  warn: { cls: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Skadon se shpejti', Icon: Clock },
  critical: { cls: 'bg-orange-50 text-orange-800 border-orange-200', label: 'Urgjent', Icon: AlertTriangle },
  expired: { cls: 'bg-red-50 text-red-700 border-red-200', label: 'Skaduar', Icon: AlertTriangle },
  unknown: { cls: 'bg-gray-50 text-gray-600 border-gray-200', label: 'Pa afat', Icon: Clock },
};

const QUAL_LABELS: Record<string, string> = {
  kod95: 'Kod 95 (BKrFQG)',
  adr: 'ADR',
  fahrerkarte: 'Fahrerkarte (Tacho)',
  gabelstapler: 'Gabelstapler',
  ladungssicherung: 'Ladungssicherung',
  erste_hilfe: 'Erste Hilfe',
};

const ID_META: Record<string, { title: string; icon: typeof IdCard }> = {
  national_id: { title: 'Karta e Identitetit', icon: IdCard },
  passport: { title: 'Pasaporta', icon: BookUser },
  residence_permit: { title: 'Leja e Qendrimit', icon: Home },
  work_visa: { title: 'Viza e Punes', icon: Stamp },
};

interface Props {
  driverId: string;
  companyName?: string;
  depotName?: string;
}

export default function DriverCVSummary({ driverId, companyName, depotName }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [medicals, setMedicals] = useState<Medical[]>([]);
  const [identityDocs, setIdentityDocs] = useState<IdentityDoc[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (driverId) fetchAll();
  }, [driverId]);

  async function fetchAll() {
    setLoading(true);
    const [p, l, q, m, id] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, avatar_url, company_id, depot_id, base_address, residency_status').eq('id', driverId).maybeSingle(),
      supabase.from('driver_licenses').select('*').eq('driver_id', driverId).order('expiry_date', { ascending: false }),
      supabase.from('driver_qualifications').select('*').eq('driver_id', driverId).order('expiry_date', { ascending: false }),
      supabase.from('driver_medical').select('*').eq('driver_id', driverId).order('expiry_date', { ascending: false }),
      supabase.from('driver_identity_documents').select('*').eq('driver_id', driverId).order('created_at', { ascending: false }),
    ]);
    setDriver(p.data as DriverProfile | null);
    setLicenses((l.data ?? []) as License[]);
    setQualifications((q.data ?? []) as Qualification[]);
    setMedicals((m.data ?? []) as Medical[]);
    setIdentityDocs((id.data ?? []) as IdentityDoc[]);
    setLoading(false);
  }

  async function loadSignedUrl(storagePath: string) {
    if (!storagePath || photoUrls[storagePath]) return;
    const { data } = await supabase.storage.from('fleet-scans').createSignedUrl(storagePath, 600);
    if (data?.signedUrl) {
      setPhotoUrls((prev) => ({ ...prev, [storagePath]: data.signedUrl }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (!driver) {
    return <p className="text-center text-gray-500 py-8">{t('common.driverNotFound')}</p>;
  }

  const initial = driver.full_name?.charAt(0).toUpperCase() ?? 'U';

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-br from-teal-600 to-teal-700 h-16" />
        <div className="px-5 pb-5 -mt-8">
          <div className="flex items-end gap-4">
            <div className="w-16 h-16 rounded-full ring-4 ring-white bg-teal-100 overflow-hidden flex items-center justify-center shadow-md flex-shrink-0">
              {driver.avatar_url ? (
                <img src={driver.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-teal-700">{initial}</span>
              )}
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="text-lg font-bold text-gray-900 truncate">{driver.full_name || 'Pa emer'}</h2>
              <p className="text-xs text-gray-500">Shofer</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {driver.email && (
              <InfoItem icon={Mail} label="Email" value={driver.email} />
            )}
            {driver.phone && (
              <InfoItem icon={Phone} label="Telefon" value={driver.phone} />
            )}
            {companyName && (
              <InfoItem icon={Building2} label="Kompania" value={companyName} />
            )}
            {depotName && (
              <InfoItem icon={Building2} label="Depo" value={depotName} />
            )}
            {driver.base_address && (
              <InfoItem icon={MapPin} label="Baza" value={driver.base_address} />
            )}
            {driver.residency_status && (
              <InfoItem icon={User} label="Statusi" value={
                driver.residency_status === 'citizen' ? 'Shtetas' :
                driver.residency_status === 'permanent_resident' ? 'Rezident i perhershem' :
                'Me vize pune'
              } />
            )}
          </div>
        </div>
      </section>

      {/* Licenses */}
      {licenses.length > 0 && (
        <CVSection title="Patenta" icon={CreditCard}>
          {licenses.map((lic) => {
            const { status, days } = expiryStatus(lic.expiry_date);
            return (
              <DocCard
                key={lic.id}
                title={`Patenta Nr. ${lic.license_number || '-'}`}
                subtitle={`Kategorite: ${(lic.license_categories || []).join(', ') || '-'}`}
                details={[
                  lic.issued_country && `Shteti: ${lic.issued_country}`,
                  lic.issued_date && `Leshuar: ${new Date(lic.issued_date).toLocaleDateString('sq-AL')}`,
                ].filter(Boolean) as string[]}
                expiry={lic.expiry_date}
                status={status}
                days={days}
                frontPath={lic.photo_front_url}
                backPath={lic.photo_back_url}
                photoUrls={photoUrls}
                onLoadPhoto={loadSignedUrl}
              />
            );
          })}
        </CVSection>
      )}

      {/* Qualifications */}
      {qualifications.length > 0 && (
        <CVSection title="Kualifikimet" icon={GraduationCap}>
          {qualifications.map((q) => {
            const { status, days } = expiryStatus(q.expiry_date);
            return (
              <DocCard
                key={q.id}
                title={QUAL_LABELS[q.qualification_type] || q.qualification_type}
                subtitle={q.number ? `Nr. ${q.number}` : ''}
                details={[
                  q.module_hours ? `${q.module_hours} ore` : '',
                  q.issuing_authority ? `Organi: ${q.issuing_authority}` : '',
                  q.issued_date ? `Leshuar: ${new Date(q.issued_date).toLocaleDateString('sq-AL')}` : '',
                ].filter(Boolean) as string[]}
                expiry={q.expiry_date}
                status={status}
                days={days}
                frontPath={q.photo_front_url}
                backPath={q.photo_back_url}
                photoUrls={photoUrls}
                onLoadPhoto={loadSignedUrl}
              />
            );
          })}
        </CVSection>
      )}

      {/* Medical */}
      {medicals.length > 0 && (
        <CVSection title="Mjeksor" icon={Stethoscope}>
          {medicals.map((m) => {
            const { status, days } = expiryStatus(m.expiry_date);
            return (
              <DocCard
                key={m.id}
                title={`${m.exam_type.toUpperCase()} Mjeksor`}
                subtitle={m.doctor ? `Mjeku: ${m.doctor}` : ''}
                details={[
                  m.exam_date ? `Ekzaminimi: ${new Date(m.exam_date).toLocaleDateString('sq-AL')}` : '',
                ].filter(Boolean) as string[]}
                expiry={m.expiry_date}
                status={status}
                days={days}
                photoUrls={photoUrls}
                onLoadPhoto={loadSignedUrl}
              />
            );
          })}
        </CVSection>
      )}

      {/* Identity Documents */}
      {identityDocs.length > 0 && (
        <CVSection title="Dokumentet e Identitetit" icon={IdCard}>
          {identityDocs.map((doc) => {
            const meta = ID_META[doc.document_type] || { title: doc.document_type, icon: IdCard };
            const { status, days } = expiryStatus(doc.expiry_date);
            return (
              <DocCard
                key={doc.id}
                title={meta.title}
                subtitle={doc.document_number ? `Nr. ${doc.document_number}` : ''}
                details={[
                  doc.holder_full_name ? `Mbajtesi: ${doc.holder_full_name}` : '',
                  doc.holder_nationality ? `Kombesia: ${doc.holder_nationality}` : '',
                ].filter(Boolean) as string[]}
                expiry={doc.expiry_date}
                status={status}
                days={days}
                frontPath={doc.photo_front_url}
                backPath={doc.photo_back_url}
                photoUrls={photoUrls}
                onLoadPhoto={loadSignedUrl}
              />
            );
          })}
        </CVSection>
      )}

      {licenses.length === 0 && qualifications.length === 0 && medicals.length === 0 && identityDocs.length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
          <User className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('common.noDocumentsForDriver')}</p>
        </div>
      )}
    </div>
  );
}

function CVSection({ title, icon: Icon, children }: { title: string; icon: typeof CreditCard; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-teal-50">
          <Icon className="w-4 h-4 text-teal-600" />
        </div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {children}
      </div>
    </section>
  );
}

function DocCard({
  title, subtitle, details, expiry, status, days, frontPath, backPath, photoUrls, onLoadPhoto,
}: {
  title: string;
  subtitle: string;
  details: string[];
  expiry: string | null;
  status: ExpiryStatus;
  days: number | null;
  frontPath?: string;
  backPath?: string;
  photoUrls: Record<string, string>;
  onLoadPhoto: (path: string) => void;
}) {
  const [showPhotos, setShowPhotos] = useState(false);
  const chip = STATUS_STYLES[status];
  const ChipIcon = chip.Icon;
  const hasPhotos = !!(frontPath || backPath);

  function handleTogglePhotos() {
    if (!showPhotos) {
      if (frontPath) onLoadPhoto(frontPath);
      if (backPath) onLoadPhoto(backPath);
    }
    setShowPhotos(!showPhotos);
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          {details.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              {details.map((d, i) => (
                <span key={i} className="text-xs text-gray-500">{d}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasPhotos && (
            <button
              onClick={handleTogglePhotos}
              className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
              title="Shiko fotot"
            >
              <Image className="w-4 h-4" />
            </button>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${chip.cls}`}>
            <ChipIcon className="w-3 h-3" />
            {chip.label}
          </span>
        </div>
      </div>
      {expiry && (
        <p className="text-xs text-gray-500 mt-1.5">
          Skadon: {new Date(expiry).toLocaleDateString('sq-AL')}
          {days !== null && days >= 0 && ` (${days} dite)`}
          {days !== null && days < 0 && ` (${Math.abs(days)} dite me vonese)`}
        </p>
      )}
      {showPhotos && hasPhotos && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {frontPath && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Ana e perparme</p>
              {photoUrls[frontPath] ? (
                <img src={photoUrls[frontPath]} alt="Para" className="w-full rounded-lg border border-gray-200 object-cover max-h-40" />
              ) : (
                <div className="h-24 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                </div>
              )}
            </div>
          )}
          {backPath && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Ana e pasme</p>
              {photoUrls[backPath] ? (
                <img src={photoUrls[backPath]} alt="Pas" className="w-full rounded-lg border border-gray-200 object-cover max-h-40" />
              ) : (
                <div className="h-24 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}
