import { useEffect, useState } from 'react';
import { CreditCard, GraduationCap, Stethoscope, Contact as IdCard, BookUser, Home, Stamp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

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

export default function DriverMyDocuments() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    load(profile.id);
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
        photoFront: l.photo_front_url,
        photoBack: l.photo_back_url,
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
        photoFront: q.photo_front_url,
        photoBack: q.photo_back_url,
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
        photoFront: i.photo_front_url,
        photoBack: i.photo_back_url,
      });
    });

    const order: Record<ExpiryStatus, number> = { expired: 0, critical: 1, warn: 2, valid: 3, unknown: 4 };
    out.sort((a, b) => order[statusOf(a.expiry).status] - order[statusOf(b.expiry).status]);
    setRows(out);
    setLoading(false);
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
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Dokumentet e Mia</h1>
        <p className="text-sm text-gray-500 mt-1">Patenta, Kod 95, ID, pasaporte, vize, mjeksor — te gjitha afatet ne nje vend.</p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Ne rregull" value={counts.valid} cls="bg-emerald-50 text-emerald-700" />
        <StatCard label="Afer skadences" value={counts.warn + counts.critical} cls="bg-amber-50 text-amber-700" />
        <StatCard label="Skaduar" value={counts.expired} cls="bg-red-50 text-red-700" />
        <StatCard label="Pa afat" value={counts.unknown} cls="bg-gray-50 text-gray-700" />
      </section>

      {loading ? (
        <div className="text-center py-10 text-sm text-gray-500">Duke ngarkuar…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <p className="text-sm text-gray-500">Asnje dokument i regjistruar. Kontakto administratorin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = r.icon;
            const { status, days } = statusOf(r.expiry);
            const chip = STATUS_CHIP[status];
            const Chip = chip.Icon;
            return (
              <article key={r.key} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
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
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Do te njoftoheni automatikisht 90 / 60 / 30 / 14 / 7 dite para skadences se cdo dokumenti.
      </p>
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
