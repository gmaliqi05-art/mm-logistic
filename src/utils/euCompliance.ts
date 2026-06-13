import { effectiveVatRate } from './vatTreatment';
import type { VatTreatment } from '../types/accounting';

export interface EuCountry {
  code: string;
  name: string;
  vat_prefix: string;
  standard_vat: number;
  currency: string;
  language: string;
}

export interface EuVatRate {
  id: string;
  country_code: string;
  rate_type: 'standard' | 'reduced' | 'super_reduced' | 'zero' | 'parking';
  rate: number;
  label: string;
}

const VAT_REGEX: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE0\d{9}$/,
  BG: /^BG\d{9,10}$/,
  HR: /^HR\d{11}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  DE: /^DE\d{9}$/,
  GR: /^EL\d{9}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d{7}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LV: /^LV\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SK: /^SK\d{10}$/,
  SI: /^SI\d{8}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  SE: /^SE\d{12}$/,
};

export function normalizeVat(raw: string): string {
  return (raw || '').toUpperCase().replace(/[\s.-]/g, '');
}

export function validateVatFormat(vat: string): { valid: boolean; country: string | null } {
  const v = normalizeVat(vat);
  if (v.length < 4) return { valid: false, country: null };
  const prefix = v.startsWith('EL') ? 'GR' : v.slice(0, 2);
  const regex = VAT_REGEX[prefix];
  if (!regex) return { valid: false, country: null };
  return { valid: regex.test(v), country: prefix };
}

export type VatRegime =
  | 'domestic'
  | 'intra_community_supply'
  | 'reverse_charge'
  | 'export'
  | 'not_applicable';

export function computeVatRegime(params: {
  sellerCountry: string;
  buyerCountry: string;
  buyerVatValid: boolean;
  isGoods: boolean;
}): { regime: VatRegime; legalText: Record<string, string> } {
  const { sellerCountry, buyerCountry, buyerVatValid } = params;
  const seller = (sellerCountry || '').toUpperCase();
  const buyer = (buyerCountry || '').toUpperCase();
  const euCodes = Object.keys(VAT_REGEX);

  if (!seller || !buyer) {
    return { regime: 'not_applicable', legalText: {} };
  }
  if (seller === buyer) {
    return { regime: 'domestic', legalText: {} };
  }
  if (euCodes.includes(seller) && euCodes.includes(buyer) && buyerVatValid) {
    return {
      regime: 'intra_community_supply',
      legalText: {
        en: 'Intra-Community supply – VAT exempt under Art. 138 of Directive 2006/112/EC. Reverse charge applies.',
        de: 'Innergemeinschaftliche Lieferung – steuerfrei gemass Art. 138 MwStSystRL. Steuerschuldnerschaft des Leistungsempfangers.',
        fr: 'Livraison intracommunautaire – exoneree de TVA en application de l\'article 138 de la Directive 2006/112/CE. Autoliquidation.',
        sq: 'Furnizim brenda Bashkimit Evropian – i perjashtuar nga TVSH-ja sipas Nenit 138.',
      },
    };
  }
  if (euCodes.includes(seller) && !euCodes.includes(buyer)) {
    return {
      regime: 'export',
      legalText: {
        en: 'Export of goods – VAT exempt under Art. 146 of Directive 2006/112/EC.',
        de: 'Ausfuhrlieferung – steuerfrei gemass Art. 146 MwStSystRL.',
        fr: 'Exportation – exoneree de TVA (art. 146 Directive 2006/112/CE).',
        sq: 'Eksport – i perjashtuar nga TVSH-ja.',
      },
    };
  }
  if (euCodes.includes(seller) && euCodes.includes(buyer) && !buyerVatValid) {
    return { regime: 'domestic', legalText: {} };
  }
  return {
    regime: 'reverse_charge',
    legalText: {
      en: 'Reverse charge – the recipient is liable for VAT under Art. 196 of Directive 2006/112/EC.',
      de: 'Umkehrung der Steuerschuldnerschaft (Reverse Charge) gemass Art. 196 MwStSystRL.',
      fr: 'Autoliquidation – article 196 Directive 2006/112/CE.',
      sq: 'Ngarkese e kundert – sipas Nenit 196.',
    },
  };
}

