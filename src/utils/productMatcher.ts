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
  matchedOn: 'sku' | 'product_name' | 'category_name' | null;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on', 'pcs', 'stk',
  'kg', 'pc', 'm', 'cm', 'mm', 'x', 'dhe', 'ne', 'per', 'te', 'me', 'nje',
]);

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(' ')
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w)),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of b) if (a.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}

export function matchProduct(
  description: string,
  products: ProductLike[],
  categories: CategoryLike[],
): MatchResult {
  const desc = normalize(description);
  if (!desc) return { productId: null, categoryId: null, score: 0, matchedOn: null };

  for (const p of products) {
    const sku = normalize(p.sku || '');
    if (sku && sku.length >= 3 && desc.includes(sku)) {
      return { productId: p.id, categoryId: p.category_id ?? null, score: 1, matchedOn: 'sku' };
    }
  }

  const descTokens = tokens(description);

  let bestProduct: { p: ProductLike; score: number } | null = null;
  for (const p of products) {
    const pTokens = tokens(p.name);
    const score = overlapScore(descTokens, pTokens);
    const nameLower = normalize(p.name);
    const contained = nameLower && desc.includes(nameLower) ? 0.4 : 0;
    const total = score + contained;
    if (!bestProduct || total > bestProduct.score) {
      bestProduct = { p, score: total };
    }
  }
  if (bestProduct && bestProduct.score >= 0.5) {
    return {
      productId: bestProduct.p.id,
      categoryId: bestProduct.p.category_id ?? null,
      score: bestProduct.score,
      matchedOn: 'product_name',
    };
  }

  let bestCat: { c: CategoryLike; score: number } | null = null;
  for (const c of categories) {
    const cTokens = tokens(c.name);
    const score = overlapScore(descTokens, cTokens);
    const nameLower = normalize(c.name);
    const contained = nameLower && desc.includes(nameLower) ? 0.4 : 0;
    const total = score + contained;
    if (!bestCat || total > bestCat.score) {
      bestCat = { c, score: total };
    }
  }
  if (bestCat && bestCat.score >= 0.4) {
    return {
      productId: null,
      categoryId: bestCat.c.id,
      score: bestCat.score,
      matchedOn: 'category_name',
    };
  }

  return { productId: null, categoryId: null, score: 0, matchedOn: null };
}
