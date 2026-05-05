let loadPromise: Promise<any> | null = null;
let failed = false;
let loading = false;

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.10.0/opencv.js',
  'https://cdn.jsdelivr.net/gh/opencv/opencv.js@4.x/opencv.js',
];

export function isOpenCVFailed(): boolean {
  return failed;
}

export function isOpenCVLoading(): boolean {
  return loading;
}

function tryLoadFrom(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = url;
    script.dataset.opencv = '1';

    let settled = false;
    const finish = (ok: boolean, val: any) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(val);
      else reject(val);
    };

    const timeout = window.setTimeout(() => {
      script.remove();
      finish(false, new Error(`timeout loading ${url}`));
    }, 30000);

    script.onload = () => {
      const w = window as any;
      const cv = w.cv;
      if (!cv) {
        window.clearTimeout(timeout);
        finish(false, new Error('cv not defined'));
        return;
      }
      if (cv.Mat) {
        window.clearTimeout(timeout);
        finish(true, cv);
        return;
      }
      const prev = cv['onRuntimeInitialized'];
      cv['onRuntimeInitialized'] = () => {
        try { prev && prev(); } catch { /* ignore */ }
        window.clearTimeout(timeout);
        finish(true, (window as any).cv);
      };
    };
    script.onerror = () => {
      script.remove();
      window.clearTimeout(timeout);
      finish(false, new Error(`failed to load ${url}`));
    };
    document.head.appendChild(script);
  });
}

export function loadOpenCV(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve(w.cv);
  if (loadPromise) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    let lastErr: Error | null = null;
    for (const url of CDN_URLS) {
      try {
        const cv = await tryLoadFrom(url);
        loading = false;
        return cv;
      } catch (err) {
        lastErr = err as Error;
      }
    }
    loading = false;
    failed = true;
    loadPromise = null;
    throw lastErr || new Error('OpenCV failed to load');
  })();

  return loadPromise;
}
