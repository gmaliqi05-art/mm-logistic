import { useRef, useState } from 'react';
import { Mic, X, Loader2, Send, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { interpretStockQuestion, type VoiceStockRow } from '../../utils/voiceStockQuery';

/* Minimal typing for the browser Speech API (not in the standard lib types). */
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const LANG_MAP: Record<string, string> = { sq: 'sq-AL', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }
// deno / browser-agnostic loose typing for the agent preview payload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/**
 * Conversational company assistant. Sends the conversation to the `ai-agent`
 * edge function (which is company- and role-scoped server-side) and speaks the
 * reply. Falls back to the local stock interpreter when the AI backend is not
 * configured, so stock questions keep working. Input by voice or text.
 */
export default function VoiceAssistant() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preview, setPreview] = useState<Json[] | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported = getRecognitionCtor() !== null && typeof window.speechSynthesis !== 'undefined';
  const bcp47 = LANG_MAP[language] ?? 'en-US';

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcp47;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* text is the fallback */ }
  }

  async function localStockFallback(question: string): Promise<string> {
    const companyId = profile?.company_id;
    if (!companyId) return t('voice.answer.unknown');
    const { data } = await supabase
      .from('stock')
      .select('quantity, condition, depots(name), category_products(name), product_categories(name)')
      .eq('company_id', companyId).gt('quantity', 0);
    const rows: VoiceStockRow[] = ((data ?? []) as Json[]).map((r) => ({
      depotName: r.depots?.name ?? '—',
      productName: r.category_products?.name ?? r.product_categories?.name ?? '—',
      condition: r.condition,
      quantity: r.quantity ?? 0,
    }));
    const res = interpretStockQuestion(question, rows);
    if (res.kind === 'product_total') return `${t('voice.answer.youHave')} ${res.quantity} ${res.product} ${t('voice.answer.inStock')}.`;
    if (res.kind === 'grand_total') return `${t('voice.answer.youHave')} ${res.quantity} ${t('voice.answer.palletsTotal')}.`;
    return t('voice.answer.unknown');
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(nextMessages);
    setInput('');
    setPreview(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', { body: { messages: nextMessages } });
      let answer: string;
      if (error || !data?.answer) {
        // AI backend unavailable / not configured -> local stock fallback.
        answer = await localStockFallback(q);
      } else {
        answer = data.answer;
        if (Array.isArray(data.data) && data.data.length > 0) setPreview(data.data);
      }
      setMessages([...nextMessages, { role: 'assistant', content: answer }]);
      speak(answer);
    } catch {
      const answer = await localStockFallback(q).catch(() => t('voice.errorGeneric'));
      setMessages([...nextMessages, { role: 'assistant', content: answer }]);
      speak(answer);
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = bcp47;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript ?? '';
      setListening(false);
      if (said) void send(said);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('voice.title')}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center hover:bg-teal-700 md:bottom-6"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold text-slate-900">{t('voice.title')}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">{t('voice.hint')}</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'bg-teal-600 text-white ml-auto' : 'bg-slate-100 text-slate-800'}`}>
                  {m.content}
                </div>
              ))}
              {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> {t('voice.thinking')}</div>}

              {preview && preview.map((block, i) => <PreviewBlock key={i} block={block} />)}
            </div>

            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
              {speechSupported && (
                <button
                  onClick={startListening}
                  disabled={busy}
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${listening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void send(input); }}
                placeholder={t('voice.placeholder')}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
              />
              <button onClick={() => void send(input)} disabled={busy || !input.trim()} className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0 hover:bg-teal-700 disabled:opacity-50">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Renders the first array found in a tool result as a compact table. */
function PreviewBlock({ block }: { block: Json }) {
  const result = block?.result;
  if (!result || typeof result !== 'object') return null;
  const firstArray = Object.values(result).find((v) => Array.isArray(v) && v.length > 0) as Json[] | undefined;
  const rows = Array.isArray(result) ? result : firstArray;
  if (!rows || rows.length === 0 || typeof rows[0] !== 'object') return null;
  const cols = Object.keys(rows[0]).filter((c) => typeof rows[0][c] !== 'object');
  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-100">
            {cols.map((c) => <th key={c} className="px-2 py-1 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r: Json, i: number) => (
            <tr key={i} className="border-b border-slate-50">
              {cols.map((c) => <td key={c} className="px-2 py-1 text-slate-700">{String(r[c] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
