const PRIORITY_PATTERNS = ['euro pal', 'euro-pal', 'europal', 'euro p', 'epal'];

function priorityRank(categoryName: string | null | undefined, productName?: string | null): number {
  const cat = (categoryName ?? '').toLowerCase().trim();
  const prod = (productName ?? '').toLowerCase().trim();
  for (const p of PRIORITY_PATTERNS) {
    if (cat.startsWith(p) || cat.includes(p)) return 0;
    if (prod.startsWith(p) || prod.includes(p)) return 1;
  }
  return 2;
}

export function epalClassRank(name: string | null | undefined): number {
  const n = (name ?? '').toLowerCase().trim();
  if (!n) return 99;
  const isEpal = /(euro\s*pal|epal|europal)/.test(n);
  const klass =
    /(klass[e]?\s*a|class\s*a|kualitet\s*a|cilesi\s*a|kategori\s*a|^a\s+(klass|class|kualitet|paleta|kuali))/.test(n) ||
    /\ba\s*(klass|class|kualitet)\b/.test(n) ||
    n === 'a' ||
    /^a\s/.test(n)
      ? 0
      : /(klass[e]?\s*b|class\s*b|kualitet\s*b|cilesi\s*b|kategori\s*b)/.test(n) || /\bb\s*(klass|class|kualitet)\b/.test(n) || /^b\s/.test(n)
      ? 1
      : /(klass[e]?\s*c|class\s*c|kualitet\s*c|cilesi\s*c|kategori\s*c)/.test(n) || /\bc\s*(klass|class|kualitet)\b/.test(n) || /^c\s/.test(n)
      ? 2
      : 99;
  if (klass === 99) return 99;
  return isEpal ? klass : 10 + klass;
}

export function compareEpalThenTotal<T>(
  a: T,
  b: T,
  getName: (item: T) => string,
  getTotal: (item: T) => number,
): number {
  const ra = epalClassRank(getName(a));
  const rb = epalClassRank(getName(b));
  if (ra !== rb) return ra - rb;
  return getTotal(b) - getTotal(a);
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
  return getName(a).localeCompare(getName(b));
}

export function compareCategoriesByPriority(a: string, b: string): number {
  const ra = priorityRank(a);
  const rb = priorityRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}
