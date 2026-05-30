import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Plus, Trash2, CreditCard, GraduationCap, Stethoscope, Truck as TruckIcon, ShieldAlert, ScanLine, FileText, Download, BarChart3, Contact as IdCard, ClipboardList } from 'lucide-react';
import DriverIdentityPanel from '../../components/fleet/DriverIdentityPanel';
import DriverCVSummary from '../../components/fleet/DriverCVSummary';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { PageSkeleton } from '../../components/ui/Skeleton';
import ExpiryBadge from '../../components/fleet/ExpiryBadge';
import { LICENSE_CATEGORIES, daysUntil } from '../../lib/fleetCompliance';
import { useFleetComplianceTypes } from '../../hooks/useFleetComplianceTypes';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';

interface DriverProfile { id: string; full_name: string; email: string; phone: string; is_active: boolean; depot_id: string | null; residency_status?: 'citizen' | 'permanent_resident' | 'work_visa_holder'; }
interface License { id: string; license_number: string; license_categories: string[]; issued_date: string | null; issued_country: string; expiry_date: string; }
interface Qualification { id: string; qualification_type: string; expiry_date: string; module_hours: number | null; issued_date: string | null; }
interface Medical { id: string; exam_type: string; expiry_date: string; doctor: string; issued_date: string | null; }
interface Assignment { id: string; vehicle_id: string; start_date: string; is_primary: boolean; vehicle?: { license_plate: string; brand: string; model: string }; }

