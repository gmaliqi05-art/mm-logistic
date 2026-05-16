import { impressum } from './impressum';
import { terms } from './terms';
import { cookies } from './cookies';
import { privacy } from './privacy';
import { dpa } from './dpa';
import { subprocessors } from './subprocessors';
import { aup } from './aup';
import { refund } from './refund';

const documentKeys = ['impressum', 'terms', 'cookies', 'privacy', 'dpa', 'subprocessors', 'aup', 'refund'] as const;
export type LegalDocumentKey = (typeof documentKeys)[number];

const documents = { impressum, terms, cookies, privacy, dpa, subprocessors, aup, refund };

function buildLanguage(lang: 'sq' | 'en' | 'de' | 'fr') {
  const docs: Record<string, unknown> = {};
  for (const key of documentKeys) {
    const doc = documents[key];
    docs[key] = (doc as Record<string, unknown>)[lang] ?? (doc as Record<string, unknown>).en;
  }
  return {
    documents: docs,
    nav: {
      impressum: (docs.impressum as { shortTitle?: string })?.shortTitle ?? 'Impressum',
      terms: (docs.terms as { shortTitle?: string })?.shortTitle ?? 'Terms',
      cookies: (docs.cookies as { shortTitle?: string })?.shortTitle ?? 'Cookies',
      privacy: (docs.privacy as { shortTitle?: string })?.shortTitle ?? 'Privacy',
      dpa: (docs.dpa as { shortTitle?: string })?.shortTitle ?? 'DPA',
      subprocessors: (docs.subprocessors as { shortTitle?: string })?.shortTitle ?? 'Subprocessors',
      aup: (docs.aup as { shortTitle?: string })?.shortTitle ?? 'AUP',
      refund: (docs.refund as { shortTitle?: string })?.shortTitle ?? 'Refund',
    },
  };
}

export const legalTranslations = {
  sq: buildLanguage('sq'),
  en: buildLanguage('en'),
  de: buildLanguage('de'),
  fr: buildLanguage('fr'),
};
