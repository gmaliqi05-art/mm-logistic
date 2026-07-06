import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Loader2, Send, Square } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { interpretStockQuestion, type VoiceStockRow } from '../../utils/voiceStockQuery';
import { stripMarkdown } from '../../utils/stripMarkdown';
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
const AV = 60;

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

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

  // Pick the clearest available voice for the current language.
  useEffect(() => {
    if (typeof window.speechSynthesis === 'undefined') return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      voiceRef.current =
        vs.find((v) => v.lang === bcp47 && v.localService) ||
        vs.find((v) => v.lang === bcp47) ||
        vs.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(language)) || null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [bcp47, language]);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcp47;
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 1.02;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* text is the fallback */ }
  }

  function stop() {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setSpeaking(false);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
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
    // Barge-in: cut any current speech the moment the user sends.
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setSpeaking(false);
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', { body: { messages: nextMessages } });
      let answer: string;
      let navPath: string | null = null;
      if (error || !data?.answer) {
        answer = await localStockFallback(q);
      } else {
        answer = data.answer;
        if (Array.isArray(data.data)) {
          const nav = data.data.map((c: Json) => c?.result?.navigate).find((v: unknown) => typeof v === 'string' && v);
          if (nav) navPath = nav as string;
        }
      }
      const clean = stripMarkdown(answer);
      setMessages([...nextMessages, { role: 'assistant', content: clean }]);
      speak(clean);
      if (navPath) {
        // Give the confirmation a beat to start, then open the page.
        setTimeout(() => { navigate(navPath!); setOpen(false); }, 250);
      }
    } catch {
      const answer = stripMarkdown(await localStockFallback(q).catch(() => t('voice.errorGeneric')));
      setMessages([...nextMessages, { role: 'assistant', content: answer }]);
      speak(answer);
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    // Barge-in: if the assistant is speaking, stop it and listen.
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setSpeaking(false);
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

      {/* Centered manager while active (listening / thinking / speaking) */}
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
          <button onClick={stop} className="pointer-events-auto mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-rose-500 text-white text-sm font-medium shadow-lg hover:bg-rose-600">
            <Square className="w-4 h-4" /> {t('voice.stop')}
          </button>
        </div>
      )}

      {/* Compact bar (no big chat table in the middle of the page) */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 pb-safe-nav pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <ManagerAvatar size={26} />
              <span className="text-sm font-semibold text-slate-900">{t('voice.title')}</span>
              <button onClick={() => { stop(); setOpen(false); }} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            {lastAssistant && !active && (
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto">{lastAssistant}</p>
            )}
            <div className="flex items-center gap-2">
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
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
