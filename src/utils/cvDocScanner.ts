import { loadOpenCV } from './opencvLoader';

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt];

function orderQuad(pts: Pt[]): Quad {
  const sorted = pts.slice().sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bot[1], bot[0]];
}

export async function detectDocumentQuadCV(source: HTMLCanvasElement | ImageData): Promise<Quad | null> {
  const cv = await loadOpenCV();
  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let edges: any = null;
  let dilated: any = null;
  let hierarchy: any = null;
  let contours: any = null;
  try {
    if (source instanceof HTMLCanvasElement) {
      src = cv.imread(source);
    } else {
      src = cv.matFromImageData(source);
    }

    const srcW = src.cols;
    const srcH = src.rows;

    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150, 3, false);

    dilated = new cv.Mat();
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, dilated, kernel);
    kernel.delete();

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = srcW * srcH;
    let best: Quad | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c, false);
      if (area < imgArea * 0.1) { c.delete(); continue; }

      const peri = cv.arcLength(c, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * peri, true);

      if (approx.rows === 4) {
        const pts: Pt[] = [];
        for (let k = 0; k < 4; k++) {
          pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        }
        if (isConvex(pts) && area > bestArea) {
          bestArea = area;
          best = orderQuad(pts);
        }
      }
      approx.delete();
      c.delete();
    }

    return best;
  } finally {
    src?.delete();
    gray?.delete();
    blurred?.delete();
    edges?.delete();
    dilated?.delete();
    hierarchy?.delete();
    contours?.delete();
  }
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

export async function warpQuadCV(srcCanvas: HTMLCanvasElement, quad: Quad): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCV();
  const [tl, tr, br, bl] = quad;
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const outW = Math.max(400, Math.round(Math.max(wTop, wBot)));
  const outH = Math.max(400, Math.round(Math.max(hLeft, hRight)));

  const src = cv.imread(srcCanvas);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

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
  const lab = new cv.Mat();
  cv.cvtColor(src, lab, cv.COLOR_RGBA2RGB);
  cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab);
  const channels = new cv.MatVector();
  cv.split(lab, channels);
  const L = channels.get(0);
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
  clahe.apply(L, L);
  channels.set(0, L);
  cv.merge(channels, lab);
  cv.cvtColor(lab, lab, cv.COLOR_Lab2RGB);
  cv.cvtColor(lab, src, cv.COLOR_RGB2RGBA);
  cv.imshow(canvas, src);
  src.delete(); lab.delete(); channels.delete(); L.delete(); clahe.delete();
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
