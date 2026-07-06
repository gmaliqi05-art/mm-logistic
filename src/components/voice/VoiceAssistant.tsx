import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, Loader2, Send, Square, Ear } from 'lucide-react';
import { supabase, supabaseFunctionsBase, edgeFnHeaders } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { interpretStockQuestion, type VoiceStockRow } from '../../utils/voiceStockQuery';
import { stripMarkdown } from '../../utils/stripMarkdown';
import { isStopCommand } from '../../utils/voiceCommands';
import ManagerAvatar from './ManagerAvatar';

interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const LANG_MAP: Record<string, string> = { sq: 'sq-AL', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };
const POS_KEY = 'mm-assistant-pos';
const WAKE_KEY = 'mm-assistant-wake';
const GREET_KEY = 'mm-assistant-greet-date';
const AV = 60;

// The spoken wake phrase that opens the assistant hands-free ("Hej Toni").
function isWakePhrase(text: string): boolean {
  const t = text.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\b(hej|hey|he|o)\s+toni\b/.test(t) || /\btoni\s+(hej|hey)\b/.test(t);
}

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

/**
 * Score a voice so we prefer the most natural-sounding one available. Modern
 * browsers ship "neural"/"natural"/online voices that sound far less robotic
 * than the legacy local ones — reward those, and reward an exact language match.
 */
