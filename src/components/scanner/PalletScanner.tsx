import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Keyboard, Zap, ZapOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (code: string, format: string) => void;
  context: 'receiving' | 'sorting' | 'stock' | 'delivery' | 'pallet' | 'general';
  continuous?: boolean;
  title?: string;
}

const SCANNER_ID = 'pallet-scanner-region';

export default function PalletScanner({ open, onClose, onScan, context, continuous = false, title }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const scannerTitle = title ?? t('common.scanPalletCode');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const lastScanAt = useRef<number>(0);

  const logScan = async (code: string, format: string) => {
    if (!profile?.company_id || !profile?.id) return;
    try {
      await supabase.from('scan_events').insert({
        company_id: profile.company_id,
        user_id: profile.id,
        scanned_code: code,
        format,
        context,
      });
    } catch (err) {
      logger.warn('scan_events insert failed', { error: err });
    }
  };

  useEffect(() => {
    if (!open || manual) return;
    let cancelled = false;

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 180 } },
          (decoded, result) => {
            const now = Date.now();
            if (decoded === lastScanned && now - lastScanAt.current < 1500) return;
            lastScanAt.current = now;
            setLastScanned(decoded);
            const fmt = (result?.result?.format?.formatName as string | undefined) ?? 'QR_CODE';
            void logScan(decoded, fmt);
            onScan(decoded, fmt);
            if (!continuous) {
              void stop();
              onClose();
            }
          },
          () => {}
        );
        if (cancelled) await stop();
      } catch (err) {
        logger.error('scanner start failed', { error: err });
        const msg = err instanceof Error ? err.message : 'Camera not available';
        setError(msg);
        setManual(true);
      }
    };

    const stop = async () => {
      try {
        if (scannerRef.current) {
          const s = scannerRef.current;
          if (s.isScanning) await s.stop();
          await s.clear();
          scannerRef.current = null;
        }
      } catch (err) {
        logger.warn('scanner stop failed', { error: err });
      }
    };

    void start();
    return () => {
      cancelled = true;
      void stop();
    };
  }, [open, manual, continuous, onClose, onScan, context, lastScanned, profile?.company_id, profile?.id]);

  const toggleTorch = async () => {
    try {
      const s = scannerRef.current;
      if (!s || !s.isScanning) return;
      await s.applyVideoConstraints({ advanced: [{ torch: !torchOn }] as unknown as MediaTrackConstraintSet[] });
      setTorchOn(!torchOn);
    } catch {
      // torch unsupported
    }
  };

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    void logScan(code, 'MANUAL');
    onScan(code, 'MANUAL');
    setManualCode('');
    if (!continuous) onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">{scannerTitle}</h2>
              <p className="text-xs text-slate-500">{continuous ? 'Continuous mode' : 'Single scan'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!manual ? (
            <>
              <div id={SCANNER_ID} className="w-full rounded-lg overflow-hidden bg-black" style={{ minHeight: 240 }} />
              {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
              )}
              {lastScanned && continuous && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 font-mono">
                  Last: {lastScanned}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={toggleTorch} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
                  {torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  Torch
                </button>
                <button onClick={() => setManual(true)} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
                  <Keyboard className="w-4 h-4" />
                  Manual entry
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('common.enterCode')}</label>
              <input
                autoFocus
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
                placeholder={t('common.epalSsccProductCode')}
                className="w-full px-3 py-3 border border-slate-300 rounded-lg font-mono text-sm"
              />
              <div className="flex gap-2">
                <button onClick={() => { setManual(false); setError(null); }} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
                  Back to camera
                </button>
                <button onClick={submitManual} disabled={!manualCode.trim()} className="flex-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                  Submit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
