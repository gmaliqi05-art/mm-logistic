import { useEffect, useState } from 'react';
import { BookUser, Contact as IdCard, Home, Stamp, Plus, Trash2, ScanLine, Loader2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import ExpiryBadge from './ExpiryBadge';
import TwoSidedPhotoCapture from './TwoSidedPhotoCapture';

type DocumentType = 'national_id' | 'passport' | 'residence_permit' | 'work_visa';
type ResidencyStatus = 'citizen' | 'permanent_resident' | 'work_visa_holder';

interface IdentityDoc {
  id: string;
  driver_id: string;
  company_id: string;
  document_type: DocumentType;
  residency_status: ResidencyStatus;
  document_number: string;
  issuing_country: string;
  issuing_authority: string;
  issued_date: string | null;
  expiry_date: string | null;
  holder_full_name: string;
  holder_nationality: string;
  visa_category: string;
  visa_work_permit_number: string;
  photo_front_url: string;
  photo_back_url: string;
  notes: string;
}

const DOC_META: Record<DocumentType, { label: string; icon: typeof IdCard; allowSkipBack: boolean; hint: string }> = {
  national_id: { label: 'Karta e Identitetit / ID', icon: IdCard, allowSkipBack: false, hint: 'Skano te dyja anet e kartes se identitetit.' },
  passport: { label: 'Pasaporta', icon: BookUser, allowSkipBack: true, hint: 'Skano faqen me fotografine. Shtimi i faqeve me vize eshte opsional.' },
  residence_permit: { label: 'Leja e Qendrimit', icon: Home, allowSkipBack: false, hint: 'Leja e qendrimit e perhershme ose afatgjate — te dyja anet.' },
  work_visa: { label: 'Viza e Punes', icon: Stamp, allowSkipBack: true, hint: 'Viza e punes (Arbeitsvisum / Work Permit). Shtimi i anes se pasme eshte opsional.' },
};

interface Props {
  driverId: string;
  companyId: string;
  canEdit: boolean;
  residencyStatus: ResidencyStatus;
  onResidencyChange?: (s: ResidencyStatus) => void;
}

export default function DriverIdentityPanel({ driverId, companyId, canEdit, residencyStatus, onResidencyChange }: Props) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<IdentityDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState<DocumentType | null>(null);
  const [capturing, setCapturing] = useState<{ doc: DocumentType; front: string; back: string } | null>(null);

  useEffect(() => {
    fetchDocs();
  }, [driverId]);

  async function fetchDocs() {
    setLoading(true);
    const { data } = await supabase
      .from('driver_identity_documents')
      .select('*')
      .eq('driver_id', driverId)
      .order('expiry_date', { ascending: true });
    setDocs((data as IdentityDoc[]) ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t('common.confirmDeleteDocument') || 'Fshi kete dokument?')) return;
    await supabase.from('driver_identity_documents').delete().eq('id', id);
    fetchDocs();
  }

  async function changeResidency(value: ResidencyStatus) {
    await supabase.from('profiles').update({ residency_status: value }).eq('id', driverId);
    onResidencyChange?.(value);
  }

  const requiredDocs: DocumentType[] = (() => {
    if (residencyStatus === 'work_visa_holder') return ['passport', 'work_visa'];
    if (residencyStatus === 'permanent_resident') return ['passport', 'residence_permit', 'national_id'];
    return ['national_id'];
  })();

  const present = new Set(docs.map((d) => d.document_type));
  const missingRequired = requiredDocs.filter((t) => !present.has(t));

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 p-4">
        <div className="text-xs uppercase tracking-wider text-teal-700 font-semibold">Statusi i rezidences</div>
        <p className="text-sm text-gray-700 mt-1">
          Percakton cilet dokumente identiteti kerkohen. Ndryshimi lejohet vetem nga administratori.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(['citizen', 'permanent_resident', 'work_visa_holder'] as ResidencyStatus[]).map((s) => {
            const label = s === 'citizen' ? 'Shtetas vendas' : s === 'permanent_resident' ? 'Banor i perhershem' : 'Me vize pune';
            const active = residencyStatus === s;
            return (
              <button
                key={s}
                onClick={() => canEdit && changeResidency(s)}
                disabled={!canEdit}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  active ? 'bg-white border-teal-400 ring-2 ring-teal-100 text-teal-900 font-semibold' : 'bg-white/60 border-gray-200 text-gray-700 hover:bg-white'
                } ${!canEdit ? 'opacity-70 cursor-default' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {missingRequired.length > 0 && (
          <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Dokumente te kerkuara qe mungojne:{' '}
            <span className="font-semibold">{missingRequired.map((t) => DOC_META[t].label).join(', ')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-gray-600">Te gjitha dokumentet ruhen me dy anet (ku eshte e nevojshme) per verifikim te plote.</p>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DOC_META) as DocumentType[]).map((t) => {
              const Icon = DOC_META[t].icon;
              return (
                <button
                  key={t}
                  onClick={() => setAddOpen(t)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-teal-600 text-teal-700 text-xs font-semibold hover:bg-teal-50"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <Plus className="w-3 h-3" />
                  {DOC_META[t].label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <IdCard className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-500 mt-2">Asnje dokument identiteti i regjistruar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const meta = DOC_META[d.document_type];
            const Icon = meta.icon;
            return (
              <article key={d.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{meta.label}</span>
                      {d.document_number && (
                        <span className="text-xs font-mono text-gray-500">Nr. {d.document_number}</span>
                      )}
                      <ExpiryBadge date={d.expiry_date ?? undefined} size="sm" />
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                      {d.holder_full_name && <span>{d.holder_full_name}</span>}
                      {d.issuing_country && <span>{d.issuing_country}</span>}
                      {d.issued_date && <span>Leshuar {new Date(d.issued_date).toLocaleDateString('de-DE')}</span>}
                      {d.visa_category && <span>Lloji: {d.visa_category}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <PhotoThumb label="Perpara" path={d.photo_front_url} />
                      <PhotoThumb label="Pas" path={d.photo_back_url} />
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => handleDelete(d.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {addOpen && (
        <IdentityDocForm
          docType={addOpen}
          driverId={driverId}
          companyId={companyId}
          onCapturePhotos={(front, back) => setCapturing({ doc: addOpen, front, back })}
          capturedFront={capturing?.doc === addOpen ? capturing.front : ''}
          capturedBack={capturing?.doc === addOpen ? capturing.back : ''}
          onClose={() => {
            setAddOpen(null);
            setCapturing(null);
          }}
          onSaved={() => {
            setAddOpen(null);
            setCapturing(null);
            fetchDocs();
          }}
        />
      )}

      {capturing && (
        <TwoSidedPhotoCapture
          companyId={companyId}
          label={DOC_META[capturing.doc].label}
          existingFront={capturing.front}
          existingBack={capturing.back}
          allowSkipBack={DOC_META[capturing.doc].allowSkipBack}
          onDone={(front, back) => setCapturing({ doc: capturing.doc, front, back })}
          onClose={() => setCapturing(null)}
        />
      )}
    </div>
  );
}

function PhotoThumb({ label, path }: { label: string; path: string }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    if (!path) return;
    supabase.storage.from('fleet-scans').createSignedUrl(path, 600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  if (!path) {
    return (
      <div className="w-20 h-14 rounded border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
        {label}
      </div>
    );
  }
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="w-20 h-14 rounded border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-600 overflow-hidden hover:ring-2 hover:ring-teal-200"
    >
      {url ? <img src={url} alt={label} className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-300" />}
    </a>
  );
}

interface FormProps {
  docType: DocumentType;
  driverId: string;
  companyId: string;
  capturedFront: string;
  capturedBack: string;
  onCapturePhotos: (front: string, back: string) => void;
  onClose: () => void;
  onSaved: () => void;
}

function IdentityDocForm({ docType, driverId, companyId, capturedFront, capturedBack, onCapturePhotos, onClose, onSaved }: FormProps) {
  const { t } = useTranslation();
  const meta = DOC_META[docType];
  const [number, setNumber] = useState('');
  const [country, setCountry] = useState('');
  const [authority, setAuthority] = useState('');
  const [issued, setIssued] = useState('');
  const [expiry, setExpiry] = useState('');
  const [holder, setHolder] = useState('');
  const [nationality, setNationality] = useState('');
  const [visaCategory, setVisaCategory] = useState('');
  const [visaPermit, setVisaPermit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const { error } = await supabase.from('driver_identity_documents').insert({
        driver_id: driverId,
        company_id: companyId,
        document_type: docType,
        document_number: number,
        issuing_country: country,
        issuing_authority: authority,
        issued_date: issued || null,
        expiry_date: expiry || null,
        holder_full_name: holder,
        holder_nationality: nationality,
        visa_category: docType === 'work_visa' ? visaCategory : '',
        visa_work_permit_number: docType === 'work_visa' ? visaPermit : '',
        photo_front_url: capturedFront,
        photo_back_url: capturedBack,
        notes,
      });
      if (error) throw error;
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ruajtja deshtoi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg my-4">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{t('fleet.driverIdentity.addDocument')}</div>
            <h3 className="font-bold text-gray-900">{meta.label}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 text-sm">Mbyll</button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500">{meta.hint}</p>

          <button
            type="button"
            onClick={() => onCapturePhotos(capturedFront, capturedBack)}
            className="w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-lg border border-dashed border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <ScanLine className="w-4 h-4" /> Skano te dyja anet
            </span>
            <span className="text-xs">
              {capturedFront ? 'Perpara ✓' : 'Perpara'} · {capturedBack ? 'Pas ✓' : meta.allowSkipBack ? 'Pas (opsional)' : 'Pas'}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Numri i dokumentit">
              <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="Shteti i leshimit">
              <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="DE" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="Autoriteti leshues">
              <input value={authority} onChange={(e) => setAuthority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="Shtetesia e mbajtesit">
              <input value={nationality} onChange={(e) => setNationality(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="Data e leshimit">
              <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="Data e skadences">
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="Emri i plote i mbajtesit" span>
              <input value={holder} onChange={(e) => setHolder(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
            {docType === 'work_visa' && (
              <>
                <Field label="Kategoria e vizes">
                  <input value={visaCategory} onChange={(e) => setVisaCategory(e.target.value)} placeholder="p.sh. D, C, Arbeit" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </Field>
                <Field label="Nr. lejes se punes">
                  <input value={visaPermit} onChange={(e) => setVisaPermit(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </Field>
              </>
            )}
            <Field label="Shenime" span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </Field>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium">Anulo</button>
            <button
              onClick={save}
              disabled={saving || !capturedFront}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Duke ruajtur…' : 'Ruaj dokumentin'}
            </button>
          </div>
          {!capturedFront && <p className="text-xs text-gray-500 text-right">Skano te pakten anen e perparme per te ruajtur.</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${span ? 'col-span-2' : ''}`}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