function scoreVoice(v: SpeechSynthesisVoice, bcp47: string, lang: string): number {
  const name = v.name.toLowerCase();
  let s = 0;
  if (v.lang === bcp47) s += 40;
  else if (v.lang.replace('_', '-').toLowerCase().startsWith(lang)) s += 20;
  if (/(neural|natural|premium|enhanced|wavenet|studio)/.test(name)) s += 30;
  if (name.includes('google')) s += 12;
  if (name.includes('microsoft')) s += 8;
  // A male-sounding voice suits the "manager" persona when we have a choice.
  if (/(male|daniel|matthew|thomas|markus|conrad|henri|liam|onder)/.test(name)) s += 4;
  return s;
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
  const [convo, setConvo] = useState(false);
  const [wakeOn, setWakeOn] = useState(() => {
    try { return localStorage.getItem(WAKE_KEY) === '1'; } catch { return false; }
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeRecRef = useRef<SpeechRecognitionLike | null>(null);
  // While true the wake-word listener must NOT hold the mic (a conversation is
  // using it). Prevents two microphones running at once on mobile.
  const suppressWakeRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Which TTS engine to use: try ElevenLabs (human voice) first; if it is not
  // configured or fails, fall back to the browser voice for the rest of the session.
  const ttsModeRef = useRef<'unknown' | 'eleven' | 'browser'>('unknown');
  // Refs mirror state for use inside speech/recognition callbacks (which close
  // over stale state otherwise).
  const convoRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

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

  // Pick the clearest, most natural available voice for the current language.
  useEffect(() => {
    if (typeof window.speechSynthesis === 'undefined') return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      const scored = vs
        .map((v) => ({ v, s: scoreVoice(v, bcp47, language) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      voiceRef.current = scored[0]?.v ?? vs.find((v) => v.lang.toLowerCase().startsWith(language)) ?? null;
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

  // Keep the wake toggle in sync when it is changed from the Settings page.
  useEffect(() => {
    const sync = () => { try { setWakeOn(localStorage.getItem(WAKE_KEY) === '1'); } catch { /* ignore */ } };
    window.addEventListener('mm-wake-changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('mm-wake-changed', sync); window.removeEventListener('storage', sync); };
  }, []);

  // Clean up any in-flight speech / recognition when the widget unmounts.
  useEffect(() => () => {
    convoRef.current = false;
    cancelSpeech();
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    try { wakeRecRef.current?.stop(); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop whatever is currently speaking, whichever engine produced it.
  function cancelSpeech() {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    const a = audioRef.current;
    if (a) { try { a.pause(); a.onended = null; a.src = ''; } catch { /* ignore */ } }
  }

  // When a spoken reply finishes: drop the speaking state and, in hands-free
  // conversation mode, re-open the mic so the user just keeps talking.
  function onSpeechEnd() {
    setSpeaking(false);
    if (convoRef.current) setTimeout(() => startListening(), 300);
  }

  /**
   * Speak via ElevenLabs (human neural voice). Returns false if it is not
   * configured or fails, so the caller can fall back to the browser voice.
   */
  async function speakEleven(text: string): Promise<boolean> {
    if (!supabaseFunctionsBase) return false;
    try {
      const resp = await fetch(`${supabaseFunctionsBase}/tts`, {
        method: 'POST',
        headers: await edgeFnHeaders(),
        body: JSON.stringify({ text, lang: language }),
      });
      if (!resp.ok) return false;
      const buf = await resp.arrayBuffer();
      if (!buf.byteLength) return false;
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onplay = () => setSpeaking(true);
      audio.onended = () => { URL.revokeObjectURL(url); onSpeechEnd(); };
      audio.onerror = () => { setSpeaking(false); };
      await audio.play();
      return true;
    } catch { return false; }
  }

  // Browser speech synthesis — the fallback voice (slower rate + warm pitch).
  function speakBrowser(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcp47;
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 0.96;
      u.pitch = 1.04;
      u.volume = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = onSpeechEnd;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* text is the fallback */ }
  }

  /**
   * Speak a response as naturally as we can. Prefer the ElevenLabs human voice;
   * if it is unavailable, use the browser voice for the rest of the session.
   */
  async function speak(text: string) {
    cancelSpeech();
    if (ttsModeRef.current !== 'browser') {
      const ok = await speakEleven(text);
      if (ok) { ttsModeRef.current = 'eleven'; return; }
      ttsModeRef.current = 'browser';
    }
    speakBrowser(text);
  }

  // Full stop — used by the Stop button, the voice "ndalu/stop" command, and
  // closing the widget. Ends conversation mode so nothing re-arms itself.
  function stop() {
    convoRef.current = false;
    setConvo(false);
    cancelSpeech();
    setSpeaking(false);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
    // Let the wake-word listener take the mic back (once the bar is idle/closed).
    suppressWakeRef.current = false;
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
    cancelSpeech();
    setSpeaking(false);
    const nextMessages: ChatMessage[] = [...messagesRef.current, { role: 'user', content: q }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    try {
      // Deployed under the slug "MML-Agent" in Supabase (see supabase/functions/ai-agent).
      const { data, error } = await supabase.functions.invoke('MML-Agent', { body: { messages: nextMessages } });
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
      void speak(clean);
      if (navPath) {
        // Give the confirmation a beat to start, then open the page.
        setTimeout(() => { navigate(navPath!); setOpen(false); }, 250);
      }
    } catch {
      const answer = stripMarkdown(await localStockFallback(q).catch(() => t('voice.errorGeneric')));
      setMessages([...nextMessages, { role: 'assistant', content: answer }]);
      void speak(answer);
    } finally {
      setBusy(false);
    }
  }

  // Start (or restart) listening. In conversation mode this is called
  // automatically after each spoken reply, so the user never taps the mic
  // to continue the dialogue.
  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    if (busy) return;
    // Barge-in: if the assistant is speaking, stop it and listen.
    cancelSpeech();
    setSpeaking(false);
    // Free the wake-word mic first — two mics at once break recognition on mobile.
    suppressWakeRef.current = true;
    try { wakeRecRef.current?.stop(); } catch { /* ignore */ }
    setListening(true);
    const begin = () => {
      const rec = new Ctor();
      rec.lang = bcp47;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const said = e.results?.[0]?.[0]?.transcript ?? '';
        setListening(false);
        if (!said) return;
        // Voice-activated stop: saying "ndalu / stop / halt / arrête" ends the
        // conversation instead of being sent as a question.
        if (isStopCommand(said, language)) { stop(); return; }
        void send(said);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      try { rec.start(); } catch { setListening(false); }
    };
    // Small delay so the wake mic fully releases before we grab it again.
    setTimeout(begin, 300);
  }

  // Tapping the mic opens hands-free conversation mode and starts listening.
  function toggleConversation() {
    if (convoRef.current || listening || speaking) { stop(); return; }
    convoRef.current = true;
    setConvo(true);
    startListening();
  }

  // Open the assistant with a spoken greeting, then start the conversation. The
  // first time each day it opens warmer ("how is your day"), otherwise a short
  // "how can I help". Used by the wake word and can greet on manual open too.
  function greetAndConverse() {
    setOpen(true);
    // The conversation now owns the mic — keep the wake listener off.
    suppressWakeRef.current = true;
    try { wakeRecRef.current?.stop(); } catch { /* ignore */ }
    let firstToday = true;
    try {
      const today = new Date().toISOString().slice(0, 10);
      firstToday = localStorage.getItem(GREET_KEY) !== today;
      localStorage.setItem(GREET_KEY, today);
    } catch { /* ignore */ }
    const greeting = firstToday ? t('voice.greetingFirst') : t('voice.greeting');
    setMessages((m) => [...m, { role: 'assistant', content: greeting }]);
    // Enter conversation mode so the mic re-opens after the greeting is spoken.
    convoRef.current = true;
    setConvo(true);
    void speak(greeting);
  }

  // Wake-word listener: while enabled and the assistant is idle, listen
  // continuously for "Hej Toni" and open + greet when heard. Off by default
  // (it keeps the mic on); the user enables it with the ear toggle.
  useEffect(() => {
    if (!wakeOn || !speechSupported) return;
    if (active || open) return; // don't run the wake mic while busy/talking/open
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    let stopped = false;
    const rec = new Ctor();
    rec.lang = bcp47;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const res = e.results;
      let text = '';
      for (let i = 0; i < res.length; i++) text += ' ' + (res[i]?.[0]?.transcript ?? '');
      if (isWakePhrase(text)) { stopped = true; try { rec.stop(); } catch { /* ignore */ } greetAndConverse(); }
    };
    rec.onerror = () => { /* auto-restarts via onend */ };
    // Only auto-restart if this listener is still wanted AND a conversation is
    // not using the mic (prevents a second microphone starting).
    rec.onend = () => { if (!stopped && !suppressWakeRef.current && !convoRef.current) { try { rec.start(); } catch { /* ignore */ } } };
    wakeRecRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
    return () => { stopped = true; try { rec.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeOn, active, open, speechSupported, bcp47]);

  function toggleWake() {
    setWakeOn((on) => {
      const next = !on;
      try { localStorage.setItem(WAKE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
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
    } else if (speechSupported) {
      // A tap opens the assistant with a spoken greeting and starts talking.
      greetAndConverse();
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
        className="fixed z-40 select-none cursor-grab active:cursor-grabbing"
      >
        <ManagerAvatar size={AV} />
      </div>

      {/* Centered manager while active (listening / thinking / speaking) */}
      {active && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center pointer-events-none">
          <div className="relative flex items-center justify-center">
            <span className={`absolute rounded-full bg-teal-400/30 ${listening ? 'animate-ping' : ''}`} style={{ width: 200, height: 200 }} />
            <span className="absolute rounded-full bg-teal-500/10 animate-pulse" style={{ width: 260, height: 260 }} />
            <div className="relative">
              <ManagerAvatar size={150} speaking={speaking} />
            </div>
          </div>
          <div className="mt-6 max-w-xs text-center px-4">
            <p className="text-sm font-medium text-slate-800 bg-white/85 backdrop-blur rounded-xl px-4 py-2 shadow">
              {listening ? t('voice.listening') : busy ? t('voice.thinking') : lastAssistant}
            </p>
            {convo && (
              <p className="mt-2 text-xs text-slate-500">{t('voice.sayStop')}</p>
            )}
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
              {speechSupported && (
                <button
                  onClick={toggleWake}
                  title={t('voice.wake')}
                  className={`ml-auto flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${wakeOn ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  <Ear className="w-4 h-4" /> {wakeOn ? t('voice.wakeOn') : t('voice.wakeOff')}
                </button>
              )}
              <button onClick={() => { stop(); setOpen(false); }} className={`${speechSupported ? '' : 'ml-auto'} text-slate-400 hover:text-slate-600`}><X className="w-5 h-5" /></button>
            </div>
            {lastAssistant && !active && (
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto">{lastAssistant}</p>
            )}
            <div className="flex items-center gap-2">
              {speechSupported && (
                <button
                  onClick={toggleConversation}
                  title={t('voice.tapToSpeak')}
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${convo || listening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