export interface VatBreakdownRow {
  rate: number;
  category: string;
  net: number;
  vat: number;
  gross: number;
}

/**
 * Aggregates invoice items into per-(rate, category) VAT rows.
 *
 * If an item passes a `vat_treatment` (added in PR after migration
 * 20260613180000), the effective rate honours it: exempt treatments
 * (reverse_charge / exempt / sachdarlehen / schadenersatz) contribute
 * zero VAT, even when the stored `vat_rate` is 19.
 *
 * Existing callers that do NOT pass vat_treatment keep historic
 * behaviour because `effectiveVatRate` falls back to the raw rate when
 * the treatment is missing.
 */
export function buildVatBreakdown(
  items: Array<{ net: number; vat_rate: number; vat_category?: string; vat_treatment?: VatTreatment | null }>,
): VatBreakdownRow[] {
  const map = new Map<string, VatBreakdownRow>();
  for (const it of items) {
    const rate = effectiveVatRate({ vat_rate: it.vat_rate, vat_treatment: it.vat_treatment });
    const key = `${rate}-${it.vat_category ?? 'S'}`;
    const row = map.get(key) ?? {
      rate,
      category: it.vat_category ?? 'S',
      net: 0,
      vat: 0,
      gross: 0,
    };
    row.net += it.net;
    row.vat += (it.net * rate) / 100;
    row.gross = row.net + row.vat;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate);
}

export function formatInvoiceNumber(mask: string, prefix: string, year: number, number: number): string {
  const padMatch = mask.match(/\{number:(0+)\}/);
  const pad = padMatch ? padMatch[1].length : 4;
  const numStr = String(number).padStart(pad, '0');
  return mask
    .replace(/\{prefix\}/g, prefix)
    .replace(/\{year\}/g, String(year))
    .replace(/\{number(:0+)?\}/g, numStr);
}

export const UN_ECE_UNITS: Array<{ code: string; label: string }> = [
  { code: 'H87', label: 'Piece / Unit' },
  { code: 'KGM', label: 'Kilogram' },
  { code: 'LTR', label: 'Litre' },
  { code: 'MTR', label: 'Meter' },
  { code: 'HUR', label: 'Hour' },
  { code: 'DAY', label: 'Day' },
  { code: 'SET', label: 'Set' },
  { code: 'PK',  label: 'Package' },
  { code: 'TNE', label: 'Tonne' },
];

export const VAT_CATEGORIES: Array<{ code: string; label: string }> = [
  { code: 'S', label: 'Standard rate' },
  { code: 'Z', label: 'Zero rated goods' },
  { code: 'E', label: 'Exempt from tax' },
  { code: 'AE', label: 'Reverse charge (Art. 196)' },
  { code: 'K', label: 'Intra-Community supply (Art. 138)' },
  { code: 'G', label: 'Export outside EU (Art. 146)' },
  { code: 'O', label: 'Outside scope of VAT' },
];

export function amountInWords(amount: number, currency: string, lang: 'en' | 'de' | 'fr' | 'sq' = 'en'): string {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const currencyNames: Record<string, Record<string, string>> = {
    EUR: { en: 'euros', de: 'Euro', fr: 'euros', sq: 'euro' },
    USD: { en: 'dollars', de: 'Dollar', fr: 'dollars', sq: 'dollare' },
    GBP: { en: 'pounds', de: 'Pfund', fr: 'livres', sq: 'paund' },
  };
  const currencyLabel = currencyNames[currency]?.[lang] ?? currency;
  const centsLabel: Record<string, string> = { en: 'cents', de: 'Cent', fr: 'centimes', sq: 'cent' };
  return `${whole} ${currencyLabel} ${cents.toString().padStart(2, '0')} ${centsLabel[lang] ?? 'cents'}`;
}
