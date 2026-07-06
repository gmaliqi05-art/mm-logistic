import { useRef, useState } from 'react';
import { Mic, X, Loader2, Volume2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { interpretStockQuestion, type VoiceStockRow } from '../../utils/voiceStockQuery';

/* Minimal typing for the browser Speech API (not in the standard lib types). */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const LANG_MAP: Record<string, string> = { sq: 'sq-AL', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Voice assistant (v1): push-to-talk. The browser does speech-to-text; the
 * transcript is answered against a live stock snapshot via the pure
 * `interpretStockQuestion`, then spoken back with the browser's speech
 * synthesis. Only reads stock — no free-form queries, no external services.
 */
export default function VoiceAssistant() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'answered'>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const supported = getRecognitionCtor() !== null && typeof window.speechSynthesis !== 'undefined';
  const bcp47 = LANG_MAP[language] ?? 'en-US';

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcp47;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech synthesis unavailable — the on-screen text is the fallback */
    }
  }

  async function answerQuestion(text: string) {
    setState('thinking');
    const companyId = profile?.company_id;
    if (!companyId) return;
    const { data } = await supabase
      .from('stock')
      .select('quantity, condition, depots(name), category_products(name), product_categories(name)')
      .eq('company_id', companyId)
      .gt('quantity', 0);
    const rows: VoiceStockRow[] = ((data ?? []) as Array<{
      quantity: number; condition: string;
      depots: { name?: string } | null;
      category_products: { name?: string } | null;
      product_categories: { name?: string } | null;
    }>).map((r) => ({
      depotName: r.depots?.name ?? '—',
      productName: r.category_products?.name ?? (r.product_categories?.name ?? '—'),
      categoryName: r.product_categories?.name ?? undefined,
      condition: r.condition,
      quantity: r.quantity ?? 0,
    }));

    const result = interpretStockQuestion(text, rows);
    let msg: string;
    if (result.kind === 'product_total') {
      msg = `${t('voice.answer.youHave')} ${result.quantity} ${result.product} ${t('voice.answer.inStock')}.`;
    } else if (result.kind === 'grand_total') {
      msg = `${t('voice.answer.youHave')} ${result.quantity} ${t('voice.answer.palletsTotal')}.`;
    } else {
      msg = t('voice.answer.unknown');
    }
    setAnswer(msg);
    setState('answered');
    speak(msg);
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setTranscript('');
    setAnswer('');
    const rec = new Ctor();
    rec.lang = bcp47;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript ?? '';
      setTranscript(said);
      void answerQuestion(said);
    };
    rec.onerror = () => setState('idle');
    rec.onend = () => setState((s) => (s === 'listening' ? 'idle' : s));
    recognitionRef.current = rec;
    setState('listening');
    try {
      rec.start();
    } catch {
      setState('idle');
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setState('idle');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('voice.title')}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center hover:bg-teal-700 md:bottom-6"
      >
        <Mic className="w-6 h-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => { stopListening(); setOpen(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold text-slate-900">{t('voice.title')}</h2>
              </div>
              <button onClick={() => { stopListening(); setOpen(false); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {!supported ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{t('voice.unsupported')}</p>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 py-2">
                  <button
                    onClick={state === 'listening' ? stopListening : startListening}
                    className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-colors ${state === 'listening' ? 'bg-rose-500 animate-pulse' : 'bg-teal-600 hover:bg-teal-700'}`}
                  >
                    {state === 'thinking' ? <Loader2 className="w-8 h-8 animate-spin" /> : <Mic className="w-8 h-8" />}
                  </button>
                  <p className="text-xs text-slate-500">
                    {state === 'listening' ? t('voice.listening') : state === 'thinking' ? t('voice.thinking') : t('voice.tapToSpeak')}
                  </p>
                </div>

                {transcript && (
                  <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                    <span className="text-xs text-slate-400">{t('voice.youAsked')}:</span> {transcript}
                  </div>
                )}
                {answer && (
                  <div className="text-sm font-medium text-slate-900 bg-teal-50 border border-teal-100 rounded-lg p-3">{answer}</div>
                )}

                <p className="text-[11px] text-slate-400 text-center">{t('voice.hint')}</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
