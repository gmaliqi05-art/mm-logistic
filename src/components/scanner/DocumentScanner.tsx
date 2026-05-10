import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Camera,
  RotateCcw,
  Download,
  Upload,
  Loader2,
  ScanLine,
  Zap,
  Sun,
  Moon,
  FileText,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import {
  captureFrameToCanvas,
  applyScanFilter,
  detectDocumentEdges,
  canvasToBlob,
  type ScanFilter,
  type PaperSize,
  type DocumentBounds,
} from '../../utils/scanProcessor';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type ScannerState = 'camera' | 'captured' | 'uploading' | 'done';

interface DocumentScannerProps {
  onClose: () => void;
  onScanComplete?: (url: string, paperSize: PaperSize, fileName: string) => void;
}

const FILTER_OPTIONS: { key: ScanFilter; icon: typeof Sun }[] = [
  { key: 'color', icon: Sun },
  { key: 'bw', icon: Moon },
  { key: 'grayscale', icon: Zap },
];

export default function DocumentScanner({ onClose, onScanComplete }: DocumentScannerProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);

  const [state, setState] = useState<ScannerState>('camera');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ScanFilter>('color');
  const [detectedBounds, setDetectedBounds] = useState<DocumentBounds | null>(null);
  const [detectedSize, setDetectedSize] = useState<PaperSize>('Unknown');
  const [detectedDimensions, setDetectedDimensions] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch {
      setCameraError(t('scanner.cameraPermissionDenied'));
    }
  }, [t]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!cameraReady || state !== 'camera') return;

    const detect = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 640;
      const scale = 640 / videoRef.current.videoWidth;
      tempCanvas.height = Math.round(videoRef.current.videoHeight * scale);
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);

      const bounds = detectDocumentEdges(tempCanvas);
      setDetectedBounds(bounds);
      if (bounds) {
        setDetectedSize(bounds.paperSize);
        setDetectedDimensions(bounds.dimensions);
        setConfidence(bounds.confidence);
      } else {
        setDetectedSize('Unknown');
        setDetectedDimensions('');
        setConfidence(0);
      }
    };

    detectionIntervalRef.current = window.setInterval(detect, 500);
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [cameraReady, state]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current) return;

    const captured = captureFrameToCanvas(videoRef.current);
    canvasRef.current = captured;

    const original = document.createElement('canvas');
    original.width = captured.width;
    original.height = captured.height;
    original.getContext('2d')!.drawImage(captured, 0, 0);
    originalCanvasRef.current = original;

    stopCamera();
    setState('captured');
    setActiveFilter('color');

    requestAnimationFrame(() => {
      if (previewRef.current && canvasRef.current) {
        const ctx = previewRef.current.getContext('2d');
        if (ctx) {
          previewRef.current.width = canvasRef.current.width;
          previewRef.current.height = canvasRef.current.height;
          ctx.drawImage(canvasRef.current, 0, 0);
        }
      }
    });
  }, [stopCamera]);

  const applyFilter = useCallback((filter: ScanFilter) => {
    setActiveFilter(filter);
    if (!originalCanvasRef.current || !previewRef.current) return;

    const ctx = previewRef.current.getContext('2d');
    if (!ctx) return;
    previewRef.current.width = originalCanvasRef.current.width;
    previewRef.current.height = originalCanvasRef.current.height;
    ctx.drawImage(originalCanvasRef.current, 0, 0);

    if (filter !== 'color') {
      applyScanFilter(previewRef.current, filter);
    }
  }, []);

  const handleRetake = useCallback(() => {
    canvasRef.current = null;
    originalCanvasRef.current = null;
    setState('camera');
    startCamera();
  }, [startCamera]);

  const handleSave = useCallback(async () => {
    if (!previewRef.current || !profile) return;

    setUploading(true);
    setState('uploading');

    try {
      const blob = await canvasToBlob(previewRef.current);
      const timestamp = Date.now();
      const sizeLabel = detectedSize !== 'Unknown' ? `_${detectedSize}` : '';
      const fileName = `scan${sizeLabel}_${timestamp}.jpg`;
      const filePath = `scans/${profile.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      setUploadedUrl(urlData.publicUrl);
      setUploadedFileName(fileName);
      setState('done');

      onScanComplete?.(urlData.publicUrl, detectedSize, fileName);
    } catch {
      setState('captured');
    } finally {
      setUploading(false);
    }
  }, [profile, detectedSize, onScanComplete]);

  const handleDownload = useCallback(async () => {
    if (!previewRef.current) return;
    const blob = await canvasToBlob(previewRef.current);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sizeLabel = detectedSize !== 'Unknown' ? `_${detectedSize}` : '';
    a.download = `scan${sizeLabel}_${Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [detectedSize]);

  const confidenceColor = confidence > 0.7 ? 'text-emerald-400' : confidence > 0.4 ? 'text-amber-400' : 'text-gray-400';
  const confidenceBg = confidence > 0.7 ? 'bg-emerald-500/20 border-emerald-500/40' : confidence > 0.4 ? 'bg-amber-500/20 border-amber-500/40' : 'bg-gray-500/20 border-gray-500/40';

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col modal-fullscreen">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <ScanLine className="w-5 h-5 text-teal-400" />
          <span className="text-white font-semibold text-sm">{t('scanner.title')}</span>
        </div>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {state === 'camera' && (
        <>
          {cameraError ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center">
                <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                <p className="text-white text-lg font-medium mb-2">{t('scanner.cameraError')}</p>
                <p className="text-gray-400 text-sm mb-6">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
                >
                  {t('common.tryAgain')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative" style={{ width: '80%', maxWidth: '400px', aspectRatio: '210/297' }}>
                    <div className="absolute inset-0 border-2 border-white/60 rounded-lg" />
                    <div className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-[3px] border-l-[3px] border-teal-400 rounded-tl-lg" />
                    <div className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-[3px] border-r-[3px] border-teal-400 rounded-tr-lg" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-[3px] border-l-[3px] border-teal-400 rounded-bl-lg" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-[3px] border-r-[3px] border-teal-400 rounded-br-lg" />

                    {detectedBounds && confidence > 0.4 && (
                      <div className="absolute inset-0 border-2 border-teal-400/50 rounded-lg animate-pulse" />
                    )}
                  </div>
                </div>

                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto mb-3" />
                      <p className="text-white text-sm">{t('scanner.initializing')}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-t from-black via-black/95 to-black/80 px-4 pt-4 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))]">
                {detectedSize !== 'Unknown' && confidence > 0.3 && (
                  <div className="flex justify-center mb-4">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${confidenceBg}`}>
                      <FileText className={`w-4 h-4 ${confidenceColor}`} />
                      <span className={`text-sm font-medium ${confidenceColor}`}>
                        {detectedSize}
                      </span>
                      {detectedDimensions && (
                        <span className="text-xs text-gray-400">({detectedDimensions})</span>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-gray-400 text-center text-xs mb-5">{t('scanner.positionDocument')}</p>

                <div className="flex items-center justify-center">
                  <button
                    onClick={handleCapture}
                    disabled={!cameraReady}
                    className="relative w-20 h-20 rounded-full bg-white/10 border-4 border-white flex items-center justify-center disabled:opacity-40 transition-all active:scale-95 hover:bg-white/20"
                  >
                    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
                      <Camera className="w-7 h-7 text-gray-800" />
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {(state === 'captured' || state === 'uploading') && (
        <>
          <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-950 mt-14">
            <canvas
              ref={previewRef}
              className="max-w-full max-h-full object-contain"
            />

            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto mb-3" />
                  <p className="text-white text-sm">{t('scanner.uploading')}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-black px-4 pb-8 pt-4 space-y-4">
            {detectedSize !== 'Unknown' && (
              <div className="flex justify-center">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${confidenceBg}`}>
                  <FileText className={`w-4 h-4 ${confidenceColor}`} />
                  <span className={`text-sm font-medium ${confidenceColor}`}>
                    {t('scanner.detectedSize')}: {detectedSize}
                  </span>
                  {detectedDimensions && (
                    <span className="text-xs text-gray-400">({detectedDimensions})</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-2">
              {FILTER_OPTIONS.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => applyFilter(key)}
                  disabled={uploading}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeFilter === key
                      ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(`scanner.filter.${key}`)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleRetake}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4" />
                {t('scanner.retake')}
              </button>
              <button
                onClick={handleDownload}
                disabled={uploading}
                className="py-3.5 px-4 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors disabled:opacity-40"
              >
                <Upload className="w-4 h-4" />
                {t('scanner.saveUpload')}
              </button>
            </div>
          </div>
        </>
      )}

      {state === 'done' && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-teal-500/20 flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-teal-400" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2">{t('scanner.scanSaved')}</h3>
            <p className="text-gray-400 text-sm mb-2">{uploadedFileName}</p>
            {detectedSize !== 'Unknown' && (
              <p className="text-teal-400 text-sm mb-6">
                {t('scanner.paperSize')}: {detectedSize} {detectedDimensions ? `(${detectedDimensions})` : ''}
              </p>
            )}

            {uploadedUrl && (
              <div className="mb-6 rounded-xl overflow-hidden border border-gray-800">
                <img src={uploadedUrl} alt="Scanned document" className="w-full max-h-48 object-contain bg-gray-900" />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleRetake}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                {t('scanner.scanAnother')}
              </button>
              <button
                onClick={() => { stopCamera(); onClose(); }}
                className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
