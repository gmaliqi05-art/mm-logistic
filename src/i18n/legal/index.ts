/**
 * Legal i18n index
 *
 * Imports all 8 legal documents and assembles them into per-language
 * structures that can be merged into the main i18n files.
 *
 * Document structure per language:
 *   legal: {
 *     impressum: { title, subtitle, intro, lastUpdated, version, shortTitle, section1..10 },
 *     terms: { ... section1..15 },
 *     cookies: { ... section1..10 },
 *     privacy: { ... section1..15 },
 *     dpa: { ... section1..15 },
 *     subprocessors: { ... section1..15 },
 *     aup: { ... section1..15 },
 *     refund: { ... section1..15 },
 *     back, lastUpdated, contactTitle, contactCompany, contactAddress, contactEmail, contactPhone,
 *     placeholderNotice, backHome, loginLink, allRightsReserved
 *   }
 *
 * Each document includes localized text in 4 languages: sq, en, de, fr.
 * Common labels (back, lastUpdated, etc.) are defined here.
 */

import { impressum } from './impressum';
import { terms } from './terms';
import { cookies } from './cookies';
import { privacy } from './privacy';
import { dpa } from './dpa';
import { subprocessors } from './subprocessors';
import { aup } from './aup';
import { refund } from './refund';

// Common labels for the LegalPage UI (back button, contact card, etc.)
const COMMON_LABELS = {
  sq: {
    back: 'Kthehu',
    lastUpdated: 'Perditesuar',
    contactTitle: 'Kontakti i kompanise',
    contactCompany: '[EMRI I KOMPANISE]\n[Forma juridike]',
    contactAddress: '[Adresa rrugore]\n[Kodi postar] [Qyteti]\nGjermania',
    contactEmail: '[info@kompani.de]',
    contactPhone: '[+49 XXX XXXXXXX]',
    placeholderNotice: 'Te dhenat e kontaktit jane vendmbajtese (placeholder) dhe duhet te zevendesohen me te dhenat reale para se kjo platforme te perdoret ne prodhim.',
    backHome: 'Kthehu ne faqen kryesore',
    loginLink: 'Hyr ne llogarine',
    allRightsReserved: 'Te gjitha te drejtat e rezervuara.',
  },
  en: {
    back: 'Back',
    lastUpdated: 'Updated',
    contactTitle: 'Company contact',
    contactCompany: '[COMPANY NAME]\n[Legal form]',
    contactAddress: '[Street address]\n[Postal code] [City]\nGermany',
    contactEmail: '[info@company.de]',
    contactPhone: '[+49 XXX XXXXXXX]',
    placeholderNotice: 'Contact information is placeholder and must be replaced with real data before this platform is used in production.',
    backHome: 'Back to home',
    loginLink: 'Log in',
    allRightsReserved: 'All rights reserved.',
  },
  de: {
    back: 'Zur\u00fcck',
    lastUpdated: 'Aktualisiert',
    contactTitle: 'Firmenkontakt',
    contactCompany: '[FIRMENNAME]\n[Rechtsform]',
    contactAddress: '[Stra\u00dfe und Hausnummer]\n[Postleitzahl] [Stadt]\nDeutschland',
    contactEmail: '[info@firma.de]',
    contactPhone: '[+49 XXX XXXXXXX]',
    placeholderNotice: 'Kontaktinformationen sind Platzhalter und m\u00fcssen vor dem produktiven Einsatz der Plattform durch echte Daten ersetzt werden.',
    backHome: 'Zur\u00fcck zur Startseite',
    loginLink: 'Anmelden',
    allRightsReserved: 'Alle Rechte vorbehalten.',
  },
  fr: {
    back: 'Retour',
    lastUpdated: 'Mis \u00e0 jour',
    contactTitle: 'Contact entreprise',
    contactCompany: '[NOM DE L\'ENTREPRISE]\n[Forme juridique]',
    contactAddress: '[Rue et num\u00e9ro]\n[Code postal] [Ville]\nAllemagne',
    contactEmail: '[info@entreprise.de]',
    contactPhone: '[+49 XXX XXXXXXX]',
    placeholderNotice: 'Les informations de contact sont des placeholders et doivent \u00eatre remplac\u00e9es par les vraies donn\u00e9es avant l\'utilisation de cette plateforme en production.',
    backHome: 'Retour \u00e0 l\'accueil',
    loginLink: 'Connexion',
    allRightsReserved: 'Tous droits r\u00e9serv\u00e9s.',
  },
} as const;

type Lang = 'sq' | 'en' | 'de' | 'fr';

// LegalPage.tsx uses `legal.${i18nKey}` where i18nKey comes from DOCUMENTS map:
//   'impressum' -> 'impressum'
//   'privacy-policy' -> 'privacy'
//   'terms' -> 'terms'
//   'cookies' -> 'cookies'
//   'dpa' -> 'dpa'
//   'acceptable-use' -> 'aup'
//   'subprocessors' -> 'subprocessors'
//   'refund-policy' -> 'refund'
function buildLegalForLang(lang: Lang) {
  return {
    impressum: impressum[lang],
    terms: terms[lang],
    cookies: cookies[lang],
    privacy: privacy[lang],
    dpa: dpa[lang],
    subprocessors: subprocessors[lang],
    aup: aup[lang],
    refund: refund[lang],
    ...COMMON_LABELS[lang],
  };
}

export const legalTranslations = {
  sq: buildLegalForLang('sq'),
  en: buildLegalForLang('en'),
  de: buildLegalForLang('de'),
  fr: buildLegalForLang('fr'),
};
