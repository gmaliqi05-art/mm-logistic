import { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCcw, Check, Loader2, AlertTriangle, Zap, ZapOff, FlipHorizontal, Crop, ScanLine, ScanSearch, FileText, Palette, Droplet, Gauge } from 'lucide-react';
import { canvasToBlob, applyScanFilter, detectPaperSize, estimateTextStats, otsuThreshold, type ScanFilter, type PaperSize } from '../../utils/scanProcessor';
import { loadOpenCV, isOpenCVFailed } from '../../utils/opencvLoader';
import { detectDocumentQuadCV, warpQuadCV, applyCLAHE, adaptiveBinarize, laplacianVariance } from '../../utils/cvDocScanner';

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

type Pt = { x: number; y: number };
type Quad = [Pt, Pt, Pt, Pt];

export default function CameraScanner({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef<number>(0);
  const stableCountRef = useRef<number>(0);
  const lastQuadRef = useRef<Quad | null>(null);
  const fpsTimesRef = useRef<number[]>([]);
  const searchStartRef = useRef<number>(0);
  const lowPowerRef = useRef<boolean>(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [stable, setStable] = useState(false);
  const [usedQuad, setUsedQuad] = useState(false);
  const [searchTimedOut, setSearchTimedOut] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [filter, setFilter] = useState<ScanFilter>('color');
  const [paperInfo, setPaperInfo] = useState<{ size: PaperSize; confidence: number; dimensions: string } | null>(null);
  const [textStats, setTextStats] = useState<{ wordCount: number; isText: boolean } | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const cvReadyRef = useRef(false);
  const cvBusyRef = useRef(false);
  const [blurWarning, setBlurWarning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadOpenCV()
      .then(() => {
        if (cancelled) return;
        cvReadyRef.current = true;
        setCvReady(true);
      })
      .catch(() => {
        cvReadyRef.current = false;
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    startCamera(facing);
    return () => {
      stopCamera();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [facing]);

  useEffect(() => {
    if (!ready || previewUrl || busy) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    if (searchStartRef.current === 0) searchStartRef.current = performance.now();

    const tick = (t: number) => {
      const times = fpsTimesRef.current;
      times.push(t);
      while (times.length > 0 && t - times[0] > 1000) times.shift();
      const fps = times.length;
      if (fps > 0 && fps < 15) {
        lowPowerRef.current = true;
        if (!lowPower) setLowPower(true);
      }

      const interval = lowPowerRef.current ? 500 : 220;
      if (t - lastDetectRef.current > interval) {
        lastDetectRef.current = t;
        runLiveDetection();
      }

      if (!searchTimedOut && !lastQuadRef.current && t - searchStartRef.current > 3000) {
        setSearchTimedOut(true);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [ready, previewUrl, autoCrop, busy, lowPower, searchTimedOut]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function startCamera(mode: 'environment' | 'user') {
    try {
      setError('');
      setReady(false);
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          const name = (playErr as Error)?.name;
          if (name !== 'AbortError') throw playErr;
        }
        setVideoSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : ({} as MediaTrackCapabilities);
      setTorchSupported(!!(caps as unknown as { torch?: boolean }).torch);
      setReady(true);
      searchStartRef.current = 0;
      setSearchTimedOut(false);
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Nuk u qasa dot te kamera';
      setError(`Gabim kamere: ${msg}. Sigurohu qe ke dhene leje per kameren.`);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

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

  async function runLiveDetection() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    if (!detectCanvasRef.current) detectCanvasRef.current = document.createElement('canvas');
    const sample = lowPowerRef.current ? 320 : 640;
    const scale = Math.min(sample / vw, sample / vh);
    const sw = Math.max(80, Math.round(vw * scale));
    const sh = Math.max(80, Math.round(vh * scale));
    const dc = detectCanvasRef.current;
    dc.width = sw;
    dc.height = sh;
    const dctx = dc.getContext('2d', { willReadFrequently: true });
    if (!dctx) return;
    dctx.drawImage(video, 0, 0, sw, sh);

    let quadSmall: Quad | null = null;
    if (cvReadyRef.current && !cvBusyRef.current) {
      cvBusyRef.current = true;
      try {
        quadSmall = await detectDocumentQuadCV(dc);
      } catch {
        quadSmall = null;
      } finally {
        cvBusyRef.current = false;
      }
    }
    if (!quadSmall) {
      quadSmall = detectQuad(dctx, sw, sh);
    }
    if (!quadSmall) {
      stableCountRef.current = 0;
      if (lastQuadRef.current !== null) {
        lastQuadRef.current = null;
        setLiveQuad(null);
      }
      setStable((s) => (s ? false : s));
      return;
    }
    const quad: Quad = quadSmall.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;

    const prev = lastQuadRef.current;
    const moveThreshold = Math.max(vw, vh) * 0.035;
    if (prev && quadDistance(prev, quad) < moveThreshold) {
      stableCountRef.current = Math.min(stableCountRef.current + 1, 5);
    } else {
      stableCountRef.current = 1;
    }
    const shouldUpdate = !prev || quadDistance(prev, quad) > moveThreshold * 0.3;
    if (shouldUpdate) {
      lastQuadRef.current = quad;
      setLiveQuad(quad);
    }
    const nextStable = stableCountRef.current >= 2;
    setStable((s) => (s === nextStable ? s : nextStable));
    if (nextStable) setSearchTimedOut(false);
  }

  function detectQuad(ctx: CanvasRenderingContext2D, w: number, h: number): Quad | null {
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    }
    const total = w * h;
    const threshold = otsuThreshold(gray, total);

    const mask = new Uint8Array(w * h);
    let whiteCount = 0;
    for (let i = 0; i < w * h; i++) {
      if (gray[i] > threshold) {
        mask[i] = 1;
        whiteCount++;
      }
    }
    if (whiteCount < total * 0.06) return null;

    const rows = new Int32Array(h * 2);
    for (let y = 0; y < h; y++) {
      let lo = -1, hi = -1;
      const off = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[off + x]) {
          if (lo < 0) lo = x;
          hi = x;
        }
      }
      rows[y * 2] = lo;
      rows[y * 2 + 1] = hi;
    }

    let topY = -1;
    for (let y = 0; y < h; y++) if (rows[y * 2] >= 0) { topY = y; break; }
    let botY = -1;
    for (let y = h - 1; y >= 0; y--) if (rows[y * 2] >= 0) { botY = y; break; }
    if (topY < 0 || botY < 0 || botY - topY < h * 0.25) return null;

    let tl: Pt | null = null, tr: Pt | null = null, bl: Pt | null = null, br: Pt | null = null;
    let bestTL = Infinity, bestTR = -Infinity, bestBL = Infinity, bestBR = -Infinity;

    for (let y = topY; y <= botY; y++) {
      const lo = rows[y * 2];
      const hi = rows[y * 2 + 1];
      if (lo < 0) continue;
      const sTL = lo + y;
      if (sTL < bestTL) { bestTL = sTL; tl = { x: lo, y }; }
      const sTR = (w - hi) + y;
      if (-sTR > bestTR) { bestTR = -sTR; tr = { x: hi, y }; }
      const sBL = lo + (h - y);
      if (sBL < bestBL) { bestBL = sBL; bl = { x: lo, y }; }
      const sBR = (w - hi) + (h - y);
      if (-sBR > bestBR) { bestBR = -sBR; br = { x: hi, y }; }
    }

    if (!tl || !tr || !bl || !br) return null;

    const minWidth = w * 0.3;
    const minHeight = h * 0.3;
    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
    if (topW < minWidth || botW < minWidth || leftH < minHeight || rightH < minHeight) return null;

    const area = polygonArea([tl, tr, br, bl]);
    if (area < total * 0.1) return null;

    return [tl, tr, br, bl];
  }

  function polygonArea(pts: Pt[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(a) / 2;
  }

  function quadDistance(a: Quad, b: Quad): number {
    let d = 0;
    for (let i = 0; i < 4; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    return d / 4;
  }

  function warpQuadToCanvas(src: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
    const [tl, tr, br, bl] = quad;
    const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
    const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
    const outW = Math.max(200, Math.round(Math.max(wTop, wBot)));
    const outH = Math.max(200, Math.round(Math.max(hLeft, hRight)));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    if (!octx) return src;

    drawTriangle(octx, src, tl, tr, br, { x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH });
    drawTriangle(octx, src, tl, br, bl, { x: 0, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH });

    return out;
  }

  function drawTriangle(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    s1: Pt, s2: Pt, s3: Pt,
    d1: Pt, d2: Pt, d3: Pt
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.lineTo(d3.x, d3.y);
    ctx.closePath();
    ctx.clip();

    const denom = s1.x * (s2.y - s3.y) + s2.x * (s3.y - s1.y) + s3.x * (s1.y - s2.y);
    if (Math.abs(denom) < 1e-6) { ctx.restore(); return; }
    const a = (d1.x * (s2.y - s3.y) + d2.x * (s3.y - s1.y) + d3.x * (s1.y - s2.y)) / denom;
    const b = (d1.x * (s2.x - s3.x) + d2.x * (s3.x - s1.x) + d3.x * (s1.x - s2.x)) / -denom;
    const c = d1.x - a * s1.x - b * s1.y;
    const d = (d1.y * (s2.y - s3.y) + d2.y * (s3.y - s1.y) + d3.y * (s1.y - s2.y)) / denom;
    const e = (d1.y * (s2.x - s3.x) + d2.y * (s3.x - s1.x) + d3.y * (s1.x - s2.x)) / -denom;
    const f = d1.y - d * s1.x - e * s1.y;

    ctx.transform(a, d, b, e, c, f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  function enhanceCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    let minL = 255;
    let maxL = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    const range = Math.max(1, maxL - minL);
    const contrast = 1.25;
    const brightness = 10;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = d[i + c];
        v = ((v - minL) * 255) / range;
        v = (v - 128) * contrast + 128 + brightness;
        d[i + c] = Math.max(0, Math.min(255, v));
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  async function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    setBusy(true);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context i panjohur');
      ctx.drawImage(video, 0, 0, vw, vh);

      let didUseQuad = false;

      if (autoCrop) {
        let quad = liveQuad;
        if (!quad) {
          if (!detectCanvasRef.current) detectCanvasRef.current = document.createElement('canvas');
          const sample = 720;
          const scale = Math.min(sample / vw, sample / vh);
          const sw = Math.round(vw * scale);
          const sh = Math.round(vh * scale);
          const dc = detectCanvasRef.current;
          dc.width = sw;
          dc.height = sh;
          const dctx = dc.getContext('2d', { willReadFrequently: true });
          if (dctx) {
            dctx.drawImage(canvas, 0, 0, sw, sh);
            let q: Quad | null = null;
            if (cvReadyRef.current) {
              try { q = await detectDocumentQuadCV(dc); } catch { q = null; }
            }
            if (!q) q = detectQuad(dctx, sw, sh);
            if (q) quad = q.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
          }
        }

        if (quad) {
          let warped: HTMLCanvasElement | null = null;
          if (cvReadyRef.current) {
            try { warped = await warpQuadCV(canvas, quad); } catch { warped = null; }
          }
          if (!warped) warped = warpQuadToCanvas(canvas, quad);
          canvas.width = warped.width;
          canvas.height = warped.height;
          ctx.drawImage(warped, 0, 0);
          didUseQuad = true;
        }
      }

      setUsedQuad(didUseQuad);

      if (cvReadyRef.current) {
        try { await applyCLAHE(canvas); } catch { enhanceCanvas(ctx, canvas.width, canvas.height); }
      } else {
        enhanceCanvas(ctx, canvas.width, canvas.height);
      }

      if (cvReadyRef.current) {
        try {
          const variance = await laplacianVariance(canvas);
          setBlurWarning(variance < 100);
        } catch {
          setBlurWarning(false);
        }
      }

      const raw = document.createElement('canvas');
      raw.width = canvas.width;
      raw.height = canvas.height;
      raw.getContext('2d')!.drawImage(canvas, 0, 0);
      rawCanvasRef.current = raw;

      const stats = estimateTextStats(canvas);
      setTextStats(stats);

      const aspectRatio = canvas.height / canvas.width;
      const paper = detectPaperSize(aspectRatio);
      setPaperInfo(paper);

      const initialFilter: ScanFilter = stats.isText ? 'bw' : 'color';
      setFilter(initialFilter);
      await renderFilter(initialFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate fotografimit');
    } finally {
      setBusy(false);
    }
  }

  async function renderFilter(mode: ScanFilter) {
    const canvas = canvasRef.current;
    const raw = rawCanvasRef.current;
    if (!canvas || !raw) return;
    canvas.width = raw.width;
    canvas.height = raw.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(raw, 0, 0);
    if (mode === 'bw' && cvReadyRef.current) {
      try { await adaptiveBinarize(canvas); } catch { applyScanFilter(canvas, mode); }
    } else if (mode !== 'color') {
      applyScanFilter(canvas, mode);
    }
    const blob = await canvasToBlob(canvas, 0.92);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function chooseFilter(mode: ScanFilter) {
    if (mode === filter) return;
    setFilter(mode);
    await renderFilter(mode);
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setCapturedBlob(null);
    setUsedQuad(false);
    setTextStats(null);
    setPaperInfo(null);
    setBlurWarning(false);
    rawCanvasRef.current = null;
    searchStartRef.current = 0;
    setSearchTimedOut(false);
  }

  function confirm() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopCamera();
    onCapture(file);
  }

  function handleClose() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopCamera();
    onClose();
  }

  const polygonPoints = liveQuad
    ? liveQuad.map((p) => `${p.x},${p.y}`).join(' ')
    : '';
  const overlayColor = stable ? '#10b981' : '#f59e0b';

  const paperLabel = paperInfo && paperInfo.confidence > 0.7 && paperInfo.size !== 'Unknown'
    ? `${paperInfo.size} detected`
    : null;

  const lowQualityWarning = textStats && textStats.isText && textStats.wordCount < 50
    ? 'Cilesia e ulet, riprovo'
    : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-teal-400" />
          <span className="font-semibold text-sm">Skano me kamere</span>
        </div>
        <div className="flex items-center gap-2">
          {!previewUrl && (
            <>
              {lowPower && (
                <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 inline-flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> Low-power
                </span>
              )}
              {cvReady && (
                <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1">
                  <ScanSearch className="w-3 h-3" /> HD
                </span>
              )}
              <button
                onClick={() => setAutoCrop(!autoCrop)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  autoCrop ? 'bg-teal-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title="Detektim inteligjent i dokumentit"
              >
                <ScanSearch className="w-3.5 h-3.5" />
                Auto {autoCrop ? 'ON' : 'OFF'}
              </button>
            </>
          )}
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 z-20">
            <div className="bg-white rounded-xl p-5 max-w-sm text-center shadow-2xl">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-slate-800 font-medium">{error}</p>
              <button onClick={() => startCamera(facing)} className="mt-4 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm">
                Provo perseri
              </button>
            </div>
          </div>
        )}

        {!previewUrl && (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              playsInline
              muted
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setVideoSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
                }
              }}
            />

            {ready && autoCrop && videoSize.w > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${videoSize.w} ${videoSize.h}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {liveQuad && (
                  <>
                    <polygon
                      points={polygonPoints}
                      fill={overlayColor}
                      fillOpacity={stable ? 0.18 : 0.1}
                      stroke={overlayColor}
                      strokeWidth={Math.max(3, videoSize.w / 320)}
                      strokeLinejoin="round"
                    />
                    {liveQuad.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={Math.max(6, videoSize.w / 140)}
                        fill={overlayColor}
                        stroke="#ffffff"
                        strokeWidth={Math.max(2, videoSize.w / 600)}
                      />
                    ))}
                  </>
                )}
              </svg>
            )}

            {ready && !autoCrop && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="relative w-full max-w-3xl aspect-[1/1.414]">
                  <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-teal-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-teal-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-teal-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-teal-400 rounded-br-lg" />
                </div>
              </div>
            )}

            {ready && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium">
                  {autoCrop ? (
                    liveQuad ? (
                      stable ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Dokumenti u detektua — fotografo
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
                    )
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5 text-slate-300" />
                      Vendos dokumentin dhe fotografo
                    </>
                  )}
                </div>
                {autoCrop && searchTimedOut && !liveQuad && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/90 text-white text-xs font-semibold shadow-lg">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Nuk po dallohet dokumenti — fotografo manualisht ose fik Auto
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {previewUrl && (
          <>
            <img src={previewUrl} alt="Captured" className="max-w-full max-h-full object-contain" />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium">
                {usedQuad ? (
                  <>
                    <Crop className="w-3.5 h-3.5 text-emerald-300" />
                    Dokumenti u pre dhe u korrigjua
                  </>
                ) : autoCrop ? (
                  <>
                    <ScanLine className="w-3.5 h-3.5 text-amber-300" />
                    Dokumenti nuk u detektua — fotoja e plote
                  </>
                ) : (
                  <>
                    <ScanLine className="w-3.5 h-3.5 text-slate-300" />
                    Pa auto-prerje
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {paperLabel && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-500/90 text-white inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {paperLabel}
                  </span>
                )}
                {textStats && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/90 text-white inline-flex items-center gap-1">
                    ~{textStats.wordCount} fjale
                  </span>
                )}
                {lowQualityWarning && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/90 text-white inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {lowQualityWarning}
                  </span>
                )}
                {blurWarning && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/90 text-white inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Imazh i turbullt
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="bg-black/90 px-4 py-5">
        {!previewUrl ? (
          <div className="flex items-center justify-between max-w-md mx-auto">
            <button
              onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              title="Nderro kameren"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>

            <button
              onClick={capture}
              disabled={!ready || busy}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                stable && autoCrop
                  ? 'bg-emerald-400 ring-4 ring-emerald-300/50 animate-pulse'
                  : 'bg-white ring-4 ring-white/30 hover:bg-slate-100'
              } disabled:bg-slate-400`}
            >
              {busy ? (
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              ) : (
                <div className={`w-16 h-16 rounded-full ${stable && autoCrop ? 'bg-emerald-600' : 'bg-teal-600'}`} />
              )}
            </button>

            <button
              onClick={toggleTorch}
              disabled={!torchSupported}
              className="p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-full transition-colors"
              title={torchSupported ? 'Ndriçimi' : 'Nuk mbeshtetet'}
            >
              {torchOn ? <Zap className="w-5 h-5 text-amber-300" /> : <ZapOff className="w-5 h-5" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
            <div className="flex items-center gap-2">
              <button
                onClick={() => chooseFilter('color')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  filter === 'color' ? 'bg-teal-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Palette className="w-3.5 h-3.5" /> Color
              </button>
              <button
                onClick={() => chooseFilter('grayscale')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  filter === 'grayscale' ? 'bg-teal-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Droplet className="w-3.5 h-3.5" /> Grayscale
              </button>
              <button
                onClick={() => chooseFilter('bw')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  filter === 'bw' ? 'bg-teal-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> B&W
              </button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={retake}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium inline-flex items-center gap-2 text-sm"
              >
                <RotateCcw className="w-4 h-4" /> Fotografo perseri
              </button>
              <button
                onClick={confirm}
                className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold inline-flex items-center gap-2 text-sm"
              >
                <Check className="w-4 h-4" /> Perdor kete foto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
