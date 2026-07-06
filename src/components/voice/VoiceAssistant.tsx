import { useEffect, useRef, useState } from 'react';
import { Mic, X, Loader2, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { interpretStockQuestion, type VoiceStockRow } from '../../utils/voiceStockQuery';
import ManagerAvatar from './ManagerAvatar';

interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const LANG_MAP: Record<string, string> = { sq: 'sq-AL', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };
const POS_KEY = 'mm-assistant-pos';
const AV = 60; // avatar box size

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function clampPos(x: number, y: number) {
  const maxX = window.innerWidth - AV - 8;
  const maxY = window.innerHeight - AV - 8;
  return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
}

export default function VoiceAssistant() {
  const { profile } = useAuth();
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preview, setPreview] = useState<Json[] | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && typeof saved.x === 'number') return clampPos(saved.x, saved.y);
    } catch { /* ignore */ }
    return { x: (typeof window !== 'undefined' ? window.innerWidth : 400) - AV - 16, y: (typeof window !== 'undefined' ? window.innerHeight : 800) - AV - 90 };
  });
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });

  const speechSupported = getRecognitionCtor() !== null && typeof window.speechSynthesis !== 'undefined';
  const bcp47 = LANG_MAP[language] ?? 'en-US';
  const active = listening || busy || speaking;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcp47;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
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

  // --- draggable launcher ---
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (!drag.current.moved && Math.hypot(dx, dy) > 5) drag.current.moved = true;
    if (drag.current.moved) setPos(clampPos(drag.current.ox + dx, drag.current.oy + dy));
  }
  function onPointerUp() {
    if (!drag.current.active) return;
    const moved = drag.current.moved;
    drag.current.active = false;
    if (moved) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
    } else {
      setOpen(true);
    }
  }

  return (
    <>
      {/* Draggable manager launcher */}
      <div
        role="button"
        title={t('voice.title')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ left: pos.x, top: pos.y, width: AV, height: AV, touchAction: 'none' }}
        className="fixed z-40 rounded-full shadow-xl cursor-grab active:cursor-grabbing select-none ring-2 ring-white/70"
      >
        <ManagerAvatar size={AV} />
      </div>

      {/* Centered manager while listening / thinking / speaking */}
      {active && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center pointer-events-none">
          <div className="relative flex items-center justify-center">
            <span className={`absolute rounded-full bg-teal-400/30 ${listening ? 'animate-ping' : ''}`} style={{ width: 200, height: 200 }} />
            <span className="absolute rounded-full bg-teal-500/10 animate-pulse" style={{ width: 260, height: 260 }} />
            <div className="relative rounded-full shadow-2xl ring-4 ring-white/80">
              <ManagerAvatar size={150} speaking={speaking} />
            </div>
          </div>
          <div className="mt-6 max-w-xs text-center px-4">
            <p className="text-sm font-medium text-slate-800 bg-white/85 backdrop-blur rounded-xl px-4 py-2 shadow">
              {listening ? t('voice.listening') : busy ? t('voice.thinking') : lastAssistant}
            </p>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ManagerAvatar size={28} />
                <h2 className="text-base font-semibold text-slate-900">{t('voice.title')}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-6">{t('voice.hint')}</p>}
              {messages.map((m, i) => (
                <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'bg-teal-600 text-white ml-auto' : 'bg-slate-100 text-slate-800'}`}>{m.content}</div>
              ))}
              {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> {t('voice.thinking')}</div>}
              {preview && preview.map((block, i) => <PreviewBlock key={i} block={block} />)}
            </div>

            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
              {speechSupported && (
                <button onClick={startListening} disabled={busy} className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${listening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
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
