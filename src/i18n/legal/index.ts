import { impressum } from './impressum';
import { terms } from './terms';
import { cookies } from './cookies';
import { privacy } from './privacy';
import { dpa } from './dpa';
import { subprocessors } from './subprocessors';
import { aup } from './aup';
import { refund } from './refund';
import { ipProtection } from './ip-protection';

const documentKeys = ['impressum', 'terms', 'cookies', 'privacy', 'dpa', 'subprocessors', 'aup', 'refund', 'ip-protection'] as const;
export type LegalDocumentKey = (typeof documentKeys)[number];

const documents: Record<string, Record<string, unknown>> = {
  impressum, terms, cookies, privacy, dpa, subprocessors, aup, refund,
  'ip-protection': ipProtection,
};

function buildLanguage(lang: 'sq' | 'en' | 'de' | 'fr') {
  const docs: Record<string, unknown> = {};
  for (const key of documentKeys) {
    const doc = documents[key];
    docs[key] = doc[lang] ?? doc.en;
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
      'ip-protection': (docs['ip-protection'] as { shortTitle?: string })?.shortTitle ?? 'IP Protection',
    },
  };
}

export const legalTranslations = {
  sq: buildLanguage('sq'),
  en: buildLanguage('en'),
  de: buildLanguage('de'),
  fr: buildLanguage('fr'),
};
