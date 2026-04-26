import { useState, useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';
const INSTALLED_KEY = 'pwa-installed';

export default function InstallPromptBanner() {
  const [show, setShow] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) || localStorage.getItem(INSTALLED_KEY)) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };

    const installedHandler = () => {
      localStorage.setItem(INSTALLED_KEY, 'true');
      setShow(false);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, 'true');
    }
    deferredPrompt.current = null;
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[9999] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2.5 bg-teal-50 rounded-xl">
            <Download className="h-5 w-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">
              Instalo Aplikacionin
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Shto MM Logistic ne ekranin kryesor per qasje te shpejte dhe eksperience me te mire.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                Instalo
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                Jo tani
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
