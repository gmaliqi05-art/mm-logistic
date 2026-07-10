import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { isAssistantEnabled, setAssistantEnabled, ASSISTANT_ENABLED_EVENT } from './assistantEnabled';

/**
 * ON/OFF control for the MML-Agent robot (the floating VoiceAssistant).
 * - variant="header": compact icon button for the top bar (company + depot).
 * - variant="switch": a settings card with a toggle.
 * Both write the shared localStorage flag and notify the mounted assistant.
 */
export default function AssistantToggle({ variant = 'header' }: { variant?: 'header' | 'switch' }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(isAssistantEnabled);

  useEffect(() => {
    const sync = () => setOn(isAssistantEnabled());
    window.addEventListener(ASSISTANT_ENABLED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ASSISTANT_ENABLED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = () => setAssistantEnabled(!on);
  const label = on ? t('voice.assistantOn') : t('voice.assistantOff');

  if (variant === 'header') {
    return (
      <button
        onClick={toggle}
        title={label}
        aria-label={label}
        aria-pressed={on}
        className={`relative p-2.5 rounded-xl border transition-colors ${
          on
            ? 'bg-teal-50 text-teal-700 border-teal-100 hover:bg-teal-100'
            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
        }`}
      >
        <Bot className="w-5 h-5" />
        <span
          className={`absolute -bottom-1 -right-1 text-[8px] font-bold leading-none px-1 py-0.5 rounded-full border-2 border-white ${
            on ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'
          }`}
        >
          {on ? 'ON' : 'OFF'}
        </span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
        <Bot className="w-5 h-5 text-teal-700" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900">{t('voice.assistantToggleTitle')}</h3>
        <p className="text-xs text-slate-500">{t('voice.assistantToggleDesc')}</p>
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
  );
}
