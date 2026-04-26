import { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCcw, Check, Loader2, AlertTriangle, Zap, ZapOff, FlipHorizontal, Crop, ScanLine, ScanSearch } from 'lucide-react';
import { canvasToBlob } from '../../utils/scanProcessor';

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

type Pt = { x: number; y: number };
type Quad = [Pt, Pt, Pt, Pt];

export default function CameraScanner({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef<number>(0);
  const stableCountRef = useRef<number>(0);
  const lastQuadRef = useRef<Quad | null>(null);

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
    const tick = (t: number) => {
      if (t - lastDetectRef.current > 220) {
        lastDetectRef.current = t;
        runLiveDetection();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [ready, previewUrl, autoCrop, busy]);

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
        await videoRef.current.play();
        setVideoSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : ({} as MediaTrackCapabilities);
      setTorchSupported(!!(caps as unknown as { torch?: boolean }).torch);
      setReady(true);
    } catch (err) {
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

  function runLiveDetection() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    if (!detectCanvasRef.current) detectCanvasRef.current = document.createElement('canvas');
    const sample = 240;
    const scale = Math.min(sample / vw, sample / vh);
    const sw = Math.max(80, Math.round(vw * scale));
    const sh = Math.max(80, Math.round(vh * scale));
    const dc = detectCanvasRef.current;
    dc.width = sw;
    dc.height = sh;
    const dctx = dc.getContext('2d', { willReadFrequently: true });
    if (!dctx) return;
    dctx.drawImage(video, 0, 0, sw, sh);

    const quadSmall = detectQuad(dctx, sw, sh);
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
  }

  function detectQuad(ctx: CanvasRenderingContext2D, w: number, h: number): Quad | null {
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const v = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
      gray[j] = v;
      hist[v]++;
    }
    const total = w * h;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        threshold = i;
      }
    }

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
          const sample = 320;
          const scale = Math.min(sample / vw, sample / vh);
          const sw = Math.round(vw * scale);
          const sh = Math.round(vh * scale);
          const dc = detectCanvasRef.current;
          dc.width = sw;
          dc.height = sh;
          const dctx = dc.getContext('2d', { willReadFrequently: true });
          if (dctx) {
            dctx.drawImage(canvas, 0, 0, sw, sh);
            const q = detectQuad(dctx, sw, sh);
            if (q) quad = q.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
          }
        }

        if (quad) {
          const warped = warpQuadToCanvas(canvas, quad);
          canvas.width = warped.width;
          canvas.height = warped.height;
          ctx.drawImage(warped, 0, 0);
          didUseQuad = true;
        }
      }

      setUsedQuad(didUseQuad);
      enhanceCanvas(ctx, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, 0.92);
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate fotografimit');
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setCapturedBlob(null);
    setUsedQuad(false);
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

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-teal-400" />
          <span className="font-semibold text-sm">Skano me kamere</span>
        </div>
        <div className="flex items-center gap-2">
          {!previewUrl && (
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
              <button onClick={() => startCamera(facing)} className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm">
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
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium">
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
            )}
          </>
        )}

        {previewUrl && (
          <>
            <img src={previewUrl} alt="Captured" className="max-w-full max-h-full object-contain" />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium">
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
          <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
            <button
              onClick={retake}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Fotografo perseri
            </button>
            <button
              onClick={confirm}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold inline-flex items-center gap-2"
            >
              <Check className="w-5 h-5" /> Perdor kete foto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
