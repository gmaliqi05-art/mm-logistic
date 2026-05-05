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
  ZapOff,
  Sun,
  Moon,
  FileText,
  Check,
  AlertTriangle,
  ScanSearch,
  Sparkles,
  Move,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import {
  applyScanFilter,
  canvasToBlob,
  detectPaperSize,
  type ScanFilter,
  type PaperSize,
} from '../../utils/scanProcessor';
import { loadOpenCV } from '../../utils/opencvLoader';
import {
  detectDocumentQuadCV,
  warpQuadCV,
  applyCLAHE,
  adaptiveBinarize,
  laplacianVariance,
  type Quad,
  type Pt,
} from '../../utils/cvDocScanner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type ScannerState = 'camera' | 'adjust' | 'captured' | 'uploading' | 'done';

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
  const fullCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warpedRawRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const detectionTimerRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const liveQuadRef = useRef<Quad | null>(null);
  const stableCountRef = useRef(0);
  const overlayRef = useRef<SVGSVGElement>(null);
  const adjustCanvasRef = useRef<HTMLCanvasElement>(null);
  const adjustContainerRef = useRef<HTMLDivElement>(null);
  const draggingIdxRef = useRef<number | null>(null);

  const [state, setState] = useState<ScannerState>('camera');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ScanFilter>('color');
  const [detectedSize, setDetectedSize] = useState<PaperSize>('Unknown');
  const [detectedDimensions, setDetectedDimensions] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [cvReady, setCvReady] = useState(false);
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [blurWarning, setBlurWarning] = useState(false);
  const [adjustQuad, setAdjustQuad] = useState<Quad | null>(null);
  const [adjustImgSize, setAdjustImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [magnifier, setMagnifier] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadOpenCV().then(() => { if (!cancelled) setCvReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          if (videoRef.current) {
            setVideoSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
          }
          setCameraReady(true);
        };
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : ({} as MediaTrackCapabilities);
      setTorchSupported(!!(caps as unknown as { torch?: boolean }).torch);
    } catch {
      setCameraError(t('scanner.cameraPermissionDenied'));
    }
  }, [t]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (detectionTimerRef.current) {
      clearInterval(detectionTimerRef.current);
      detectionTimerRef.current = null;
    }
    setCameraReady(false);
    liveQuadRef.current = null;
    stableCountRef.current = 0;
    setLiveQuad(null);
    setIsStable(false);
    setTorchOn(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!cameraReady || state !== 'camera') return;

    const tick = async () => {
      if (detectingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      detectingRef.current = true;
      try {
        const sample = 640;
        const scale = Math.min(sample / vw, sample / vh);
        const sw = Math.max(160, Math.round(vw * scale));
        const sh = Math.max(160, Math.round(vh * scale));
        const tmp = document.createElement('canvas');
        tmp.width = sw;
        tmp.height = sh;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, sw, sh);

        let quadSmall: Quad | null = null;
        if (cvReady) {
          quadSmall = await detectDocumentQuadCV(tmp);
        }

        if (!quadSmall) {
          liveQuadRef.current = null;
          stableCountRef.current = 0;
          setLiveQuad(null);
          setIsStable(false);
          return;
        }

        const quad: Quad = quadSmall.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
        const prev = liveQuadRef.current;
        const moveThreshold = Math.max(vw, vh) * 0.025;
        if (prev) {
          let d = 0;
          for (let i = 0; i < 4; i++) d += Math.hypot(prev[i].x - quad[i].x, prev[i].y - quad[i].y);
          d /= 4;
          if (d < moveThreshold) {
            stableCountRef.current = Math.min(stableCountRef.current + 1, 10);
          } else {
            stableCountRef.current = 1;
          }
        } else {
          stableCountRef.current = 1;
        }

        liveQuadRef.current = quad;
        setLiveQuad(quad);
        setIsStable(stableCountRef.current >= 3);

        const aspect = (Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y)) /
          Math.max(1, Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y));
        const paper = detectPaperSize(aspect);
        setDetectedSize(paper.size);
        setDetectedDimensions(paper.dimensions);
      } finally {
        detectingRef.current = false;
      }
    };

    detectionTimerRef.current = window.setInterval(tick, 280);
    return () => {
      if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    };
  }, [cameraReady, state, cvReady]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  const handleCapture = useCallback(async () => {
    if (!videoRef.current) return;
    setProcessing(true);
    const video = videoRef.current;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const full = document.createElement('canvas');
    full.width = vw;
    full.height = vh;
    full.getContext('2d')!.drawImage(video, 0, 0, vw, vh);
    fullCaptureCanvasRef.current = full;

    let quad: Quad | null = liveQuadRef.current;
    if (cvReady) {
      try {
        const fullRes = await detectDocumentQuadCV(full);
        if (fullRes) quad = fullRes;
      } catch { /* keep live quad */ }
    }

    if (!quad) {
      const margin = 0.05;
      quad = [
        { x: vw * margin, y: vh * margin },
        { x: vw * (1 - margin), y: vh * margin },
        { x: vw * (1 - margin), y: vh * (1 - margin) },
        { x: vw * margin, y: vh * (1 - margin) },
      ];
    }

    stopCamera();
    setAdjustQuad(quad);
    setAdjustImgSize({ w: vw, h: vh });
    setState('adjust');
    setProcessing(false);
  }, [cvReady, stopCamera]);

  useEffect(() => {
    if (state !== 'adjust') return;
    const canvas = adjustCanvasRef.current;
    const full = fullCaptureCanvasRef.current;
    if (!canvas || !full) return;
    canvas.width = full.width;
    canvas.height = full.height;
    canvas.getContext('2d')!.drawImage(full, 0, 0);
  }, [state]);

  const confirmQuadAndProcess = useCallback(async () => {
    const full = fullCaptureCanvasRef.current;
    const quad = adjustQuad;
    if (!full || !quad) return;
    setProcessing(true);
    try {
      let warped: HTMLCanvasElement;
      if (cvReady) {
        warped = await warpQuadCV(full, quad);
      } else {
        warped = full;
      }

      if (cvReady) {
        try { await applyCLAHE(warped); } catch { /* ignore */ }
      }

      warpedRawRef.current = warped;

      const aspect = warped.height / warped.width;
      const paper = detectPaperSize(aspect);
      setDetectedSize(paper.size);
      setDetectedDimensions(paper.dimensions);

      if (cvReady) {
        try {
          const variance = await laplacianVariance(warped);
          setBlurWarning(variance < 90);
        } catch {
          setBlurWarning(false);
        }
      }

      if (previewRef.current) {
        previewRef.current.width = warped.width;
        previewRef.current.height = warped.height;
        previewRef.current.getContext('2d')!.drawImage(warped, 0, 0);
      }

      setActiveFilter('color');
      setState('captured');
    } finally {
      setProcessing(false);
    }
  }, [adjustQuad, cvReady]);

  const applyFilter = useCallback(async (filter: ScanFilter) => {
    setActiveFilter(filter);
    const raw = warpedRawRef.current;
    const preview = previewRef.current;
    if (!raw || !preview) return;
    preview.width = raw.width;
    preview.height = raw.height;
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(raw, 0, 0);

    if (filter === 'bw' && cvReady) {
      try { await adaptiveBinarize(preview); } catch { applyScanFilter(preview, 'bw'); }
    } else if (filter !== 'color') {
      applyScanFilter(preview, filter);
    }
  }, [cvReady]);

  const handleRetake = useCallback(() => {
    fullCaptureCanvasRef.current = null;
    warpedRawRef.current = null;
    setAdjustQuad(null);
    setBlurWarning(false);
    setState('camera');
    startCamera();
  }, [startCamera]);

  const handleSave = useCallback(async () => {
    if (!previewRef.current || !profile) return;

    setUploading(true);
    setState('uploading');

    try {
      const blob = await canvasToBlob(previewRef.current, 0.95);
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
    const blob = await canvasToBlob(previewRef.current, 0.95);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sizeLabel = detectedSize !== 'Unknown' ? `_${detectedSize}` : '';
    a.download = `scan${sizeLabel}_${Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [detectedSize]);

  function getAdjustScale(): number {
    const container = adjustContainerRef.current;
    if (!container || !adjustImgSize.w) return 1;
    const rect = container.getBoundingClientRect();
    return Math.min(rect.width / adjustImgSize.w, rect.height / adjustImgSize.h);
  }

  function handleCornerPointerDown(idx: number, e: React.PointerEvent) {
    e.preventDefault();
    draggingIdxRef.current = idx;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function handleCornerPointerMove(e: React.PointerEvent) {
    const idx = draggingIdxRef.current;
    if (idx === null || !adjustContainerRef.current || !adjustQuad) return;
    const container = adjustContainerRef.current;
    const rect = container.getBoundingClientRect();
    const scale = getAdjustScale();
    const displayW = adjustImgSize.w * scale;
    const displayH = adjustImgSize.h * scale;
    const offsetX = (rect.width - displayW) / 2;
    const offsetY = (rect.height - displayH) / 2;
    const localX = e.clientX - rect.left - offsetX;
    const localY = e.clientY - rect.top - offsetY;
    const ix = Math.max(0, Math.min(adjustImgSize.w, localX / scale));
    const iy = Math.max(0, Math.min(adjustImgSize.h, localY / scale));
    const next = adjustQuad.slice() as Quad;
    next[idx] = { x: ix, y: iy };
    setAdjustQuad(next);
    setMagnifier({ x: localX + offsetX, y: localY + offsetY, sx: ix, sy: iy });
  }

  function handleCornerPointerUp(e: React.PointerEvent) {
    draggingIdxRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setMagnifier(null);
  }

  async function autoDetectCorners() {
    const full = fullCaptureCanvasRef.current;
    if (!full || !cvReady) return;
    try {
      const q = await detectDocumentQuadCV(full);
      if (q) setAdjustQuad(q);
    } catch { /* ignore */ }
  }

  function resetCorners() {
    if (!adjustImgSize.w) return;
    const m = 0.05;
    setAdjustQuad([
      { x: adjustImgSize.w * m, y: adjustImgSize.h * m },
      { x: adjustImgSize.w * (1 - m), y: adjustImgSize.h * m },
      { x: adjustImgSize.w * (1 - m), y: adjustImgSize.h * (1 - m) },
      { x: adjustImgSize.w * m, y: adjustImgSize.h * (1 - m) },
    ]);
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-3">
          <ScanLine className="w-5 h-5 text-teal-400" />
          <span className="text-white font-semibold text-sm">{t('scanner.title')}</span>
          {cvReady && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> HD
            </span>
          )}
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
                  className="w-full h-full object-contain bg-black"
                />

                {cameraReady && videoSize.w > 0 && (
                  <svg
                    ref={overlayRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${videoSize.w} ${videoSize.h}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {liveQuad ? (
                      <>
                        <polygon
                          points={liveQuad.map((p) => `${p.x},${p.y}`).join(' ')}
                          fill={isStable ? '#10b981' : '#f59e0b'}
                          fillOpacity={isStable ? 0.2 : 0.1}
                          stroke={isStable ? '#10b981' : '#f59e0b'}
                          strokeWidth={Math.max(4, videoSize.w / 260)}
                          strokeLinejoin="round"
                        />
                        {liveQuad.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={Math.max(8, videoSize.w / 110)}
                            fill={isStable ? '#10b981' : '#f59e0b'}
                            stroke="#ffffff"
                            strokeWidth={Math.max(2, videoSize.w / 500)}
                          />
                        ))}
                      </>
                    ) : (
                      <g opacity="0.6">
                        <rect
                          x={videoSize.w * 0.1}
                          y={videoSize.h * 0.1}
                          width={videoSize.w * 0.8}
                          height={videoSize.h * 0.8}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={Math.max(2, videoSize.w / 500)}
                          strokeDasharray={`${videoSize.w / 60} ${videoSize.w / 80}`}
                          rx={videoSize.w / 120}
                        />
                      </g>
                    )}
                  </svg>
                )}

                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto mb-3" />
                      <p className="text-white text-sm">{t('scanner.initializing')}</p>
                    </div>
                  </div>
                )}

                <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs font-medium">
                    {liveQuad ? (
                      isStable ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Dokumenti u detektua
                        </>
                      ) : (
                        <>
                          <ScanLine className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                          Mbaj qendrueshem...
                        </>
                      )
                    ) : (
                      <>
                        <ScanSearch className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                        Duke kerkuar dokumentin...
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-t from-black via-black/95 to-black/80 px-4 pb-8 pt-4">
                {detectedSize !== 'Unknown' && liveQuad && (
                  <div className="flex justify-center mb-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-teal-500/40 bg-teal-500/10">
                      <FileText className="w-4 h-4 text-teal-400" />
                      <span className="text-sm font-medium text-teal-300">{detectedSize}</span>
                      {detectedDimensions && (
                        <span className="text-xs text-gray-400">({detectedDimensions})</span>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-gray-400 text-center text-xs mb-5">{t('scanner.positionDocument')}</p>

                <div className="flex items-center justify-between max-w-md mx-auto">
                  <button
                    onClick={toggleTorch}
                    disabled={!torchSupported}
                    className="p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-full transition-colors"
                    title="Ndriçim"
                  >
                    {torchOn ? <Zap className="w-5 h-5 text-amber-300" /> : <ZapOff className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={handleCapture}
                    disabled={!cameraReady || processing}
                    className={`relative w-20 h-20 rounded-full flex items-center justify-center disabled:opacity-40 transition-all active:scale-95 ${
                      isStable
                        ? 'bg-emerald-400 ring-4 ring-emerald-300/50 animate-pulse'
                        : 'bg-white/10 border-4 border-white hover:bg-white/20'
                    }`}
                  >
                    {processing ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isStable ? 'bg-emerald-600' : 'bg-white'}`}>
                        <Camera className={`w-7 h-7 ${isStable ? 'text-white' : 'text-gray-800'}`} />
                      </div>
                    )}
                  </button>

                  <div className="w-12" />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {state === 'adjust' && adjustQuad && (
        <>
          <div
            ref={adjustContainerRef}
            className="flex-1 relative overflow-hidden flex items-center justify-center mt-14 select-none"
            onPointerMove={handleCornerPointerMove}
            onPointerUp={handleCornerPointerUp}
            onPointerCancel={handleCornerPointerUp}
          >
            <canvas ref={adjustCanvasRef} className="max-w-full max-h-full object-contain" />
            {adjustImgSize.w > 0 && (
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox={`0 0 ${adjustImgSize.w} ${adjustImgSize.h}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ touchAction: 'none' }}
              >
                <polygon
                  points={adjustQuad.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="#10b981"
                  fillOpacity={0.15}
                  stroke="#10b981"
                  strokeWidth={Math.max(4, adjustImgSize.w / 260)}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
                {adjustQuad.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(18, adjustImgSize.w / 50)}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth={Math.max(3, adjustImgSize.w / 400)}
                    style={{ cursor: 'grab', touchAction: 'none' }}
                    onPointerDown={(e) => handleCornerPointerDown(i, e)}
                  />
                ))}
              </svg>
            )}

            {magnifier && fullCaptureCanvasRef.current && (
              <div
                className="absolute w-32 h-32 rounded-full overflow-hidden border-4 border-emerald-400 shadow-2xl pointer-events-none bg-black"
                style={{
                  top: Math.max(16, magnifier.y - 180),
                  left: Math.min(
                    (adjustContainerRef.current?.getBoundingClientRect().width || 0) - 140,
                    Math.max(16, magnifier.x - 64),
                  ),
                }}
              >
                <canvas
                  ref={(el) => {
                    if (!el || !fullCaptureCanvasRef.current) return;
                    el.width = 128;
                    el.height = 128;
                    const zoom = 3;
                    const src = fullCaptureCanvasRef.current;
                    const sx = Math.max(0, Math.min(src.width - 128 / zoom, magnifier.sx - 64 / zoom));
                    const sy = Math.max(0, Math.min(src.height - 128 / zoom, magnifier.sy - 64 / zoom));
                    const ctx = el.getContext('2d');
                    if (ctx) {
                      ctx.imageSmoothingEnabled = false;
                      ctx.drawImage(src, sx, sy, 128 / zoom, 128 / zoom, 0, 0, 128, 128);
                      ctx.strokeStyle = '#10b981';
                      ctx.lineWidth = 2;
                      ctx.beginPath();
                      ctx.moveTo(64, 48); ctx.lineTo(64, 80);
                      ctx.moveTo(48, 64); ctx.lineTo(80, 64);
                      ctx.stroke();
                    }
                  }}
                  width={128}
                  height={128}
                  className="w-full h-full"
                />
              </div>
            )}
          </div>

          <div className="bg-black px-4 pb-8 pt-4 space-y-3">
            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <Move className="w-3.5 h-3.5" />
              Terhiq qoshet per te rregulluar dokumentin
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={autoDetectCorners}
                disabled={!cvReady || processing}
                className="px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors inline-flex items-center gap-2 disabled:opacity-40"
              >
                <ScanSearch className="w-4 h-4" />
                Auto-detekto
              </button>
              <button
                onClick={resetCorners}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRetake}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4" />
                {t('scanner.retake')}
              </button>
              <button
                onClick={confirmQuadAndProcess}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors disabled:opacity-40"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Vazhdo
              </button>
            </div>
          </div>
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

          <div className="bg-black px-4 pb-8 pt-4 space-y-3">
            <div className="flex flex-wrap justify-center gap-2">
              {detectedSize !== 'Unknown' && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-teal-500/40 bg-teal-500/10">
                  <FileText className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-xs font-medium text-teal-300">
                    {t('scanner.detectedSize')}: {detectedSize}
                  </span>
                  {detectedDimensions && (
                    <span className="text-[11px] text-gray-400">({detectedDimensions})</span>
                  )}
                </div>
              )}
              {blurWarning && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-medium text-red-300">Imazh i turbullt</span>
                </div>
              )}
            </div>

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

            <div className="flex items-center gap-3 pt-1">
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
