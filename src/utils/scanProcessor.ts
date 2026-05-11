export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Receipt' | 'Unknown';
export type ScanFilter = 'color' | 'bw' | 'grayscale';

interface PaperSizeInfo {
  name: PaperSize;
  widthMm: number;
  heightMm: number;
  ratio: number;
}

const PAPER_SIZES: PaperSizeInfo[] = [
  { name: 'Receipt', widthMm: 80, heightMm: 200, ratio: 200 / 80 },
  { name: 'A5', widthMm: 148, heightMm: 210, ratio: 210 / 148 },
  { name: 'A4', widthMm: 210, heightMm: 297, ratio: 297 / 210 },
  { name: 'A3', widthMm: 297, heightMm: 420, ratio: 420 / 297 },
  { name: 'Letter', widthMm: 216, heightMm: 279, ratio: 279 / 216 },
  { name: 'Legal', widthMm: 216, heightMm: 356, ratio: 356 / 216 },
];

export function detectPaperSize(aspectRatio: number): { size: PaperSize; confidence: number; dimensions: string } {
  const ratio = aspectRatio > 1 ? aspectRatio : 1 / aspectRatio;

  let bestMatch: PaperSizeInfo = PAPER_SIZES[2];
  let bestDiff = Infinity;

  for (const paper of PAPER_SIZES) {
    const diff = Math.abs(ratio - paper.ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = paper;
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - bestDiff / 0.25));

  if (confidence < 0.3) {
    return { size: 'Unknown', confidence, dimensions: '' };
  }

  return {
    size: bestMatch.name,
    confidence,
    dimensions: `${bestMatch.widthMm} x ${bestMatch.heightMm} mm`,
  };
}

export function applyScanFilter(canvas: HTMLCanvasElement, mode: ScanFilter): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  if (mode === 'bw') {
    const gray = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    let windowSize = Math.max(15, Math.round(Math.min(width, height) / 40));
    if (windowSize % 2 === 0) windowSize += 1;
    const binarized = sauvolaBinarize(gray, width, height, windowSize, 0.2, 128);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const v = binarized[j] === 1 ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  } else if (mode === 'grayscale') {
    let minL = 255;
    let maxL = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    const range = Math.max(1, maxL - minL);
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const stretched = Math.min(255, Math.max(0, ((g - minL) * 255) / range));
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
  } else {
    const factor = 1.1;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export interface DocumentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
  paperSize: PaperSize;
  confidence: number;
  dimensions: string;
}

export function otsuThreshold(gray: Uint8Array | Uint8ClampedArray, total: number): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
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
  return threshold;
}

export function sauvolaBinarize(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  windowSize = 24,
  k = 0.2,
  R = 128,
): Uint8Array {
  const n = width * height;
  const integral = new Float64Array(n);
  const integralSq = new Float64Array(n);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const v = gray[idx];
      rowSum += v;
      rowSumSq += v * v;
      if (y === 0) {
        integral[idx] = rowSum;
        integralSq[idx] = rowSumSq;
      } else {
        integral[idx] = integral[idx - width] + rowSum;
        integralSq[idx] = integralSq[idx - width] + rowSumSq;
      }
    }
  }

  const half = Math.floor(windowSize / 2);
  const out = new Uint8Array(n);

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);

      const A = x1 > 0 && y1 > 0 ? integral[(y1 - 1) * width + (x1 - 1)] : 0;
      const B = y1 > 0 ? integral[(y1 - 1) * width + x2] : 0;
      const C = x1 > 0 ? integral[y * width * 0 + y2 * width + (x1 - 1)] : 0;
      const D = integral[y2 * width + x2];
      const sum = D + A - B - C;

      const Asq = x1 > 0 && y1 > 0 ? integralSq[(y1 - 1) * width + (x1 - 1)] : 0;
      const Bsq = y1 > 0 ? integralSq[(y1 - 1) * width + x2] : 0;
      const Csq = x1 > 0 ? integralSq[y2 * width + (x1 - 1)] : 0;
      const Dsq = integralSq[y2 * width + x2];
      const sumSq = Dsq + Asq - Bsq - Csq;

      const mean = sum / area;
      const variance = Math.max(0, sumSq / area - mean * mean);
      const std = Math.sqrt(variance);
      const t = mean * (1 + k * (std / R - 1));
      out[y * width + x] = gray[y * width + x] > t ? 1 : 0;
    }
  }

  return out;
}

