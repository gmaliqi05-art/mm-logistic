const PRIORITY_PATTERNS = [
  'euro pal',
  'euro-pal',
  'europal',
  'euro p',
  'epal',
  'uic',
  'eur pallet',
  'euro pallet',
  'euro palette',
  'europalette',
];

export function isEuroPaletteName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase().trim();
  if (!n) return false;
  if (/\beur\b/.test(n)) return true;
  return PRIORITY_PATTERNS.some((p) => n.includes(p));
}

export function isEuroPaletteCategory(
  cat: { name?: string | null; aliases?: string[] | null } | null | undefined,
): boolean {
  if (!cat) return false;
  if (isEuroPaletteName(cat.name)) return true;
  const aliases = Array.isArray(cat.aliases) ? cat.aliases : [];
  return aliases.some((a) => isEuroPaletteName(a));
}

function priorityRank(categoryName: string | null | undefined, productName?: string | null): number {
  if (isEuroPaletteName(categoryName)) return 0;
  if (isEuroPaletteName(productName)) return 1;
  return 2;
}

export function compareProducts<T>(
  a: T,
  b: T,
  getCategory: (item: T) => string | null | undefined,
  getName: (item: T) => string,
): number {
  const ra = priorityRank(getCategory(a), getName(a));
  const rb = priorityRank(getCategory(b), getName(b));
  if (ra !== rb) return ra - rb;
  const ca = (getCategory(a) ?? '').toLowerCase();
  const cb = (getCategory(b) ?? '').toLowerCase();
  if (ca !== cb) return ca.localeCompare(cb);
  const sa = epalClassRank(getName(a));
  const sb = epalClassRank(getName(b));
  if (sa !== sb) return sa - sb;
  return getName(a).localeCompare(getName(b));
}

export function compareCategoriesByPriority(a: string, b: string): number {
  const ra = priorityRank(a);
  const rb = priorityRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

export function isNewPalletProduct(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase();
  if (!n) return false;
  return /(\be re\b|\be-re\b|\bneu\b|\bnew\b|\bnueva\b|\bnuovo\b|paleta e re|palette neu|palette new|pallet new|new pallet)/i.test(
    n,
  );
}

function hasClassMarker(n: string): boolean {
  return /(klass?e?\s*[abc]\b|class\s*[abc]\b|\b[abc][-\s]?klass?e?\b|epal\s*[abc]\b|\b[abc][-\s]?pallet\b)/i.test(n);
}

export function epalClassRank(productName: string | null | undefined): number {
  const n = (productName ?? '').toLowerCase();
  if (!n) return 10;
  if (isNewPalletProduct(n)) return 0;
  if (/(klass?e?\s*a|class\s*a|\ba[-\s]?klass?e?\b|epal\s*a|\ba\s*pallet\b)/i.test(n)) return 1;
  if (/(klass?e?\s*b|class\s*b|\bb[-\s]?klass?e?\b|epal\s*b|\bb\s*pallet\b)/i.test(n)) return 2;
  if (/(klass?e?\s*c|class\s*c|\bc[-\s]?klass?e?\b|epal\s*c|\bc\s*pallet\b)/i.test(n)) return 3;
  if (/(defekt|defect|damaged|beschadigt|demtuara?|te?\s*demtuar)/i.test(n)) return 4;
  if (!hasClassMarker(n) && isEuroPaletteName(n)) return 0;
  return 5;
}

export type EuroPaletteClass = 'new' | 'a' | 'b' | 'c' | 'defekt' | 'unknown';

export function classifyEuroPaletteProduct(name: string | null | undefined): EuroPaletteClass {
  const r = epalClassRank(name);
  if (r === 0) return 'new';
  if (r === 1) return 'a';
  if (r === 2) return 'b';
  if (r === 3) return 'c';
  if (r === 4) return 'defekt';
  return 'unknown';
}
