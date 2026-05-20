import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Truck, Plus, Trash2, Loader2, ShieldCheck, Receipt, ClipboardCheck, Users as UsersIcon, ScanLine, FileText, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import ExpiryBadge from '../../components/fleet/ExpiryBadge';
import { useFleetComplianceTypes } from '../../hooks/useFleetComplianceTypes';
import FleetDocScanner from '../../components/fleet/FleetDocScanner';
import { notifyUsers } from '../../utils/notifications';

interface Vehicle {
  id: string; vehicle_type: string; brand: string; model: string; license_plate: string;
  vin: string; first_registration: string | null; zb1_number: string; zb2_number: string;
  max_weight_kg: number; payload_kg: number; axles: number; euro_emission: string;
  fuel_type: string; engine_power_kw: number; color: string; status: string; notes: string;
}
interface Inspection { id: string; inspection_type: string; expiry_date: string; issued_date: string | null; provider: string; certificate_number: string; }
interface Insurance { id: string; insurance_type: string; end_date: string; start_date: string | null; provider: string; policy_number: string; premium_amount: number; }
interface Tax { id: string; tax_year: number; due_date: string; amount: number; paid_at: string | null; }
interface Assignment { id: string; driver_id: string; start_date: string; end_date: string | null; is_primary: boolean; driver?: { full_name: string }; }
interface DriverOption { id: string; full_name: string; }

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { labelOf } = useFleetComplianceTypes('vehicle');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [insurance, setInsurance] = useState<Insurance[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'inspections' | 'insurance' | 'taxes' | 'drivers'>('inspections');
  const [addForm, setAddForm] = useState<{ type: string; value: string; value2: string; provider: string } | null>(null);
  const [scannerCat, setScannerCat] = useState<string | null>(null);
  const [scans, setScans] = useState<Array<{ id: string; detected_category: string; doc_category: string; file_name: string; storage_path: string; created_at: string; status: string }>>([]);

  useEffect(() => { if (id) fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const cid = profile!.company_id!;
    const [v, i, ins, t, a, d] = await Promise.all([
      supabase.from('vehicles').select('*').eq('id', id!).maybeSingle(),
      supabase.from('vehicle_inspections').select('*').eq('vehicle_id', id!).order('expiry_date'),
      supabase.from('vehicle_insurance').select('*').eq('vehicle_id', id!).order('end_date'),
      supabase.from('vehicle_taxes').select('*').eq('vehicle_id', id!).order('due_date'),
      supabase.from('vehicle_assignments').select('id, driver_id, start_date, end_date, is_primary, driver:profiles!vehicle_assignments_driver_id_fkey(full_name)').eq('vehicle_id', id!),
      supabase.from('profiles').select('id, full_name').eq('company_id', cid).eq('role', 'driver').eq('is_active', true),
    ]);
    if (v.data) setVehicle(v.data as Vehicle);
    setInspections((i.data || []) as Inspection[]);
    setInsurance((ins.data || []) as Insurance[]);
    setTaxes((t.data || []) as Tax[]);
    setAssignments(((a.data ?? []) as unknown as Array<{ driver?: { full_name: string } | { full_name: string }[] } & Assignment>).map((x) => ({
      ...x,
      driver: Array.isArray(x.driver) ? x.driver[0] : x.driver,
    })) as Assignment[]);
    setDrivers((d.data || []) as DriverOption[]);
    const { data: sd } = await supabase
      .from('fleet_scanned_documents')
      .select('id, detected_category, doc_category, file_name, storage_path, created_at, status')
      .eq('company_id', cid)
      .eq('mode', 'vehicle')
      .or(`linked_entity_id.eq.${id},target_entity_id.eq.${id}`)
      .order('created_at', { ascending: false });
    setScans((sd as typeof scans) || []);
    setLoading(false);
  }

  async function openScanFile(path: string) {
    const { data } = await supabase.storage.from('fleet-scans').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function addInspection(type: string, date: string, provider: string) {
    if (!date) return;
    await supabase.from('vehicle_inspections').insert({
      vehicle_id: id, company_id: profile!.company_id, inspection_type: type, expiry_date: date, provider,
    });
    setAddForm(null);
    fetchAll();
  }
  async function addInsurance(type: string, date: string, provider: string) {
    if (!date) return;
    await supabase.from('vehicle_insurance').insert({
      vehicle_id: id, company_id: profile!.company_id, insurance_type: type, end_date: date, provider,
    });
    setAddForm(null);
    fetchAll();
  }
  async function addTax(dueDate: string, amount: string) {
    if (!dueDate) return;
    await supabase.from('vehicle_taxes').insert({
      vehicle_id: id, company_id: profile!.company_id,
      tax_year: new Date(dueDate).getFullYear(), due_date: dueDate, amount: Number(amount) || 0,
    });
    setAddForm(null);
    fetchAll();
  }
  async function addAssignment(driverId: string) {
    if (!driverId) return;
    const isPrimary = assignments.length === 0;
    await supabase.from('vehicle_assignments').insert({
      vehicle_id: id, company_id: profile!.company_id, driver_id: driverId, is_primary: isPrimary,
    });
    // Notify the driver they were assigned to this vehicle. Skip if the actor
    // is assigning themselves (which is unusual but possible).
    if (driverId !== profile?.id && vehicle) {
      const plate = vehicle.license_plate || '';
      const make = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
      const label = plate && make ? `${plate} (${make})` : plate || make || '';
      await notifyUsers({
        userIds: [driverId],
        type: 'assignment',
        titleKey: 'notifications.templates.vehicleAssigned.title',
        messageKey: 'notifications.templates.vehicleAssigned.body',
        params: { vehicle: label, primary: isPrimary ? '1' : '0' },
        referenceId: id ?? null,
        fallbackTitle: isPrimary ? 'Mjet kryesor i ri' : 'Mjet i ri caktuar',
        fallbackMessage: isPrimary
          ? `Te eshte caktuar si mjet kryesor: ${label}.`
          : `Te eshte caktuar nje mjet: ${label}.`,
      });
    }
    setAddForm(null);
    fetchAll();
  }
  async function removeRow(table: string, rid: string) {
    if (!confirm(t('common.areYouSure'))) return;
    await supabase.from(table).delete().eq('id', rid);
    fetchAll();
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>;
  if (!vehicle) return (
    <div className="text-center p-12">
      <p className="text-gray-500">Mjeti nuk u gjet.</p>
      <button onClick={() => navigate('/company/vehicles')} className="mt-4 text-teal-600">← Kthehu</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link to="/company/vehicles" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-teal-600">
        <ArrowLeft className="w-4 h-4" /> Flota
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-teal-50 text-teal-600"><Truck className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{vehicle.brand} {vehicle.model}</h1>
              <div className="mt-1 inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center px-3 py-1 bg-slate-900 text-white rounded font-mono text-sm tracking-wider">
                  {vehicle.license_plate || '—'}
                </span>
                <span className="text-xs text-gray-500">{vehicle.vehicle_type === 'truck' ? 'Kamion (LKW)' : 'Rimorkio'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <InfoItem label="VIN (FIN)" value={vehicle.vin} mono />
          <InfoItem label="Regjistrimi i pare" value={vehicle.first_registration ? new Date(vehicle.first_registration).toLocaleDateString('de-DE') : '—'} />
          <InfoItem label="Klasa Euro" value={vehicle.euro_emission} />
          <InfoItem label="Pesha max." value={vehicle.max_weight_kg ? `${(vehicle.max_weight_kg / 1000).toFixed(1)} t` : '—'} />
          <InfoItem label="Ngarkesa" value={vehicle.payload_kg ? `${(vehicle.payload_kg / 1000).toFixed(1)} t` : '—'} />
          <InfoItem label="Aksje" value={vehicle.axles ? String(vehicle.axles) : '—'} />
          <InfoItem label="Karburanti" value={vehicle.fuel_type} />
          <InfoItem label="Fuqia" value={vehicle.engine_power_kw ? `${vehicle.engine_power_kw} kW` : '—'} />
          <InfoItem label="ZB I" value={vehicle.zb1_number} />
          <InfoItem label="ZB II" value={vehicle.zb2_number} />
          <InfoItem label="Ngjyra" value={vehicle.color} />
          <InfoItem label="Statusi" value={vehicle.status} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          <TabButton active={tab === 'inspections'} onClick={() => setTab('inspections')} icon={<ClipboardCheck className="w-4 h-4" />}>Inspektimet</TabButton>
          <TabButton active={tab === 'insurance'} onClick={() => setTab('insurance')} icon={<ShieldCheck className="w-4 h-4" />}>Sigurimet</TabButton>
          <TabButton active={tab === 'taxes'} onClick={() => setTab('taxes')} icon={<Receipt className="w-4 h-4" />}>Kfz-Steuer</TabButton>
          <TabButton active={tab === 'drivers'} onClick={() => setTab('drivers')} icon={<UsersIcon className="w-4 h-4" />}>Shoferet</TabButton>
        </div>

        <div className="p-5 space-y-4">
          {tab === 'inspections' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">HU/TUV cdo 2 vjet, AU bashke me HU, UVV vjetore, SP (rimorkio {'>'}10t) cdo 6 muaj.</p>
                <div className="flex gap-2">
                  <button onClick={() => setScannerCat('hu_tuv')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-600 text-teal-700 text-xs rounded-lg hover:bg-teal-50">
                    <ScanLine className="w-3.5 h-3.5" /> Skano
                  </button>
                  <button onClick={() => setAddForm({ type: 'hu_tuv', value: '', value2: '', provider: '' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Shto
                  </button>
                </div>
              </div>
              {addForm && ['hu_tuv', 'au', 'uvv', 'sp', 'tacho'].includes(addForm.type) && (
                <InspectionAddRow
                  initial={addForm.type}
                  onCancel={() => setAddForm(null)}
                  onSave={(type, date, provider) => addInspection(type, date, provider)}
                />
              )}
              <ItemList items={inspections.map(x => ({
                id: x.id, title: labelOf(x.inspection_type),
                subtitle: x.provider || x.certificate_number || '—', date: x.expiry_date,
              }))} onDelete={(rid) => removeRow('vehicle_inspections', rid)} />
            </>
          )}

          {tab === 'insurance' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Haftpflicht eshte i detyrueshem sipas PflVG.</p>
                <div className="flex gap-2">
                  <button onClick={() => setScannerCat('haftpflicht')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-600 text-teal-700 text-xs rounded-lg hover:bg-teal-50">
                    <ScanLine className="w-3.5 h-3.5" /> Skano
                  </button>
                  <button onClick={() => setAddForm({ type: 'haftpflicht', value: '', value2: '', provider: '' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Shto
                  </button>
                </div>
              </div>
              {addForm && ['haftpflicht', 'vollkasko', 'teilkasko', 'ladung'].includes(addForm.type) && (
                <InsuranceAddRow
                  initial={addForm.type}
                  onCancel={() => setAddForm(null)}
                  onSave={(type, date, provider) => addInsurance(type, date, provider)}
                />
              )}
              <ItemList items={insurance.map(x => ({
                id: x.id, title: labelOf(x.insurance_type),
                subtitle: [x.provider, x.policy_number].filter(Boolean).join(' • ') || '—', date: x.end_date,
              }))} onDelete={(rid) => removeRow('vehicle_insurance', rid)} />
            </>
          )}

          {tab === 'taxes' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Kfz-Steuer paguhet vjetore pranë Hauptzollamt.</p>
                <div className="flex gap-2">
                  <button onClick={() => setScannerCat('kfz_steuer')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-600 text-teal-700 text-xs rounded-lg hover:bg-teal-50">
                    <ScanLine className="w-3.5 h-3.5" /> Skano
                  </button>
                  <button onClick={() => setAddForm({ type: 'tax', value: '', value2: '', provider: '' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Shto
                  </button>
                </div>
              </div>
              {addForm?.type === 'tax' && (
                <TaxAddRow onCancel={() => setAddForm(null)} onSave={(d, a) => addTax(d, a)} />
              )}
              <ItemList items={taxes.map(x => ({
                id: x.id, title: `Kfz-Steuer ${x.tax_year}`,
                subtitle: `${x.amount ? x.amount + ' EUR' : ''} ${x.paid_at ? '• Paguar' : ''}`.trim() || '—',
                date: x.due_date,
              }))} onDelete={(rid) => removeRow('vehicle_taxes', rid)} />
            </>
          )}

          {tab === 'drivers' && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Shoferet e caktuar per kete mjet.</p>
                <button onClick={() => setAddForm({ type: 'assign', value: '', value2: '', provider: '' })} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Shto
                </button>
              </div>
              {addForm?.type === 'assign' && (
                <div className="flex gap-2 p-3 bg-gray-50 rounded-lg">
                  <select value={addForm.value} onChange={(e) => setAddForm({ ...addForm, value: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Zgjidh shoferin</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                  <button onClick={() => addAssignment(addForm.value)} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm">Ruaj</button>
                  <button onClick={() => setAddForm(null)} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">Anulo</button>
                </div>
              )}
              <div className="space-y-2">
                {assignments.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Asnje shofer i caktuar.</p>}
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{a.driver?.full_name || '—'}</div>
                      <div className="text-xs text-gray-500">
                        Nga {new Date(a.start_date).toLocaleDateString('de-DE')}
                        {a.is_primary && <span className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded">Kryesor</span>}
                      </div>
                    </div>
                    <button onClick={() => removeRow('vehicle_assignments', a.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-600" /> Dokumente te skanuara
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">PDF-te origjinale te ruajtura per arkivim GoBD</p>
          </div>
          <button onClick={() => setScannerCat('other')} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg">
            <ScanLine className="w-3.5 h-3.5" /> Skano te ri
          </button>
        </div>
        {scans.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Asnje dokument i skanuar.</p>
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
          mode="vehicle"
          defaultCategory={scannerCat}
          presetTargetId={id!}
          onClose={() => setScannerCat(null)}
          onSaved={() => { setScannerCat(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
      active ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}>{icon}{children}</button>
  );
}

function ItemList({ items, onDelete }: { items: Array<{ id: string; title: string; subtitle: string; date: string }>; onDelete: (id: string) => void }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Asnje regjistrim.</p>;
  return (
    <div className="space-y-2">
      {items.map(it => (
        <div key={it.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">{it.title}</div>
            <div className="text-xs text-gray-500 truncate">{it.subtitle}</div>
          </div>
          <ExpiryBadge date={it.date} size="sm" />
          <button onClick={() => onDelete(it.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}

function InspectionAddRow({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (type: string, date: string, provider: string) => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState(initial);
  const [date, setDate] = useState('');
  const [provider, setProvider] = useState('');
  return (
    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
      <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
        <option value="hu_tuv">HU/TUV</option>
        <option value="au">AU</option>
        <option value="uvv">UVV</option>
        <option value="sp">SP</option>
        <option value="tacho">Tachograph</option>
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      <input placeholder={t('companyAdmin.vehicleDetail.provider')} value={provider} onChange={(e) => setProvider(e.target.value)} className="flex-1 min-w-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      <button onClick={() => onSave(type, date, provider)} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm">{t('companyAdmin.vehicleDetail.save')}</button>
      <button onClick={onCancel} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t('companyAdmin.vehicleDetail.cancel')}</button>
    </div>
  );
}

function InsuranceAddRow({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (type: string, date: string, provider: string) => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState(initial);
  const [date, setDate] = useState('');
  const [provider, setProvider] = useState('');
  return (
    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
      <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
        <option value="haftpflicht">Haftpflicht</option>
        <option value="vollkasko">Vollkasko</option>
        <option value="teilkasko">Teilkasko</option>
        <option value="ladung">Ladungsversicherung</option>
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      <input placeholder={t('companyAdmin.vehicleDetail.provider')} value={provider} onChange={(e) => setProvider(e.target.value)} className="flex-1 min-w-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      <button onClick={() => onSave(type, date, provider)} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm">{t('companyAdmin.vehicleDetail.save')}</button>
      <button onClick={onCancel} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t('companyAdmin.vehicleDetail.cancel')}</button>
    </div>
  );
}

function TaxAddRow({ onCancel, onSave }: { onCancel: () => void; onSave: (date: string, amount: string) => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      <input type="number" placeholder={t('companyAdmin.vehicleDetail.amountEur')} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      <button onClick={() => onSave(date, amount)} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm">{t('companyAdmin.vehicleDetail.save')}</button>
      <button onClick={onCancel} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t('companyAdmin.vehicleDetail.cancel')}</button>
    </div>
  );
}