export function detectDocumentEdges(canvas: HTMLCanvasElement): DocumentBounds | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const grayData = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    grayData[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  const threshold = otsuThreshold(grayData, grayData.length);

  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grayData[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const docWidth = maxX - minX;
  const docHeight = maxY - minY;
  const docArea = docWidth * docHeight;
  const imageArea = width * height;

  if (docArea < imageArea * 0.1 || docArea > imageArea * 0.98) {
    return null;
  }

  const aspectRatio = docHeight / docWidth;
  const { size, confidence, dimensions } = detectPaperSize(aspectRatio);

  return {
    x: minX,
    y: minY,
    width: docWidth,
    height: docHeight,
    aspectRatio,
    paperSize: size,
    confidence,
    dimensions,
  };
}

export function estimateTextStats(canvas: HTMLCanvasElement): { wordCount: number; isText: boolean } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { wordCount: 0, isText: false };
  const { width, height } = canvas;
  const scale = Math.min(1, 600 / Math.max(width, height));
  const w = Math.max(40, Math.round(width * scale));
  const h = Math.max(40, Math.round(height * scale));
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  if (!tctx) return { wordCount: 0, isText: false };
  tctx.drawImage(canvas, 0, 0, w, h);
  const data = tctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const bin = sauvolaBinarize(gray, w, h, Math.max(12, Math.round(Math.min(w, h) / 24)), 0.2, 128);

  const rowBlack = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (bin[y * w + x] === 0) c++;
    rowBlack[y] = c;
  }
  const rowThreshold = w * 0.05;
  let lineCount = 0;
  let inLine = false;
  for (let y = 0; y < h; y++) {
    if (rowBlack[y] > rowThreshold) {
      if (!inLine) { lineCount++; inLine = true; }
    } else {
      inLine = false;
    }
  }

  let totalWords = 0;
  for (let y = 0; y < h; y++) {
    if (rowBlack[y] <= rowThreshold) continue;
    let words = 0;
    let inWord = false;
    let gap = 0;
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x] === 0) {
        if (!inWord) { inWord = true; words++; }
        gap = 0;
      } else if (inWord) {
        gap++;
        if (gap > Math.max(3, w / 80)) inWord = false;
      }
    }
    totalWords += words;
  }
  const wordsPerLine = lineCount > 0 ? totalWords / lineCount : 0;
  const estimated = Math.round(lineCount * Math.min(12, wordsPerLine));
  const isText = lineCount >= 5 && wordsPerLine >= 3;
  return { wordCount: estimated, isText };
}

export function captureFrameToCanvas(
  video: HTMLVideoElement,
  targetWidth = 1920
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = targetWidth / video.videoWidth;
  canvas.width = targetWidth;
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert canvas to blob'));
      },
      'image/jpeg',
      quality
    );
  });
}

async function readJpegDimensions(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    const size = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return { width, height };
    }
    i += 2 + size;
  }
  return { width: 595, height: 842 };
}

export async function buildMultiPagePdf(blobs: Blob[]): Promise<Blob> {
  const pages = await Promise.all(
    blobs.map(async (b) => {
      const buf = new Uint8Array(await b.arrayBuffer());
      const { width, height } = await readJpegDimensions(buf);
      return { buf, width, height };
    }),
  );

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let total = 0;
  const push = (u: Uint8Array) => { offsets.push(total); parts.push(u); total += u.length; };
  const pushStr = (s: string) => push(enc.encode(s));

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const objPositions: number[] = [];
  const writeObj = (id: number, body: string, raw?: Uint8Array) => {
    objPositions[id] = total;
    pushStr(`${id} 0 obj\n${body}`);
    if (raw) push(raw);
    pushStr('\nendobj\n');
  };

  const kidsIds: number[] = [];
  const imgIds: number[] = [];
  const contentIds: number[] = [];

  let objId = 3;
  for (let i = 0; i < pages.length; i++) {
    kidsIds.push(objId++);
    imgIds.push(objId++);
    contentIds.push(objId++);
  }

  const catalogId = 1;
  const pagesId = 2;

  writeObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  writeObj(
    pagesId,
    `<< /Type /Pages /Count ${pages.length} /Kids [${kidsIds.map((k) => `${k} 0 R`).join(' ')}] >>`,
  );

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageW = 595;
    const pageH = Math.round((p.height / p.width) * pageW);
    const kidId = kidsIds[i];
    const imgId = imgIds[i];
    const contentId = contentIds[i];

    writeObj(
      kidId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );

    writeObj(
      imgId,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.buf.length} >>\nstream\n`,
    );
    push(p.buf);
    pushStr('\nendstream');
    pushStr('\nendobj\n');
    objPositions[imgId] = objPositions[imgId];

    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im${i} Do\nQ\n`;
    writeObj(
      contentId,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    );
  }

  const xrefPos = total;
  const maxId = Math.max(catalogId, pagesId, ...kidsIds, ...imgIds, ...contentIds);
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) {
    const pos = objPositions[id] ?? 0;
    xref += `${String(pos).padStart(10, '0')} 00000 n \n`;
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}
