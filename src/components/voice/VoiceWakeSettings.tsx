import { useEffect, useState } from 'react';
import { Ear, Mic, Check } from 'lucide-react';
import { useTranslation } from '../../i18n';

const WAKE_KEY = 'mm-assistant-wake';

/**
 * Settings card to enable the "Hej Toni" wake word and grant microphone access.
 * Writes the toggle to localStorage and notifies the running VoiceAssistant via
 * a custom event so it starts/stops the wake listener immediately. Wake listening
 * only works while the app is open in the foreground (a browser limitation).
 */
export default function VoiceWakeSettings() {
  const { t } = useTranslation();
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(WAKE_KEY) === '1'; } catch { return false; }
  });
  const [micOk, setMicOk] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perms = (navigator as any)?.permissions;
    if (perms?.query) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      perms.query({ name: 'microphone' }).then((p: any) => setMicOk(p.state === 'granted')).catch(() => { /* ignore */ });
    }
  }, []);

  function toggle() {
    setOn((v) => {
      const next = !v;
      try { localStorage.setItem(WAKE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      window.dispatchEvent(new Event('mm-wake-changed'));
      return next;
    });
  }

  async function allowMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      setMicOk(true);
    } catch { setMicOk(false); }
  }

  const supported = typeof window !== 'undefined' && (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));
  if (!supported) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center"><Ear className="w-5 h-5 text-teal-700" /></div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{t('voice.wakeSettingsTitle')}</h3>
          <p className="text-xs text-slate-500">{t('voice.wakeSettingsDesc')}</p>
        </div>
        <button
          onClick={toggle}
          role="switch"
          aria-checked={on}
          className={`ml-auto relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${on ? 'bg-teal-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <button
        onClick={() => void allowMic()}
        className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${micOk ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
      >
        {micOk ? <Check className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {micOk ? t('voice.micAllowed') : t('voice.allowMic')}
      </button>
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{t('voice.foregroundNote')}</p>
    </div>
  );
}
