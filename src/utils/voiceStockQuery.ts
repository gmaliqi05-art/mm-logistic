import { normalizeQuestion } from './reportIntents';

/**
 * Voice assistant — stock question interpreter (pure, no I/O, no speech).
 *
 * The browser does speech-to-text; this turns the resulting transcript into a
 * structured answer against an already-loaded stock snapshot. Keeping it pure
 * means the hard-to-test speech component stays thin and this logic is fully
 * unit-tested. The component formats the structured result into a spoken
 * sentence via i18n.
 *
 * It understands three stock questions (v1, the owner's use case):
 *   - a specific EPAL quality class ("sa Klasse A / A class / a clase kemi")
 *   - a named product ("euro pallet", "kunststoff …")
 *   - the grand total ("sa paleta kemi gjithsej")
 */

export interface VoiceStockRow {
  depotName: string;
  productName: string;
  categoryName?: string;
  condition: string;
  quantity: number;
}

export type VoiceStockResult =
  | { kind: 'product_total'; product: string; quantity: number; byDepot: Array<{ depot: string; quantity: number }> }
  | { kind: 'grand_total'; quantity: number }
  | { kind: 'unknown' };

/** Extract an EPAL class letter (A/B/C) when the phrase is about a class. */
function detectClassLetter(norm: string): string | null {
  // "klasse a", "klasa a", "class a", "a clase", "a-klasse", "b class" …
  const m =
    norm.match(/(?:klas\w*|clas\w*)[\s-]?([abc])\b/) ||
    norm.match(/\b([abc])[\s-]?(?:klas\w*|clas\w*)/);
  return m ? m[1].toUpperCase() : null;
}

/** Significant (non-generic) tokens of a product name, for loose matching. */
const GENERIC_TOKENS = new Set([
  'pallet', 'pallets', 'palette', 'paletten', 'palet', 'paleta', 'paletat',
  'klasse', 'klasa', 'class', 'clase', 'classe', 'h', 'the', 'der', 'die', 'das',
]);

function significantTokens(name: string): string[] {
  return normalizeQuestion(name)
    .split(' ')
    .filter((tok) => tok.length >= 3 && !GENERIC_TOKENS.has(tok));
}

function sumByDepot(rows: VoiceStockRow[]): { total: number; byDepot: Array<{ depot: string; quantity: number }> } {
  const m = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    total += r.quantity;
    m.set(r.depotName, (m.get(r.depotName) ?? 0) + r.quantity);
  }
  const byDepot = [...m.entries()].map(([depot, quantity]) => ({ depot, quantity })).sort((a, b) => b.quantity - a.quantity);
  return { total, byDepot };
}

export function interpretStockQuestion(transcript: string | null | undefined, rows: VoiceStockRow[]): VoiceStockResult {
  const norm = normalizeQuestion(transcript ?? '');
  if (!norm) return { kind: 'unknown' };

  // 1. Specific EPAL class (highest priority — the owner's example).
  const letter = detectClassLetter(norm);
  if (letter) {
    const re = new RegExp(`(?:klas\\w*|clas\\w*)\\s*${letter.toLowerCase()}\\b`);
    const match = rows.filter((r) => re.test(normalizeQuestion(r.productName)));
    if (match.length > 0) {
      const { total, byDepot } = sumByDepot(match);
      return { kind: 'product_total', product: match[0].productName, quantity: total, byDepot };
    }
  }

  // 2. Named product (e.g. "euro pallet", "kunststoff"). Pick the product whose
  //    significant tokens best overlap the transcript.
  const products = new Map<string, VoiceStockRow[]>();
  for (const r of rows) {
    if (!products.has(r.productName)) products.set(r.productName, []);
    products.get(r.productName)!.push(r);
  }
  let best: { name: string; score: number } | null = null;
  for (const [name] of products) {
    const toks = significantTokens(name);
    const score = toks.filter((tok) => norm.includes(tok)).length;
    if (score > 0 && (!best || score > best.score)) best = { name, score };
  }
  if (best) {
    const { total, byDepot } = sumByDepot(products.get(best.name)!);
    return { kind: 'product_total', product: best.name, quantity: total, byDepot };
  }

  // 3. Grand total ("gjithsej", "total", "insgesamt", "au total", "all stock").
  if (/(gjithsej|te gjitha|total|insgesamt|gesamt|au total|all stock|how much stock|sa stok|sa palet)/.test(norm)) {
    const { total } = sumByDepot(rows);
    return { kind: 'grand_total', quantity: total };
  }

  return { kind: 'unknown' };
}
