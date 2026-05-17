export interface ProductLike {
  id: string;
  name: string;
  sku?: string | null;
  category_id?: string | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  dimensions?: string | null;
  default_condition?: string | null;
}

export interface CategoryLike {
  id: string;
  name: string;
  aliases?: string[] | null;
}

export interface MatchResult {
  productId: string | null;
  categoryId: string | null;
  score: number;
  matchedOn: 'sku' | 'product_name' | 'category_name' | 'combined' | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  signals: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on', 'pcs', 'stk',
  'stueck', 'stuck', 'pc', 'm', 'cm', 'mm', 'x', 'dhe', 'ne', 'per', 'te', 'me', 'nje',
  'gem', 'gs1', 'din', 'en', 'iso',
]);

const ALIAS_MAP: Record<string, string[]> = {
  europalette: ['euro', 'palette', 'paletten', 'epal', 'uic', 'eur'],
  europaletten: ['euro', 'palette', 'paletten', 'epal', 'uic', 'eur'],
  europallet: ['euro', 'palette', 'paletten', 'epal', 'uic', 'eur'],
  europallets: ['euro', 'palette', 'paletten', 'epal', 'uic', 'eur'],
  epal: ['euro', 'palette', 'paletten', 'europalette', 'uic', 'eur'],
  uic: ['euro', 'palette', 'paletten', 'europalette', 'epal', 'eur'],
  eur: ['euro', 'palette', 'paletten', 'europalette', 'epal', 'uic'],
  palette: ['paletten', 'paleta', 'pallet', 'pallets'],
  paletten: ['palette', 'paleta', 'pallet', 'pallets'],
  paleta: ['palette', 'paletten', 'pallet', 'pallets'],
  pallet: ['palette', 'paletten', 'paleta', 'pallets'],
  pallets: ['palette', 'paletten', 'paleta', 'pallet'],
  einwegpalette: ['einweg', 'palette', 'oneway'],
  klasse: ['class', 'kl', 'klasa'],
  class: ['klasse', 'kl', 'klasa'],
  defekt: ['damaged', 'broken', 'kaputt', 'damage', 'repair'],
  damaged: ['defekt', 'broken', 'kaputt', 'damage'],
  kaputt: ['defekt', 'damaged', 'broken'],
  sortier: ['sorting', 'sortim', 'mix', 'mischt'],
  sorting: ['sortier', 'sortim', 'mix'],
};

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts pallet dimension pairs (length x width) from free text and
 * normalises them to millimetres. Accepts: 1200x800, 1200×800, 120x80 cm,
 * 80x120cm, 800mm x 1200mm, 1,2 m x 0,8 m, 1.2x0.8m.
 * The returned strings are always sorted ascending ("800x1200") so that
 * 1200x800 and 800x1200 compare equal.
 */
export function extractDimensions(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const clean = text.toLowerCase().replace(/×/g, 'x').replace(/,/g, '.');

  const toMm = (v: number, u: string): number => {
    if (!u) {
      if (v < 10) return Math.round(v * 1000);
      if (v < 300) return Math.round(v * 10);
      return Math.round(v);
    }
    if (u === 'mm') return Math.round(v);
    if (u === 'cm') return Math.round(v * 10);
    if (u === 'm') return Math.round(v * 1000);
    return Math.round(v);
  };

  const addPair = (a: number, unitA: string, b: number, unitB: string) => {
    const ax = toMm(a, unitA);
    const bx = toMm(b, unitB);
    if (ax > 0 && bx > 0) {
      const lo = Math.min(ax, bx);
      const hi = Math.max(ax, bx);
      out.add(`${lo}x${hi}`);
    }
  };

  // Standard "AxB" format
  const re = /(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    addPair(parseFloat(m[1]), m[2] || m[4] || '', parseFloat(m[3]), m[4] || m[2] || '');
  }

  // Dash-separated format: "60cm-80cm", "600-800mm", "60-80 cm"
  const reDash = /(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/g;
  while ((m = reDash.exec(clean)) !== null) {
    addPair(parseFloat(m[1]), m[2] || '', parseFloat(m[3]), m[4] || m[2] || '');
  }

  return Array.from(out);
}

function extractQualityClass(text: string): 'a' | 'b' | 'c' | null {
  const d = (text || '').toLowerCase();
  if (/(klasse\s*a|\bkl\.?\s*a\b|\bclass\s*a\b|\ba[\s-]?klasse\b|a[- ]?qualit(a|ae|ä)t|qualit(a|ae|ä)t\s*a)/i.test(d)) return 'a';
  if (/(klasse\s*b|\bkl\.?\s*b\b|\bclass\s*b\b|\bb[\s-]?klasse\b|b[- ]?qualit(a|ae|ä)t|qualit(a|ae|ä)t\s*b)/i.test(d)) return 'b';
  if (/(klasse\s*c|\bkl\.?\s*c\b|\bclass\s*c\b|\bc[\s-]?klasse\b|c[- ]?qualit(a|ae|ä)t|qualit(a|ae|ä)t\s*c)/i.test(d)) return 'c';
  return null;
}

function countDimTokens(name: string): number {
  return extractDimensions(name).length;
}

function stemGerman(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('etten')) return w.slice(0, -2);
  if (w.endsWith('en')) return w.slice(0, -2);
  if (w.endsWith('er')) return w.slice(0, -2);
  if (w.endsWith('es')) return w.slice(0, -1);
  if (w.endsWith('s')) return w.slice(0, -1);
  if (w.endsWith('e')) return w.slice(0, -1);
  return w;
}

