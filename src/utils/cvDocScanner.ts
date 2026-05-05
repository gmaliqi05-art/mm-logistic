import { loadOpenCV } from './opencvLoader';

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt];

function orderQuad(pts: Pt[]): Quad {
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const withAngle = pts.map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx) }));
  withAngle.sort((a, b) => a.a - b.a);
  const ordered = withAngle.map((w) => w.p);
  let startIdx = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = ordered[i].x + ordered[i].y;
    if (s < best) { best = s; startIdx = i; }
  }
  const out: Pt[] = [];
  for (let i = 0; i < 4; i++) out.push(ordered[(startIdx + i) % 4]);
  return out as Quad;
}

function isConvex(pts: Pt[]): boolean {
  let sign = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

function validQuadShape(pts: Pt[], imgW: number, imgH: number): boolean {
  const sides = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    sides.push(Math.hypot(a.x - b.x, a.y - b.y));
  }
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  if (minSide < Math.min(imgW, imgH) * 0.15) return false;
  if (maxSide / minSide > 6) return false;
  return true;
}

export async function detectDocumentQuadCV(source: HTMLCanvasElement | ImageData): Promise<Quad | null> {
  const cv = await loadOpenCV();
  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let enhanced: any = null;
  let edges: any = null;
  let closed: any = null;
  let hierarchy: any = null;
  let contours: any = null;
  let kernel: any = null;

  try {
    if (source instanceof HTMLCanvasElement) {
      src = cv.imread(source);
    } else {
      src = cv.matFromImageData(source);
    }

    const srcW = src.cols;
    const srcH = src.rows;
    const imgArea = srcW * srcH;

    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const meanScalar = cv.mean(gray);
    const meanLum = meanScalar[0];
    const lowLight = meanLum < 80;

    enhanced = new cv.Mat();
    if (lowLight) {
      const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
      clahe.apply(gray, enhanced);
      clahe.delete();
    } else {
      gray.copyTo(enhanced);
    }

    blurred = new cv.Mat();
    const kSize = lowLight ? 7 : 5;
    cv.GaussianBlur(enhanced, blurred, new cv.Size(kSize, kSize), 0);

    const otsu = new cv.Mat();
    const otsuThresh = cv.threshold(blurred, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    otsu.delete();
    const low = Math.max(10, Math.round(otsuThresh * 0.4));
    const high = Math.max(30, Math.round(otsuThresh));

    edges = new cv.Mat();
    cv.Canny(blurred, edges, low, high, 3, false);

    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    closed = new cv.Mat();
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates: { quad: Quad; area: number }[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c, false);
      if (area < imgArea * 0.08) { c.delete(); continue; }

      const peri = cv.arcLength(c, true);
      for (const eps of [0.015, 0.02, 0.03, 0.04, 0.05]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, eps * peri, true);
        if (approx.rows === 4) {
          const pts: Pt[] = [];
          for (let k = 0; k < 4; k++) {
            pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
          }
          if (isConvex(pts) && validQuadShape(pts, srcW, srcH)) {
            candidates.push({ quad: orderQuad(pts), area });
            approx.delete();
            break;
          }
        }
        approx.delete();
      }

      if (candidates.length === 0) {
        const rect = cv.minAreaRect(c);
        const box = cv.RotatedRect.points(rect);
        const pts: Pt[] = box.map((p: any) => ({ x: p.x, y: p.y }));
        if (validQuadShape(pts, srcW, srcH)) {
          const rectArea = rect.size.width * rect.size.height;
          const overlap = area / Math.max(1, rectArea);
          if (overlap > 0.75 && rectArea > imgArea * 0.1) {
            candidates.push({ quad: orderQuad(pts), area: rectArea });
          }
        }
      }

      c.delete();
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0].quad;
  } catch {
    return null;
  } finally {
    src?.delete();
    gray?.delete();
    blurred?.delete();
    enhanced?.delete();
    edges?.delete();
    closed?.delete();
    hierarchy?.delete();
    contours?.delete();
    kernel?.delete();
  }
}

export async function warpQuadCV(srcCanvas: HTMLCanvasElement, quad: Quad): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCV();
  const [tl, tr, br, bl] = quad;
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const outW = Math.max(600, Math.round(Math.max(wTop, wBot)));
  const outH = Math.max(600, Math.round(Math.max(hLeft, hRight)));

  const src = cv.imread(srcCanvas);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  cv.imshow(out, dst);

  src.delete(); dst.delete(); srcTri.delete(); dstTri.delete(); M.delete();
  return out;
}

export async function applyCLAHE(canvas: HTMLCanvasElement): Promise<void> {
  const cv = await loadOpenCV();
  const src = cv.imread(canvas);
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const lab = new cv.Mat();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
  const channels = new cv.MatVector();
  cv.split(lab, channels);
  const L = channels.get(0);
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
  clahe.apply(L, L);
  channels.set(0, L);
  cv.merge(channels, lab);
  cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
  cv.cvtColor(rgb, src, cv.COLOR_RGB2RGBA);
  cv.imshow(canvas, src);
  src.delete(); rgb.delete(); lab.delete(); channels.delete(); L.delete(); clahe.delete();
}

export async function adaptiveBinarize(canvas: HTMLCanvasElement): Promise<void> {
  const cv = await loadOpenCV();
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const bin = new cv.Mat();
  const blockSize = Math.max(11, Math.floor(Math.min(canvas.width, canvas.height) / 30) | 1);
  const block = blockSize % 2 === 0 ? blockSize + 1 : blockSize;
  cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 10);
  cv.cvtColor(bin, src, cv.COLOR_GRAY2RGBA);
  cv.imshow(canvas, src);
  src.delete(); gray.delete(); bin.delete();
}

export async function laplacianVariance(canvas: HTMLCanvasElement): Promise<number> {
  const cv = await loadOpenCV();
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const lap = new cv.Mat();
  cv.Laplacian(gray, lap, cv.CV_64F, 1, 1, 0, cv.BORDER_DEFAULT);
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(lap, mean, stddev);
  const sd = stddev.data64F[0];
  src.delete(); gray.delete(); lap.delete(); mean.delete(); stddev.delete();
  return sd * sd;
}
