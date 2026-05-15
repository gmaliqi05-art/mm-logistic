import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { sq } from './sq';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { legalTranslations } from './legal';

export type Language = 'sq' | 'en' | 'de' | 'fr';

export type Translations = typeof sq;

// Base translations as-loaded from each language file.
const baseTranslations: Record<Language, Translations> = { sq, en, de, fr };

// Merge `legal` block into each language at module load time.
// `legalTranslations` is imported from ./legal/index.ts and contains
// all 8 legal documents (impressum, terms, cookies, privacy, dpa,
// subprocessors, aup, refund) plus common labels.
const translations: Record<Language, Translations> = {
  sq: { ...baseTranslations.sq, legal: legalTranslations.sq } as unknown as Translations,
  en: { ...baseTranslations.en, legal: legalTranslations.en } as unknown as Translations,
  de: { ...baseTranslations.de, legal: legalTranslations.de } as unknown as Translations,
  fr: { ...baseTranslations.fr, legal: legalTranslations.fr } as unknown as Translations,
};

export const languageNames: Record<Language, string> = {
  sq: 'Shqip',
  en: 'English',
  de: 'Deutsch',
  fr: 'Fran\u00e7ais',
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
    const saved = localStorage.getItem('ep_language');
    if (saved && saved in translations) return saved as Language;
    return 'sq';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('ep_language', lang);
    document.documentElement.lang = lang;
  }, []);

  const t = useCallback((key: string): string => {
    return getNestedValue(translations[language] as unknown as Record<string, unknown>, key);
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

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
.
