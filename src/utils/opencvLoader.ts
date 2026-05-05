let loadPromise: Promise<any> | null = null;
let failed = false;

const CV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

export function isOpenCVFailed(): boolean {
  return failed;
}

export function loadOpenCV(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve(w.cv);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-opencv="1"]`);

    const onReady = () => {
      const cv = (window as any).cv;
      if (!cv) {
        failed = true;
        reject(new Error('OpenCV not available'));
        return;
      }
      if (cv.Mat) {
        resolve(cv);
        return;
      }
      cv['onRuntimeInitialized'] = () => resolve((window as any).cv);
    };

    if (existing) {
      if ((window as any).cv?.Mat) resolve((window as any).cv);
      else existing.addEventListener('load', onReady, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = CV_URL;
    script.dataset.opencv = '1';
    script.onload = onReady;
    script.onerror = () => {
      failed = true;
      loadPromise = null;
      reject(new Error('Failed to load OpenCV'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
