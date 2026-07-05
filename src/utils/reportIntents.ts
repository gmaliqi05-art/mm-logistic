/**
 * Natural-language report intent matching (template-based, no LLM, no SQL gen).
 *
 * The platform exposes a small, fixed catalogue of read-only reports. This
 * module maps a free-text question — in any of the four UI languages, mixed or
 * misspelt — onto one of those report intents by keyword overlap. There is NO
 * generated SQL and NO free-form query: the matched `intentId` selects a
 * predefined, parameterised Supabase query in the UI, so the surface is
 * injection-proof by construction.
 *
 * Pure and deterministic (no I/O), so it is fully unit-testable. Adding a
 * report = add one `ReportIntent` entry with its keyword pool.
 */

export type ReportIntentId =
  | 'stock_overview'
  | 'stock_runout'
  | 'damaged_stock'
  | 'unpaid_invoices'
  | 'overdue_invoices'
  | 'pallet_debtors';

export interface ReportIntent {
  id: ReportIntentId;
  /** i18n key for the human label of this report. */
  labelKey: string;
  /**
   * Keyword phrases (any language) that signal this intent. Matched as
   * accent-insensitive substrings against the normalised question. Multi-word
   * phrases score higher than single words (they are more specific).
   */
  keywords: string[];
}

export interface ReportIntentMatch {
  intentId: ReportIntentId;
  /** Normalised 0..1 confidence. */
  score: number;
  /** The keyword phrases that fired, for an explainable "did you mean". */
  matchedKeywords: string[];
}

/** The fixed report catalogue. Keyword pools intentionally span sq/en/de/fr. */
export const REPORT_INTENTS: ReportIntent[] = [
  {
    id: 'stock_overview',
    labelKey: 'company.reportAssistant.intents.stockOverview',
    keywords: [
      'stock by depot', 'stock overview', 'how much stock', 'total stock',
      'stoku sipas depos', 'sa stok', 'gjendja e stokut', 'stoku total',
      'lagerbestand', 'bestand pro lager', 'lagerübersicht',
      'stock par dépôt', 'aperçu du stock', 'niveau de stock',
    ],
  },
  {
    id: 'stock_runout',
    labelKey: 'company.reportAssistant.intents.stockRunout',
    keywords: [
      'run out', 'running out', 'will run out', 'low stock', 'reorder', 'forecast',
      'do te mbaroje', 'po mbaron', 'stok i ulet', 'parashikim',
      'geht aus', 'zur neige', 'niedriger bestand', 'nachbestellen', 'prognose',
      'en rupture', 'bientôt épuisé', 'stock faible', 'prévision',
    ],
  },
  {
    id: 'damaged_stock',
    labelKey: 'company.reportAssistant.intents.damagedStock',
    keywords: [
      'damaged', 'damaged stock', 'defect', 'broken pallets',
      'te demtuara', 'stok i demtuar', 'defekte', 'te prishura',
      'beschädigt', 'defekte paletten', 'schadhaft',
      'endommagé', 'palettes défectueuses', 'abîmé',
    ],
  },
  {
    id: 'unpaid_invoices',
    labelKey: 'company.reportAssistant.intents.unpaidInvoices',
    keywords: [
      'unpaid', 'unpaid invoices', 'open invoices', 'outstanding invoices', 'not paid',
      'fatura te papaguara', 'fatura te hapura', 'papaguar',
      'unbezahlt', 'offene rechnungen', 'nicht bezahlt',
      'impayé', 'factures impayées', 'factures ouvertes',
    ],
  },
  {
    id: 'overdue_invoices',
    labelKey: 'company.reportAssistant.intents.overdueInvoices',
    keywords: [
      'overdue', 'overdue invoices', 'past due', 'late payment',
      'fatura te vonuara', 'mbi afat', 'te vonuara', 'vonesa',
      'überfällig', 'überfällige rechnungen', 'verspätet',
      'en retard', 'factures en retard', 'échues',
    ],
  },
  {
    id: 'pallet_debtors',
    labelKey: 'company.reportAssistant.intents.palletDebtors',
    keywords: [
      'who owes us pallets', 'pallet balance', 'pallet debtors', 'owes pallets', 'palettenkonto',
      'kush me ka borxh paleta', 'bilanci i paletave', 'borxh paleta', 'kush ka borxh',
      'wer schuldet paletten', 'palettensaldo', 'palettenschuld',
      'qui nous doit des palettes', 'solde palettes', 'dette de palettes',
    ],
  },
];

/**
 * Accent/diacritic-insensitive lowercase, collapse whitespace. Keeps the
 * matcher robust to sq/de/fr accents (ë, ü, é, …) and messy spacing.
 */
export function normalizeQuestion(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a free-text question to the best report intent, or null if nothing
 * clears the confidence floor. Multi-word keyword phrases weigh more than
 * single words. `score` is the winner's weight over the best-possible weight
 * for that intent, clamped to 1.
 */
export function matchReportIntent(question: string | null | undefined): ReportIntentMatch | null {
  if (!question) return null;
  const q = normalizeQuestion(question);
  if (!q) return null;

  let best: ReportIntentMatch | null = null;

  for (const intent of REPORT_INTENTS) {
    let weight = 0;
    const matched: string[] = [];
    for (const kw of intent.keywords) {
      const nkw = normalizeQuestion(kw);
      if (!nkw) continue;
      if (q.includes(nkw)) {
        // Longer, multi-word phrases are more specific → higher weight.
        const w = nkw.includes(' ') ? 2 : 1;
        weight += w;
        matched.push(kw);
      }
    }
    if (weight === 0) continue;

    // Normalise against a modest cap so a single strong phrase already scores well.
    const score = Math.min(1, weight / 3);
    if (!best || score > best.score || (score === best.score && matched.length > best.matchedKeywords.length)) {
      best = { intentId: intent.id, score, matchedKeywords: matched };
    }
  }

  return best;
}
