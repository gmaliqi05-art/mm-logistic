import { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, Sparkles, AlertTriangle, FileText, Camera, Check, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import CameraScanner from '../accounting/CameraScanner';

export type FleetMode = 'vehicle' | 'driver';

export type VehicleCategory = 'zulassung' | 'hu_tuv' | 'au' | 'sp' | 'uvv' | 'tacho' | 'haftpflicht' | 'vollkasko' | 'teilkasko' | 'ladung' | 'kfz_steuer' | 'other';
export type DriverCategory = 'fuehrerschein' | 'kod95' | 'adr' | 'fahrerkarte' | 'gabelstapler' | 'ladungssicherung' | 'erste_hilfe' | 'g25_medical' | 'other';

interface Driver { id: string; full_name: string | null; email: string | null; }
interface Vehicle { id: string; license_plate: string; brand: string; model: string; }

interface Extracted {
  doc_category: string;
  vehicle: {
    license_plate: string; vin: string; zb1_number: string; zb2_number: string;
    brand: string; model: string; first_registration: string;
    max_weight_kg: number; payload_kg: number; axles: number;
    euro_emission: string; fuel_type: string; engine_power_kw: number; color: string;
  };
  inspection: { inspection_type: string; issued_date: string; expiry_date: string; provider: string; certificate_number: string; };
  insurance: { insurance_type: string; provider: string; policy_number: string; start_date: string; end_date: string; premium_amount: number; };
  tax: { tax_year: number; amount: number; due_date: string; paid_at: string; };
  driver: { full_name: string; birth_date: string; };
  license: { license_number: string; license_categories: string[]; issued_date: string; issued_country: string; issuing_authority: string; expiry_date: string; };
  qualification: { qualification_type: string; number: string; issued_date: string; expiry_date: string; module_hours: number; issuing_authority: string; };
  medical: { exam_type: string; exam_date: string; expiry_date: string; doctor: string; };
  confidence: number;
  notes: string;
}

const VEHICLE_CATEGORIES: { value: VehicleCategory; label: string }[] = [
  { value: 'zulassung', label: 'Zulassung (ZB I/II)' },
  { value: 'hu_tuv', label: 'HU / TUV' },
  { value: 'au', label: 'AU (Abgas)' },
  { value: 'sp', label: 'SP (Sicherheitsprufung)' },
  { value: 'uvv', label: 'UVV' },
  { value: 'tacho', label: 'Tachograph' },
  { value: 'haftpflicht', label: 'Sigurim - Haftpflicht' },
  { value: 'vollkasko', label: 'Sigurim - Vollkasko' },
  { value: 'teilkasko', label: 'Sigurim - Teilkasko' },
  { value: 'ladung', label: 'Sigurim i ngarkeses' },
  { value: 'kfz_steuer', label: 'Kfz-Steuer' },
  { value: 'other', label: 'Tjeter' },
];

const DRIVER_CATEGORIES: { value: DriverCategory; label: string }[] = [
  { value: 'fuehrerschein', label: 'Patente (Fuhrerschein)' },
  { value: 'kod95', label: 'Kod 95' },
  { value: 'adr', label: 'ADR' },
  { value: 'fahrerkarte', label: 'Fahrerkarte (Tacho)' },
  { value: 'gabelstapler', label: 'Gabelstapler' },
  { value: 'ladungssicherung', label: 'Ladungssicherung' },
  { value: 'erste_hilfe', label: 'Erste Hilfe' },
  { value: 'g25_medical', label: 'G25 (Mjeksor)' },
  { value: 'other', label: 'Tjeter' },
];

interface Props {
  mode: FleetMode;
  defaultCategory?: string;
  presetTargetId?: string;
  onClose: () => void;
  onSaved?: (scanId: string, linkedId: string | null) => void;
}

type Step = 'category' | 'choose' | 'camera' | 'uploading' | 'analyzing' | 'review';

export default function FleetDocScanner({ mode, defaultCategory, presetTargetId, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? '';
  const categories = mode === 'vehicle' ? VEHICLE_CATEGORIES : DRIVER_CATEGORIES;

  const [step, setStep] = useState<Step>(defaultCategory ? 'choose' : 'category');
  const [category, setCategory] = useState<string>(defaultCategory || '');
  const [error, setError] = useState('');
  const [scanId, setScanId] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string>('');
  const [fileMime, setFileMime] = useState<string>('');
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [editMap, setEditMap] = useState<Record<string, string | number | string[]>>({});
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [targetEntityId, setTargetEntityId] = useState<string>(presetTargetId || '');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) return;
    if (mode === 'driver') {
      supabase.from('profiles').select('id, full_name, email').eq('company_id', companyId).eq('role', 'driver').then(({ data }) => {
        setDrivers((data as Driver[]) ?? []);
      });
    } else {
      supabase.from('vehicles').select('id, license_plate, brand, model').eq('company_id', companyId).then(({ data }) => {
        setVehicles((data as Vehicle[]) ?? []);
      });
    }
  }, [mode, companyId]);

  async function processFile(file: File) {
    setError('');
    if (file.size > 15 * 1024 * 1024) {
      setError('Skedari eshte shume i madh (max 15 MB).');
      return;
    }
    setStep('uploading');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('fleet-scans').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: scan, error: scanErr } = await supabase
        .from('fleet_scanned_documents')
        .insert({
          company_id: companyId,
          uploaded_by: profile?.id,
          mode,
          doc_category: category || 'other',
          storage_path: path,
          file_name: file.name,
          file_mime: file.type,
          file_size: file.size,
          status: 'uploaded',
          target_entity_id: presetTargetId || null,
        })
        .select()
        .maybeSingle();
      if (scanErr || !scan) throw scanErr || new Error('Insert failed');

      setScanId(scan.id as string);

      setStep('analyzing');
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-fleet-document`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ scanId: scan.id, mode, docCategory: category }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Analiza deshtoi');

      const { data: signed } = await supabase.storage.from('fleet-scans').createSignedUrl(path, 3600);
      setFileUrl(signed?.signedUrl || '');
      setFileMime(file.type);
      const ex: Extracted = json.extracted;
      setExtracted(ex);
      const effectiveCategory = ex.doc_category || category || 'other';
      setCategory(effectiveCategory);
      setEditMap(buildEditMap(ex, effectiveCategory, mode));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate procesimit');
      setStep(defaultCategory ? 'choose' : 'category');
    }
  }

  function onCameraCapture(file: File) {
    setStep('choose');
    processFile(file);
  }

  async function handleSave() {
    if (!extracted || !scanId) return;
    setSaving(true);
    setError('');
    try {
      let linkedType = '';
      let linkedId: string | null = null;

      if (mode === 'vehicle') {
        const result = await saveVehicleSide(editMap, category, targetEntityId, companyId);
        linkedType = result.entity_type;
        linkedId = result.entity_id;
      } else {
        const result = await saveDriverSide(editMap, category, targetEntityId, companyId);
        linkedType = result.entity_type;
        linkedId = result.entity_id;
      }

      await supabase
        .from('fleet_scanned_documents')
        .update({
          status: 'saved',
          linked_entity_type: linkedType,
          linked_entity_id: linkedId,
          confirmed_at: new Date().toISOString(),
          confirmed_by: profile?.id,
          extracted_json: { ...extracted, _edited: editMap },
        })
        .eq('id', scanId);

      onSaved?.(scanId, linkedId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ruajtja deshtoi');
    } finally {
      setSaving(false);
    }
  }

  const confidence = Math.round((extracted?.confidence || 0) * 100);
  const fields = extracted ? getDisplayFields(category, mode, editMap) : [];
  const needsTarget = mode === 'driver' && !presetTargetId;
  const needsVehicleTarget = mode === 'vehicle' && category !== 'zulassung' && !presetTargetId;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Sparkles className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {mode === 'vehicle' ? 'Skano dokument te mjetit' : 'Skano dokument te shoferit'}
              </h2>
              <p className="text-xs text-slate-500">AI ekstrakton te dhenat automatikisht</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {step === 'category' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Zgjidh llojin e dokumentit qe po skanoni:</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {categories.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => { setCategory(c.value); setStep('choose'); }}
                    className="p-3 text-left border border-slate-200 hover:border-teal-500 hover:bg-teal-50 rounded-lg text-sm font-medium text-slate-800 transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'choose' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Kategoria:</span>
                <span className="font-semibold text-slate-900">{categories.find(c => c.value === category)?.label || 'Tjeter'}</span>
                {!defaultCategory && (
                  <button onClick={() => setStep('category')} className="ml-auto text-teal-600 hover:underline">Ndrysho</button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setStep('camera')}
                  className="p-6 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50 rounded-xl text-left transition-colors"
                >
                  <Camera className="w-8 h-8 text-teal-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-900">Skano me kamere</p>
                  <p className="text-xs text-slate-500 mt-0.5">Fotografo dokumentin me telefon</p>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50 rounded-xl text-left transition-colors"
                >
                  <Upload className="w-8 h-8 text-teal-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-900">Ngarko skedar</p>
                  <p className="text-xs text-slate-500 mt-0.5">PDF ose foto nga kompjuteri</p>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                }}
              />
            </div>
          )}

          {step === 'camera' && (
            <CameraScanner onCapture={onCameraCapture} onClose={() => setStep('choose')} />
          )}

          {(step === 'uploading' || step === 'analyzing') && (
            <div className="py-16 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-teal-600 animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800">
                {step === 'uploading' ? 'Duke ngarkuar...' : 'Duke analizuar me AI...'}
              </p>
              <p className="text-sm text-slate-500 mt-1">Kjo zakonisht zgjat 5-15 sekonda</p>
            </div>
          )}

          {step === 'review' && extracted && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl border bg-teal-50 border-teal-200">
                <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0 text-teal-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-teal-900">
                    Dokumenti u njoh si: {categories.find(c => c.value === category)?.label || 'Tjeter'}
                  </p>
                  {extracted.notes && (
                    <p className="text-xs mt-1 text-teal-700">{extracted.notes}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full bg-white font-bold ${confidence > 70 ? 'text-emerald-700' : confidence > 40 ? 'text-amber-700' : 'text-red-700'}`}>
                  {confidence}%
                </span>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Dokumenti</p>
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    {fileMime === 'application/pdf' ? (
                      <iframe src={fileUrl} className="w-full h-80" title="Preview" />
                    ) : fileMime.startsWith('image/') ? (
                      <img src={fileUrl} alt="Scan" className="w-full max-h-80 object-contain" />
                    ) : (
                      <div className="h-80 flex items-center justify-center">
                        <FileText className="w-16 h-16 text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Te dhenat e ekstraktuara</p>
                  <div className="space-y-3">
                    {needsVehicleTarget && (
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Lidh me mjet ekzistues</label>
                        <select
                          value={targetEntityId}
                          onChange={(e) => setTargetEntityId(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        >
                          <option value="">-- Zgjidh mjet --</option>
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.license_plate} - {v.brand} {v.model}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {needsTarget && (
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Lidh me shofer</label>
                        <select
                          value={targetEntityId}
                          onChange={(e) => setTargetEntityId(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        >
                          <option value="">-- Zgjidh shoferin --</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.full_name || d.email}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {fields.map((f) => (
                      <div key={f.key}>
                        <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                        <input
                          type={f.type || 'text'}
                          value={String(editMap[f.key] ?? '')}
                          onChange={(e) => setEditMap({ ...editMap, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          {step === 'review' && (
            <button
              onClick={() => { setExtracted(null); setStep(defaultCategory ? 'choose' : 'category'); setError(''); }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              <RefreshCw className="w-4 h-4" /> Rinise
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              Anulo
            </button>
            {step === 'review' && extracted && (
              <button
                onClick={handleSave}
                disabled={saving || (needsTarget && !targetEntityId) || (needsVehicleTarget && !targetEntityId)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Ruaj dhe linko
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildEditMap(ex: Extracted, cat: string, mode: FleetMode): Record<string, string | number | string[]> {
  const m: Record<string, string | number | string[]> = {};
  if (mode === 'vehicle') {
    if (cat === 'zulassung') {
      m.license_plate = ex.vehicle.license_plate;
      m.vin = ex.vehicle.vin;
      m.zb1_number = ex.vehicle.zb1_number;
      m.zb2_number = ex.vehicle.zb2_number;
      m.brand = ex.vehicle.brand;
      m.model = ex.vehicle.model;
      m.first_registration = ex.vehicle.first_registration;
      m.max_weight_kg = ex.vehicle.max_weight_kg;
      m.payload_kg = ex.vehicle.payload_kg;
      m.axles = ex.vehicle.axles;
      m.euro_emission = ex.vehicle.euro_emission;
      m.fuel_type = ex.vehicle.fuel_type;
      m.engine_power_kw = ex.vehicle.engine_power_kw;
      m.color = ex.vehicle.color;
    } else if (['hu_tuv', 'au', 'sp', 'uvv', 'tacho'].includes(cat)) {
      m.inspection_type = cat;
      m.issued_date = ex.inspection.issued_date;
      m.expiry_date = ex.inspection.expiry_date;
      m.provider = ex.inspection.provider;
      m.certificate_number = ex.inspection.certificate_number;
    } else if (['haftpflicht', 'vollkasko', 'teilkasko', 'ladung'].includes(cat)) {
      m.insurance_type = cat;
      m.provider = ex.insurance.provider;
      m.policy_number = ex.insurance.policy_number;
      m.start_date = ex.insurance.start_date;
      m.end_date = ex.insurance.end_date;
      m.premium_amount = ex.insurance.premium_amount;
    } else if (cat === 'kfz_steuer') {
      m.tax_year = ex.tax.tax_year || new Date().getFullYear();
      m.amount = ex.tax.amount;
      m.due_date = ex.tax.due_date;
      m.paid_at = ex.tax.paid_at;
    }
  } else {
    if (cat === 'fuehrerschein') {
      m.license_number = ex.license.license_number;
      m.license_categories = (ex.license.license_categories || []).join(', ');
      m.issued_date = ex.license.issued_date;
      m.issued_country = ex.license.issued_country || 'DE';
      m.issuing_authority = ex.license.issuing_authority;
      m.expiry_date = ex.license.expiry_date;
    } else if (cat === 'g25_medical') {
      m.exam_type = ex.medical.exam_type || 'g25';
      m.exam_date = ex.medical.exam_date;
      m.expiry_date = ex.medical.expiry_date;
      m.doctor = ex.medical.doctor;
    } else {
      m.qualification_type = cat;
      m.number = ex.qualification.number;
      m.issued_date = ex.qualification.issued_date;
      m.expiry_date = ex.qualification.expiry_date;
      m.module_hours = ex.qualification.module_hours;
      m.issuing_authority = ex.qualification.issuing_authority;
    }
  }
  return m;
}

function getDisplayFields(cat: string, mode: FleetMode, _m: Record<string, string | number | string[]>): Array<{ key: string; label: string; type?: string }> {
  if (mode === 'vehicle') {
    if (cat === 'zulassung') {
      return [
        { key: 'license_plate', label: 'Targa (Kennzeichen)' },
        { key: 'vin', label: 'VIN' },
        { key: 'brand', label: 'Marka' },
        { key: 'model', label: 'Modeli' },
        { key: 'first_registration', label: 'Data e pare e regjistrimit', type: 'date' },
        { key: 'max_weight_kg', label: 'Pesha maks. (kg)', type: 'number' },
        { key: 'axles', label: 'Aksjet', type: 'number' },
        { key: 'euro_emission', label: 'Klasa Euro' },
        { key: 'fuel_type', label: 'Karburanti' },
        { key: 'engine_power_kw', label: 'Fuqia (kW)', type: 'number' },
        { key: 'zb1_number', label: 'ZB I Nr.' },
        { key: 'zb2_number', label: 'ZB II Nr.' },
      ];
    }
    if (['hu_tuv', 'au', 'sp', 'uvv', 'tacho'].includes(cat)) {
      return [
        { key: 'issued_date', label: 'Data e leshimit', type: 'date' },
        { key: 'expiry_date', label: 'Data e skadimit', type: 'date' },
        { key: 'provider', label: 'Ofruesi (TUV/DEKRA/...)' },
        { key: 'certificate_number', label: 'Nr. i certifikates' },
      ];
    }
    if (['haftpflicht', 'vollkasko', 'teilkasko', 'ladung'].includes(cat)) {
      return [
        { key: 'provider', label: 'Kompania e sigurimit' },
        { key: 'policy_number', label: 'Nr. i polices' },
        { key: 'start_date', label: 'Fillon me', type: 'date' },
        { key: 'end_date', label: 'Skadon me', type: 'date' },
        { key: 'premium_amount', label: 'Primi vjetor', type: 'number' },
      ];
    }
    if (cat === 'kfz_steuer') {
      return [
        { key: 'tax_year', label: 'Viti', type: 'number' },
        { key: 'amount', label: 'Shuma', type: 'number' },
        { key: 'due_date', label: 'Data e skadimit', type: 'date' },
        { key: 'paid_at', label: 'Data e pageses', type: 'date' },
      ];
    }
  } else {
    if (cat === 'fuehrerschein') {
      return [
        { key: 'license_number', label: 'Nr. i patentes' },
        { key: 'license_categories', label: 'Kategorite (B, BE, C, CE, ...)' },
        { key: 'issued_date', label: 'Data e leshimit', type: 'date' },
        { key: 'issued_country', label: 'Shteti' },
        { key: 'issuing_authority', label: 'Organi leshues' },
        { key: 'expiry_date', label: 'Data e skadimit', type: 'date' },
      ];
    }
    if (cat === 'g25_medical') {
      return [
        { key: 'exam_date', label: 'Data e ekzaminimit', type: 'date' },
        { key: 'expiry_date', label: 'Skadon me', type: 'date' },
        { key: 'doctor', label: 'Mjeku' },
      ];
    }
    return [
      { key: 'number', label: 'Nr. i dokumentit' },
      { key: 'issued_date', label: 'Data e leshimit', type: 'date' },
      { key: 'expiry_date', label: 'Data e skadimit', type: 'date' },
      { key: 'module_hours', label: 'Ore moduli', type: 'number' },
      { key: 'issuing_authority', label: 'Organi leshues' },
    ];
  }
  return [];
}

async function saveVehicleSide(
  m: Record<string, string | number | string[]>,
  cat: string,
  targetId: string,
  companyId: string
): Promise<{ entity_type: string; entity_id: string | null }> {
  if (cat === 'zulassung') {
    let vehicleId = targetId;
    if (vehicleId) {
      await supabase.from('vehicles').update({
        license_plate: String(m.license_plate || ''),
        vin: String(m.vin || ''),
        brand: String(m.brand || ''),
        model: String(m.model || ''),
        first_registration: m.first_registration || null,
        zb1_number: String(m.zb1_number || ''),
        zb2_number: String(m.zb2_number || ''),
        max_weight_kg: Number(m.max_weight_kg || 0),
        axles: Number(m.axles || 0),
        euro_emission: String(m.euro_emission || ''),
        fuel_type: String(m.fuel_type || ''),
        engine_power_kw: Number(m.engine_power_kw || 0),
        updated_at: new Date().toISOString(),
      }).eq('id', vehicleId);
    } else {
      const { data, error } = await supabase.from('vehicles').insert({
        company_id: companyId,
        license_plate: String(m.license_plate || ''),
        vin: String(m.vin || ''),
        brand: String(m.brand || ''),
        model: String(m.model || ''),
        first_registration: m.first_registration || null,
        zb1_number: String(m.zb1_number || ''),
        zb2_number: String(m.zb2_number || ''),
        max_weight_kg: Number(m.max_weight_kg || 0),
        axles: Number(m.axles || 0),
        euro_emission: String(m.euro_emission || ''),
        fuel_type: String(m.fuel_type || ''),
        engine_power_kw: Number(m.engine_power_kw || 0),
        vehicle_type: 'truck',
      }).select('id').maybeSingle();
      if (error) throw error;
      vehicleId = data?.id as string;
    }
    return { entity_type: 'vehicle', entity_id: vehicleId };
  }
  if (['hu_tuv', 'au', 'sp', 'uvv', 'tacho'].includes(cat)) {
    if (!targetId) throw new Error('Ju lutem zgjidhni mjetin');
    if (!m.expiry_date) throw new Error('Data e skadimit eshte e detyrueshme');
    const { data, error } = await supabase.from('vehicle_inspections').insert({
      vehicle_id: targetId,
      company_id: companyId,
      inspection_type: cat,
      issued_date: m.issued_date || null,
      expiry_date: m.expiry_date,
      provider: String(m.provider || ''),
      certificate_number: String(m.certificate_number || ''),
    }).select('id').maybeSingle();
    if (error) throw error;
    return { entity_type: 'vehicle_inspection', entity_id: data?.id as string };
  }
  if (['haftpflicht', 'vollkasko', 'teilkasko', 'ladung'].includes(cat)) {
    if (!targetId) throw new Error('Ju lutem zgjidhni mjetin');
    if (!m.end_date) throw new Error('Data e skadimit eshte e detyrueshme');
    const { data, error } = await supabase.from('vehicle_insurance').insert({
      vehicle_id: targetId,
      company_id: companyId,
      insurance_type: cat,
      provider: String(m.provider || ''),
      policy_number: String(m.policy_number || ''),
      start_date: m.start_date || null,
      end_date: m.end_date,
      premium_amount: Number(m.premium_amount || 0),
    }).select('id').maybeSingle();
    if (error) throw error;
    return { entity_type: 'vehicle_insurance', entity_id: data?.id as string };
  }
  if (cat === 'kfz_steuer') {
    if (!targetId) throw new Error('Ju lutem zgjidhni mjetin');
    if (!m.due_date) throw new Error('Data e skadimit eshte e detyrueshme');
    const { data, error } = await supabase.from('vehicle_taxes').insert({
      vehicle_id: targetId,
      company_id: companyId,
      tax_year: Number(m.tax_year || new Date().getFullYear()),
      amount: Number(m.amount || 0),
      due_date: m.due_date,
      paid_at: m.paid_at || null,
    }).select('id').maybeSingle();
    if (error) throw error;
    return { entity_type: 'vehicle_tax', entity_id: data?.id as string };
  }
  return { entity_type: '', entity_id: null };
}

async function saveDriverSide(
  m: Record<string, string | number | string[]>,
  cat: string,
  targetId: string,
  companyId: string
): Promise<{ entity_type: string; entity_id: string | null }> {
  if (!targetId) throw new Error('Ju lutem zgjidhni shoferin');
  if (cat === 'fuehrerschein') {
    if (!m.expiry_date) throw new Error('Data e skadimit eshte e detyrueshme');
    const cats = typeof m.license_categories === 'string'
      ? m.license_categories.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
      : (m.license_categories as string[] || []);
    const { data, error } = await supabase.from('driver_licenses').insert({
      driver_id: targetId,
      company_id: companyId,
      license_number: String(m.license_number || ''),
      license_categories: cats,
      issued_date: m.issued_date || null,
      issued_country: String(m.issued_country || 'DE'),
      issuing_authority: String(m.issuing_authority || ''),
      expiry_date: m.expiry_date,
    }).select('id').maybeSingle();
    if (error) throw error;
    return { entity_type: 'driver_license', entity_id: data?.id as string };
  }
  if (cat === 'g25_medical') {
    if (!m.expiry_date) throw new Error('Data e skadimit eshte e detyrueshme');
    const { data, error } = await supabase.from('driver_medical').insert({
      driver_id: targetId,
      company_id: companyId,
      exam_type: String(m.exam_type || 'g25'),
      exam_date: m.exam_date || null,
      expiry_date: m.expiry_date,
      doctor: String(m.doctor || ''),
    }).select('id').maybeSingle();
    if (error) throw error;
    return { entity_type: 'driver_medical', entity_id: data?.id as string };
  }
  if (!m.expiry_date) throw new Error('Data e skadimit eshte e detyrueshme');
  const { data, error } = await supabase.from('driver_qualifications').insert({
    driver_id: targetId,
    company_id: companyId,
    qualification_type: cat,
    number: String(m.number || ''),
    issued_date: m.issued_date || null,
    expiry_date: m.expiry_date,
    module_hours: Number(m.module_hours || 0),
    issuing_authority: String(m.issuing_authority || ''),
  }).select('id').maybeSingle();
  if (error) throw error;
  return { entity_type: 'driver_qualification', entity_id: data?.id as string };
}
