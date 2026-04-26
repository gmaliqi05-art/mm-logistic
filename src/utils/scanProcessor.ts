export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Unknown';
export type ScanFilter = 'color' | 'bw' | 'grayscale';

interface PaperSizeInfo {
  name: PaperSize;
  widthMm: number;
  heightMm: number;
  ratio: number;
}

const PAPER_SIZES: PaperSizeInfo[] = [
  { name: 'A5', widthMm: 148, heightMm: 210, ratio: 210 / 148 },
  { name: 'A4', widthMm: 210, heightMm: 297, ratio: 297 / 210 },
  { name: 'A3', widthMm: 297, heightMm: 420, ratio: 420 / 297 },
  { name: 'Letter', widthMm: 216, heightMm: 279, ratio: 279 / 216 },
  { name: 'Legal', widthMm: 216, heightMm: 356, ratio: 356 / 216 },
];

export function detectPaperSize(aspectRatio: number): { size: PaperSize; confidence: number; dimensions: string } {
  const ratio = aspectRatio > 1 ? aspectRatio : 1 / aspectRatio;

  let bestMatch: PaperSizeInfo = PAPER_SIZES[1];
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

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (mode === 'bw') {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const adjusted = gray > 140 ? 255 : gray < 60 ? 0 : Math.round((gray - 60) * (255 / 80));
      const bw = adjusted > 128 ? 255 : 0;
      data[i] = bw;
      data[i + 1] = bw;
      data[i + 2] = bw;
    } else if (mode === 'grayscale') {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const enhanced = Math.min(255, Math.max(0, (gray - 60) * 1.6));
      data[i] = enhanced;
      data[i + 1] = enhanced;
      data[i + 2] = enhanced;
    } else {
      const factor = 1.4;
      data[i] = Math.min(255, Math.max(0, (r - 128) * factor + 128));
      data[i + 1] = Math.min(255, Math.max(0, (g - 128) * factor + 128));
      data[i + 2] = Math.min(255, Math.max(0, (b - 128) * factor + 128));
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

  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grayData.length; i++) {
    histogram[grayData[i]]++;
  }

  const total = grayData.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

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
