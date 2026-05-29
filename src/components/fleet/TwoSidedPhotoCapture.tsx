import { useEffect, useState } from 'react';
import { X, Check, ScanLine, Upload, SkipForward } from 'lucide-react';
import CameraScanner from '../accounting/CameraScanner';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

interface Props {
  companyId: string;
  label: string;
  existingFront?: string;
  existingBack?: string;
  allowSkipBack?: boolean;
  onDone: (front: string, back: string) => void;
  onClose: () => void;
}

type Side = 'front' | 'back' | 'done';

export default function TwoSidedPhotoCapture({ companyId, label, existingFront, existingBack, allowSkipBack, onDone, onClose }: Props) {
  const [side, setSide] = useState<Side>(existingFront ? 'back' : 'front');
  const [front, setFront] = useState<string>(existingFront || '');
  const [back, setBack] = useState<string>(existingBack || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showCamera, setShowCamera] = useState(false);

  async function uploadBlob(file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${companyId}/identity/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('fleet-scans').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw upErr;
    return path;
  }

  async function handleCapture(file: File) {
    setShowCamera(false);
    setUploading(true);
    setError('');
    try {
      const path = await uploadBlob(file);
      if (side === 'front') {
        setFront(path);
        setSide('back');
      } else if (side === 'back') {
        setBack(path);
        setSide('done');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ngarkimi deshtoi');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleCapture(file);
    e.target.value = '';
  }

  function skipBack() {
    setSide('done');
  }

  function save() {
    onDone(front, back);
  }

  if (showCamera) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <CameraScanner onCapture={handleCapture} onClose={() => setShowCamera(false)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
            <h3 className="font-bold text-gray-900 text-base">
              {side === 'front' && 'Skano anen e perparme'}
              {side === 'back' && 'Skano anen e pasme'}
              {side === 'done' && 'Gati per ruajtje'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <StepPill active={side === 'front'} done={Boolean(front)} label="Perpara" />
            <div className="flex-1 h-0.5 bg-gray-200">
              <div className={`h-full ${front ? 'bg-teal-500' : 'bg-gray-200'}`} style={{ width: front ? '100%' : '0%' }} />
            </div>
            <StepPill active={side === 'back'} done={Boolean(back)} label="Pas" />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <SideCard label="Perpara" url={front} companyId={companyId} />
            <SideCard label="Pas" url={back} companyId={companyId} skipped={side === 'done' && !back} />
          </div>

          {side !== 'done' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                {side === 'front'
                  ? 'Vendose dokumentin me anen e perparme lart, te dhenat personale te dukshme.'
                  : 'Ktheje dokumentin dhe skano anen e pasme me kategorite/vulat.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowCamera(true)}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                >
                  <ScanLine className="w-4 h-4" /> Hap kamera
                </button>
                <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 cursor-pointer">
                  <Upload className="w-4 h-4" /> Ngarko skedar
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} disabled={uploading} />
                </label>
                {side === 'back' && allowSkipBack && (
                  <button
                    onClick={skipBack}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50"
                  >
                    <SkipForward className="w-4 h-4" /> Kapercej
                  </button>
                )}
              </div>
            </div>
          )}

          {side === 'done' && (
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setSide('front')} className="text-sm text-gray-600 hover:text-gray-900">Rifillo</button>
              <button
                onClick={save}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
              >
                <Check className="w-4 h-4" /> Ruaj
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
      done ? 'bg-teal-50 text-teal-700 border-teal-200' : active ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200'
    }`}>
      {label}{done ? ' ✓' : ''}
    </div>
  );
}

function SideCard({ label, url, companyId: _c, skipped }: { label: string; url: string; companyId: string; skipped?: boolean }) {
  const { t } = useTranslation();
  const [signed, setSigned] = useState<string>('');

  useEffect(() => {
    if (!url) {
      setSigned('');
      return;
    }
    supabase.storage.from('fleet-scans').createSignedUrl(url, 600).then(({ data }) => {
      if (data?.signedUrl) setSigned(data.signedUrl);
    });
  }, [url]);

  return (
    <div className="aspect-[3/2] rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden text-xs text-gray-500">
      {url ? (
        signed ? (
          <img src={signed} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span>{t('common.saved')}</span>
        )
      ) : skipped ? (
        <span>{t('common.skipped')}</span>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