export default function DriverDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { labelOf } = useFleetComplianceTypes('driver');
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [quals, setQuals] = useState<Qualification[]>([]);
  const [medicals, setMedicals] = useState<Medical[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'license' | 'qualifications' | 'medical' | 'identity' | 'vehicles' | 'cv'>('license');
  const [addMode, setAddMode] = useState<null | 'license' | 'qualification' | 'medical'>(null);
  const [scannerCat, setScannerCat] = useState<string | null>(null);
  const [scans, setScans] = useState<Array<{ id: string; detected_category: string; doc_category: string; file_name: string; storage_path: string; created_at: string; status: string }>>([]);

  useEffect(() => { if (id) fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const [p, l, q, m, a] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, is_active, depot_id, residency_status').eq('id', id!).maybeSingle(),
      supabase.from('driver_licenses').select('*').eq('driver_id', id!).order('expiry_date', { ascending: false }),
      supabase.from('driver_qualifications').select('*').eq('driver_id', id!).order('expiry_date', { ascending: false }),
      supabase.from('driver_medical').select('*').eq('driver_id', id!).order('expiry_date', { ascending: false }),
      supabase.from('vehicle_assignments').select('id, vehicle_id, start_date, is_primary, vehicle:vehicles!vehicle_assignments_vehicle_id_fkey(license_plate, brand, model)').eq('driver_id', id!),
    ]);
    if (p.data) setDriver(p.data as DriverProfile);
    setLicenses((l.data || []) as License[]);
    setQuals((q.data || []) as Qualification[]);
    setMedicals((m.data || []) as Medical[]);
    setAssignments(((a.data ?? []) as unknown as Array<{ vehicle?: { license_plate: string; brand: string; model: string } | { license_plate: string; brand: string; model: string }[] } & Assignment>).map((x) => ({
      ...x,
      vehicle: Array.isArray(x.vehicle) ? x.vehicle[0] : x.vehicle,
    })) as Assignment[]);
    const { data: sd } = await supabase
      .from('fleet_scanned_documents')
      .select('id, detected_category, doc_category, file_name, storage_path, created_at, status')
      .eq('mode', 'driver')
      .or(`linked_entity_id.eq.${id},target_entity_id.eq.${id}`)
      .order('created_at', { ascending: false });
    setScans((sd as typeof scans) || []);
    setLoading(false);
  }

  async function openScanFile(path: string) {
    const { data } = await supabase.storage.from('fleet-scans').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function removeRow(table: string, rid: string) {
    if (!confirm(t('common.deleteRecord'))) return;
    await supabase.from(table).delete().eq('id', rid);
    fetchAll();
  }

  if (loading) return <PageSkeleton rows={6} cols={5} showStats={true} />;
  if (!driver) return (
    <div className="text-center p-12">
      <p className="text-gray-500">{t('common.shoferiNukUGjet')}</p>
      <button onClick={() => navigate('/company/drivers')} className="mt-4 text-teal-600">{t('common.kthehuTeShoferet')}</button>
    </div>
  );

  const latestLic = licenses[0];
  const latestKod = quals.find(q => q.qualification_type === 'kod95');
  const latestMed = medicals[0];

  const warnings: string[] = [];
  const dl = daysUntil(latestLic?.expiry_date);
  const dk = daysUntil(latestKod?.expiry_date);
  if (dl !== null && dl <= 180 && dl > 0) warnings.push('Sipas FeV § 24, aplikimi per rinovim te patentes mund te behet 6 muaj perpara skadimit.');
  if (dk !== null && dk <= 365 && dk > 0) warnings.push('Kualifikimi BKrFQG (Kod 95) kerkon 35 ore trajnim cdo 5 vjet.');

  return (
    <div className="space-y-6">
      <Link to="/company/drivers" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-teal-600">
        <ArrowLeft className="w-4 h-4" />{t('common.shoferet')}</Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center">
            <User className="w-7 h-7 text-teal-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{driver.full_name}</h1>
            <div className="text-sm text-gray-500 mt-0.5">{driver.email}{driver.phone ? ` • ${driver.phone}` : ''}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/company/drivers/${id}/reports`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Raportet
            </Link>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${driver.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {driver.is_active ? 'Aktiv' : 'Jo aktiv'}
            </span>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5" />
          <div className="flex-1 text-sm text-amber-900 space-y-1">
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryCard icon={CreditCard} label="Patenta" date={latestLic?.expiry_date} detail={latestLic?.license_number} />
        <SummaryCard icon={GraduationCap} label="Kod 95" date={latestKod?.expiry_date} detail={latestKod ? `${latestKod.module_hours ?? 35}h` : ''} />
        <SummaryCard icon={Stethoscope} label="G25 Mjeksor" date={latestMed?.expiry_date} detail={latestMed?.doctor} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          <TabBtn active={tab === 'license'} onClick={() => setTab('license')} icon={<CreditCard className="w-4 h-4" />}>Patenta (FeV)</TabBtn>
          <TabBtn active={tab === 'qualifications'} onClick={() => setTab('qualifications')} icon={<GraduationCap className="w-4 h-4" />}>Kualifikime</TabBtn>
          <TabBtn active={tab === 'medical'} onClick={() => setTab('medical')} icon={<Stethoscope className="w-4 h-4" />}>Mjeksor</TabBtn>
          <TabBtn active={tab === 'identity'} onClick={() => setTab('identity')} icon={<IdCard className="w-4 h-4" />}>{t('common.identiteti')}</TabBtn>
          <TabBtn active={tab === 'vehicles'} onClick={() => setTab('vehicles')} icon={<TruckIcon className="w-4 h-4" />}>Mjetet</TabBtn>
          <TabBtn active={tab === 'cv'} onClick={() => setTab('cv')} icon={<ClipboardList className="w-4 h-4" />}>CV</TabBtn>
        </div>

        <div className="p-5 space-y-4">
          {tab === 'license' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">{t('common.patentaSipasFevFahrerlaubnisVerordnungKategorite')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setScannerCat('fuehrerschein')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-600 text-teal-700 text-xs rounded-lg hover:bg-teal-50">
                    <ScanLine className="w-3.5 h-3.5" />{t('common.skano')}</button>
                  <button onClick={() => setAddMode('license')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                    <Plus className="w-3.5 h-3.5" />{t('common.add')}</button>
                </div>
              </div>
              {addMode === 'license' && (
                <LicenseAddForm companyId={profile!.company_id!} driverId={id!} onDone={() => { setAddMode(null); fetchAll(); }} />
              )}
              {licenses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('common.asnjePatenteERegjistruar')}</p>
              ) : (
                <div className="space-y-2">
                  {licenses.map(l => (
                    <div key={l.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">Patenta Nr. {l.license_number || '—'}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(l.license_categories || []).map((c) => (
                            <span key={c} className="inline-flex items-center px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded text-[11px] font-semibold">{c}</span>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {l.issued_country || 'DE'}
                          {l.issued_date && ` • leshuar ${new Date(l.issued_date).toLocaleDateString('de-DE')}`}
                        </div>
                      </div>
                      <ExpiryBadge date={l.expiry_date} size="sm" />
                      <button onClick={() => removeRow('driver_licenses', l.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'qualifications' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Kod 95 (BKrFQG): 35 ore trajnim cdo 5 vjet. ADR per mallra te rrezikshme.</p>
                <div className="flex gap-2">
                  <button onClick={() => setScannerCat('kod95')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-600 text-teal-700 text-xs rounded-lg hover:bg-teal-50">
                    <ScanLine className="w-3.5 h-3.5" />{t('common.skano')}</button>
                  <button onClick={() => setAddMode('qualification')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                    <Plus className="w-3.5 h-3.5" />{t('common.add')}</button>
                </div>
              </div>
              {addMode === 'qualification' && (
                <QualAddForm companyId={profile!.company_id!} driverId={id!} onDone={() => { setAddMode(null); fetchAll(); }} />
              )}
              {quals.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('common.asnjeKualifikimIRegjistruar')}</p>
              ) : (
                <div className="space-y-2">
                  {quals.map(q => (
                    <div key={q.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{labelOf(q.qualification_type)}</div>
                        <div className="text-xs text-gray-500">
                          {q.module_hours ? `${q.module_hours}h` : ''}
                          {q.issued_date && ` • leshuar ${new Date(q.issued_date).toLocaleDateString('de-DE')}`}
                        </div>
                      </div>
                      <ExpiryBadge date={q.expiry_date} size="sm" />
                      <button onClick={() => removeRow('driver_qualifications', q.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'medical' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Ekzaminimi G25 (Fahr-, Steuer- und Überwachungstätigkeiten) behet nga mjeku i pune.</p>
                <div className="flex gap-2">
                  <button onClick={() => setScannerCat('g25_medical')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-600 text-teal-700 text-xs rounded-lg hover:bg-teal-50">
                    <ScanLine className="w-3.5 h-3.5" />{t('common.skano')}</button>
                  <button onClick={() => setAddMode('medical')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                    <Plus className="w-3.5 h-3.5" />{t('common.add')}</button>
                </div>
              </div>
              {addMode === 'medical' && (
                <MedicalAddForm companyId={profile!.company_id!} driverId={id!} onDone={() => { setAddMode(null); fetchAll(); }} />
              )}
              {medicals.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('common.asnjeEkzaminimIRegjistruar')}</p>
              ) : (
                <div className="space-y-2">
                  {medicals.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{m.exam_type.toUpperCase()}</div>
                        <div className="text-xs text-gray-500">
                          {m.doctor || '—'}
                          {m.issued_date && ` • ${new Date(m.issued_date).toLocaleDateString('de-DE')}`}
                        </div>
                      </div>
                      <ExpiryBadge date={m.expiry_date} size="sm" />
                      <button onClick={() => removeRow('driver_medical', m.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'identity' && (
            <DriverIdentityPanel
              driverId={id!}
              companyId={profile!.company_id!}
              canEdit={profile?.role === 'company_admin' || profile?.role === 'logistics_admin'}
              residencyStatus={driver.residency_status || 'citizen'}
              onResidencyChange={(s) => setDriver((cur) => (cur ? { ...cur, residency_status: s } : cur))}
            />
          )}

          {tab === 'vehicles' && (
            <>
              <p className="text-sm text-gray-600">{t('common.mjetetKuShoferiEshteCaktuarCaktimi')}</p>
              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('common.asnjeMjetICaktuar')}</p>
              ) : (
                <div className="space-y-2">
                  {assignments.map(a => (
                    <Link key={a.id} to={`/company/vehicles/${a.vehicle_id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 bg-slate-900 text-white rounded font-mono text-xs tracking-wider">
                        {a.vehicle?.license_plate || '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{a.vehicle?.brand} {a.vehicle?.model}</div>
                        <div className="text-xs text-gray-500">
                          Nga {new Date(a.start_date).toLocaleDateString('de-DE')}
                          {a.is_primary && <span className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded">Kryesor</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'cv' && id && (
            <DriverCVSummary driverId={id} />
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-600" /> Dokumente te skanuara
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('common.pdfTeOrigjinaleTeArkivuara')}</p>
          </div>
          <button onClick={() => setScannerCat('other')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
            <ScanLine className="w-3.5 h-3.5" />{t('common.skanoTeRi')}</button>
        </div>
        {scans.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">{t('common.asnjeDokumentISkanuar')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {scans.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{labelOf(s.detected_category || s.doc_category)}</p>
                    <p className="text-xs text-gray-500 truncate">{s.file_name} • {new Date(s.created_at).toLocaleDateString('de-DE')}</p>
                  </div>
                </div>
                <button onClick={() => openScanFile(s.storage_path)} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {scannerCat && (
        <FleetDocScanner
          mode="driver"
          defaultCategory={scannerCat}
          presetTargetId={id!}
          onClose={() => setScannerCat(null)}
          onSaved={() => { setScannerCat(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, date, detail }: { icon: React.ElementType; label: string; date?: string; detail?: string | null }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-teal-50 text-teal-600"><Icon className="w-4 h-4" /></div>
        <div className="text-sm font-semibold text-gray-900">{label}</div>
      </div>
      <ExpiryBadge date={date} size="sm" />
      {detail && <div className="mt-2 text-xs text-gray-500 truncate">{detail}</div>}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
      active ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}>{icon}{children}</button>
  );
}

function LicenseAddForm({ companyId, driverId, onDone }: { companyId: string; driverId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState('');
  const [categories, setCategories] = useState<string[]>(['B']);
  const [issued, setIssued] = useState('');
  const [expiry, setExpiry] = useState('');
  const [country, setCountry] = useState('DE');
  const [saving, setSaving] = useState(false);

  function toggle(cat: string) {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  }

  async function save() {
    if (!expiry) return;
    setSaving(true);
    await supabase.from('driver_licenses').insert({
      driver_id: driverId, company_id: companyId,
      license_number: number, license_categories: categories,
      issued_date: issued || null, issued_country: country, expiry_date: expiry,
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <MiniField label="Numri i patentes" value={number} onChange={setNumber} />
        <MiniField label="Shteti leshues" value={country} onChange={setCountry} />
        <MiniField label="Data e leshimit" type="date" value={issued} onChange={setIssued} />
        <MiniField label="Skadon me *" type="date" value={expiry} onChange={setExpiry} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">{t('common.kategoriteFev')}</label>
        <div className="flex flex-wrap gap-1.5">
          {LICENSE_CATEGORIES.map(cat => (
            <button key={cat} type="button" onClick={() => toggle(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                categories.includes(cat) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'
              }`}>{cat}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t('common.cancel')}</button>
        <button onClick={save} disabled={saving || !expiry} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm disabled:opacity-50">{t('common.save')}</button>
      </div>
    </div>
  );
}

function QualAddForm({ companyId, driverId, onDone }: { companyId: string; driverId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState('kod95');
  const [issued, setIssued] = useState('');
  const [expiry, setExpiry] = useState('');
  const [hours, setHours] = useState('35');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!expiry) return;
    setSaving(true);
    await supabase.from('driver_qualifications').insert({
      driver_id: driverId, company_id: companyId,
      qualification_type: type, issued_date: issued || null, expiry_date: expiry,
      module_hours: type === 'kod95' ? Number(hours) || null : null,
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('common.type')}</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="kod95">Kod 95 (BKrFQG)</option>
            <option value="adr">ADR (Mallra te rrezikshme)</option>
            <option value="fahrerkarte">Fahrerkarte</option>
            <option value="gabelstapler">Gabelstapler</option>
            <option value="ladungssicherung">Ladungssicherung</option>
            <option value="erste_hilfe">Ndihme e Pare</option>
            <option value="other">Tjeter</option>
          </select>
        </div>
        {type === 'kod95' && <MiniField label="Ore modulesh" type="number" value={hours} onChange={setHours} />}
        <MiniField label="Data e leshimit" type="date" value={issued} onChange={setIssued} />
        <MiniField label="Skadon me *" type="date" value={expiry} onChange={setExpiry} />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t('common.cancel')}</button>
        <button onClick={save} disabled={saving || !expiry} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm disabled:opacity-50">{t('common.save')}</button>
      </div>
    </div>
  );
}

function MedicalAddForm({ companyId, driverId, onDone }: { companyId: string; driverId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [exam, setExam] = useState('g25');
  const [doctor, setDoctor] = useState('');
  const [issued, setIssued] = useState('');
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!expiry) return;
    setSaving(true);
    await supabase.from('driver_medical').insert({
      driver_id: driverId, company_id: companyId,
      exam_type: exam, doctor, issued_date: issued || null, expiry_date: expiry,
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('common.llojiIEkzaminimit')}</label>
          <select value={exam} onChange={(e) => setExam(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="g25">G25 (Fahr-, Steuer-, Überwachung)</option>
            <option value="g37">G37 (Ekran)</option>
            <option value="g41">G41 (Punime ne lartesi)</option>
          </select>
        </div>
        <MiniField label="Mjeku" value={doctor} onChange={setDoctor} />
        <MiniField label="Data e ekzaminimit" type="date" value={issued} onChange={setIssued} />
        <MiniField label="Skadon me *" type="date" value={expiry} onChange={setExpiry} />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t('common.cancel')}</button>
        <button onClick={save} disabled={saving || !expiry} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm disabled:opacity-50">{t('common.save')}</button>
      </div>
    </div>
  );
}

function MiniField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
    </div>
  );
}
