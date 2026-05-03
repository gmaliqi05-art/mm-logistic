export interface ProductLike {
  id: string;
  name: string;
  sku?: string | null;
  category_id?: string | null;
}

export interface CategoryLike {
  id: string;
  name: string;
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
  europalette: ['euro', 'palette', 'paletten', 'epal'],
  europaletten: ['euro', 'palette', 'paletten', 'epal'],
  europallet: ['euro', 'palette', 'paletten', 'epal'],
  europallets: ['euro', 'palette', 'paletten', 'epal'],
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

  let bestCat: { c: CategoryLike; score: number; hits: number } | null = null;
  for (const c of categories) {
    const cTokens = expandTokens(c.name);
    const { hits, ratio } = overlap(descTokens, cTokens);
    const nameLower = normalize(c.name);
    const contained = nameLower && desc.includes(nameLower) ? 0.5 : 0;
    const total = ratio + contained;
    if (!bestCat || total > bestCat.score) bestCat = { c, score: total, hits };
  }

  let bestProduct: { p: ProductLike; score: number; hits: number; matchedSku: boolean } | null = null;
  for (const p of products) {
    const pTokens = expandTokens(p.name);
    const { hits, ratio } = overlap(descTokens, pTokens);
    const nameLower = normalize(p.name);
    const contained = nameLower && desc.includes(nameLower) ? 0.5 : 0;

    const sku = normalize(p.sku || '');
    const skuHit = sku && sku.length >= 3 && desc.includes(sku);

    const inCatBonus = bestCat && p.category_id === bestCat.c.id ? 0.15 : 0;
    const total = ratio + contained + (skuHit ? 0.6 : 0) + inCatBonus;

    if (!bestProduct || total > bestProduct.score) {
      bestProduct = { p, score: total, hits, matchedSku: !!skuHit };
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
  if (signals >= 3 || (prodOk && combined >= 0.9)) confidence = 'high';
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