function expandTokens(raw: string): Set<string> {
  const out = new Set<string>();
  const words = normalize(raw)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  for (const w of words) {
    out.add(w);
    out.add(stemGerman(w));
    const aliases = ALIAS_MAP[w];
    if (aliases) for (const a of aliases) out.add(a);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): { hits: number; ratio: number } {
  if (a.size === 0 || b.size === 0) return { hits: 0, ratio: 0 };
  let hits = 0;
  for (const t of b) if (a.has(t)) hits++;
  return { hits, ratio: hits / Math.max(1, b.size) };
}

export function matchProduct(
  description: string,
  products: ProductLike[],
  categories: CategoryLike[],
): MatchResult {
  const desc = normalize(description);
  if (!desc) {
    return { productId: null, categoryId: null, score: 0, matchedOn: null, confidence: 'none', signals: 0 };
  }
  const descTokens = expandTokens(description);
  const descDims = extractDimensions(description);
  const descClass = extractQualityClass(description);

  let bestCat: { c: CategoryLike; score: number; hits: number } | null = null;
  for (const c of categories) {
    const aliasBlob = (c.aliases || []).join(' ');
    const cTokens = expandTokens(`${c.name} ${aliasBlob}`);
    const { hits, ratio } = overlap(descTokens, cTokens);
    const nameLower = normalize(c.name);
    const contained = nameLower && desc.includes(nameLower) ? 0.5 : 0;
    const aliasHit = (c.aliases || []).some((a) => {
      const n = normalize(a);
      return n.length >= 3 && desc.includes(n);
    }) ? 0.9 : 0;
    const total = ratio + contained + aliasHit;
    if (!bestCat || total > bestCat.score) bestCat = { c, score: total, hits };
  }

  let bestProduct: { p: ProductLike; score: number; hits: number; matchedSku: boolean; dimMatch: boolean; aliasMatch: boolean } | null = null;
  for (const p of products) {
    const aliasBlob = (p.aliases || []).join(' ');
    const keywordBlob = (p.keywords || []).join(' ');
    const pTokens = expandTokens(`${p.name} ${aliasBlob} ${keywordBlob}`);
    const { hits, ratio } = overlap(descTokens, pTokens);
    const nameLower = normalize(p.name);
    const contained = nameLower && desc.includes(nameLower) ? 0.5 : 0;

    const sku = normalize(p.sku || '');
    const skuHit = sku && sku.length >= 3 && desc.includes(sku);

    const aliasHit = (p.aliases || []).some((a) => {
      const n = normalize(a);
      return n.length >= 3 && desc.includes(n);
    });
    const keywordHits = (p.keywords || []).reduce((acc, k) => {
      const n = normalize(k);
      return n.length >= 3 && desc.includes(n) ? acc + 1 : acc;
    }, 0);

    const prodDimsRaw = p.dimensions
      ? extractDimensions(p.dimensions)
      : extractDimensions(`${p.name} ${p.sku || ''} ${aliasBlob}`);
    const dimMatch = descDims.length > 0 && prodDimsRaw.length > 0
      && prodDimsRaw.some((d) => descDims.includes(d));

    const inCatBonus = bestCat && p.category_id === bestCat.c.id ? 0.15 : 0;
    const dimBonus = dimMatch ? 0.8 : 0;
    const dimMismatchPenalty = descDims.length > 0 && prodDimsRaw.length > 0 && !dimMatch ? -0.5 : 0;
    // When description has dimensions but product has none, reduce alias bonus
    const aliasBonus = aliasHit
      ? (descDims.length > 0 && prodDimsRaw.length === 0 ? 0.3 : 0.9)
      : 0;
    const keywordBonus = Math.min(keywordHits * 0.2, 0.4);
    const total = ratio + contained + (skuHit ? 0.6 : 0) + inCatBonus + dimBonus + dimMismatchPenalty + aliasBonus + keywordBonus;

    if (!bestProduct || total > bestProduct.score) {
      bestProduct = { p, score: total, hits, matchedSku: !!skuHit, dimMatch, aliasMatch: aliasHit };
    }
  }

  // Quality/class fallback: when the description carries "A-Qualität" / "Klasse B" etc.
  // but no dimensions, prefer a product whose name encodes the same class and keeps
  // the fewest extra dimension tokens (the "plain default" for that class).
  if (descClass && bestCat) {
    const classToken = `klasse ${descClass}`;
    const candidates = products.filter((p) => {
      if (bestCat && p.category_id !== bestCat.c.id) return false;
      const n = normalize(p.name);
      return n.includes(classToken) || new RegExp(`\\bkl\\.?\\s*${descClass}\\b`).test(n);
    });
    if (candidates.length > 0) {
      candidates.sort((a, b) => countDimTokens(a.name) - countDimTokens(b.name));
      const pick = candidates[0];
      if (!bestProduct || bestProduct.score < 0.7 || bestProduct.p.category_id !== bestCat.c.id) {
        bestProduct = { p: pick, score: Math.max(bestProduct?.score ?? 0, 0.95), hits: 1, matchedSku: false, dimMatch: false };
      }
    }
  }

  const catOk = bestCat && bestCat.score >= 0.45;
  const prodOk = bestProduct && bestProduct.score >= 0.5;
  const skuOk = bestProduct?.matchedSku ?? false;

  let signals = 0;
  if (catOk) signals++;
  if (prodOk) signals++;
  if (skuOk) signals++;

  const combined = (bestCat?.score ?? 0) * 0.4 + (bestProduct?.score ?? 0) * 0.4 + (skuOk ? 0.2 : 0);

  let confidence: MatchResult['confidence'] = 'none';
  if (bestProduct?.aliasMatch) confidence = 'high';
  else if (bestProduct?.dimMatch && catOk) confidence = 'high';
  else if (signals >= 3 || (prodOk && combined >= 0.9)) confidence = 'high';
  else if (signals >= 2) confidence = 'high';
  else if (signals === 1 && combined >= 0.45) confidence = 'medium';
  else if (combined > 0) confidence = 'low';

  let productId: string | null = null;
  let categoryId: string | null = null;
  let matchedOn: MatchResult['matchedOn'] = null;

  if (skuOk && bestProduct) {
    productId = bestProduct.p.id;
    categoryId = bestProduct.p.category_id ?? bestCat?.c.id ?? null;
    matchedOn = 'sku';
  } else if (prodOk && catOk && bestProduct && bestCat) {
    productId = bestProduct.p.category_id === bestCat.c.id ? bestProduct.p.id : bestProduct.p.id;
    categoryId = bestProduct.p.category_id ?? bestCat.c.id;
    matchedOn = 'combined';
  } else if (prodOk && bestProduct) {
    productId = bestProduct.p.id;
    categoryId = bestProduct.p.category_id ?? null;
    matchedOn = 'product_name';
  } else if (catOk && bestCat) {
    categoryId = bestCat.c.id;
    matchedOn = 'category_name';
  }

  return { productId, categoryId, score: combined, matchedOn, confidence, signals };
}
