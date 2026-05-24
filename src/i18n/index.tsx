import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { sq } from './sq';
import { legalTranslations } from './legal';

export type Language = 'sq' | 'en' | 'de' | 'fr';

export type Translations = typeof sq;

// Default-language translations are eager (sq is the source of truth
// and the fallback). en/de/fr are dynamically imported the first time
// the user switches to that language — keeps the initial bundle small
// (~200 KB instead of ~830 KB) since most users never switch away
// from their default.
const loaders: Record<Exclude<Language, 'sq'>, () => Promise<{ [k: string]: Translations }>> = {
  en: () => import('./en') as Promise<{ [k: string]: Translations }>,
  de: () => import('./de') as Promise<{ [k: string]: Translations }>,
  fr: () => import('./fr') as Promise<{ [k: string]: Translations }>,
};

const localeKey: Record<Exclude<Language, 'sq'>, string> = {
  en: 'en',
  de: 'de',
  fr: 'fr',
};

function withLegal(base: Translations, lang: Language): Translations {
  return { ...base, legal: legalTranslations[lang] } as unknown as Translations;
}

// Map of already-loaded language tables. sq is preloaded; the others
// are filled on first use.
const cache: Record<Language, Translations | undefined> = {
  sq: withLegal(sq, 'sq'),
  en: undefined,
  de: undefined,
  fr: undefined,
};

async function ensureLoaded(lang: Language): Promise<Translations> {
  const existing = cache[lang];
  if (existing) return existing;
  if (lang === 'sq') return cache.sq!;
  const mod = await loaders[lang]();
  // Modules export their language as the named binding ('en' for ./en.ts).
  const base = (mod[localeKey[lang]] ?? mod.default) as Translations;
  const full = withLegal(base, lang);
  cache[lang] = full;
  return full;
}

export const languageNames: Record<Language, string> = {
  sq: 'Shqip',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
};

export const languageFlags: Record<Language, string> = {
  sq: 'AL',
  en: 'EN',
  de: 'DE',
  fr: 'FR',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  tRaw: (key: string) => unknown;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return path;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : path;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ep_language') : null;
    if (saved === 'sq' || saved === 'en' || saved === 'de' || saved === 'fr') return saved;
    return 'sq';
  });
  // Force re-render once a lazy locale finishes loading.
  const [, setLoadedTick] = useState(0);
  const loadingRef = useRef<Language | null>(null);

  useEffect(() => {
    if (cache[language]) return;
    loadingRef.current = language;
    ensureLoaded(language)
      .then(() => {
        if (loadingRef.current === language) setLoadedTick((n) => n + 1);
      })
      .catch(() => { /* fall back to sq silently */ });
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ep_language', lang);
      document.documentElement.lang = lang;
    }
  }, []);

  // While the requested language is loading, fall back to sq so the
  // app doesn't render raw translation keys.
  const active: Translations = cache[language] ?? cache.sq!;

  const t = useCallback((key: string): string => {
    return getNestedValue(active as unknown as Record<string, unknown>, key);
  }, [active]);

  const tRaw = useCallback((key: string): unknown => {
    const keys = key.split('.');
    let current: unknown = active;
    for (const k of keys) {
      if (current === undefined || current === null) return undefined;
      current = (current as Record<string, unknown>)[k];
    }
    return current;
  }, [active]);

  const value = useMemo(() => ({ language, setLanguage, t, tRaw }), [language, setLanguage, t, tRaw]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used within LanguageProvider');
  return context;
}
