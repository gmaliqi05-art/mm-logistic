const PRIORITY_PATTERNS = ['euro pal', 'euro-pal', 'europal', 'euro p'];

function priorityRank(categoryName: string | null | undefined, productName?: string | null): number {
  const cat = (categoryName ?? '').toLowerCase().trim();
  const prod = (productName ?? '').toLowerCase().trim();
  for (const p of PRIORITY_PATTERNS) {
    if (cat.startsWith(p) || cat.includes(p)) return 0;
    if (prod.startsWith(p) || prod.includes(p)) return 1;
  }
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
  return getName(a).localeCompare(getName(b));
}

export function compareCategoriesByPriority(a: string, b: string): number {
  const ra = priorityRank(a);
  const rb = priorityRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

export function epalClassRank(productName: string | null | undefined): number {
  const n = (productName ?? '').toLowerCase();
  if (/(?:^|[^a-z])(klasse\s*a|class\s*a|a[\s-]*klasse|epal\s*a|a\s*pallet|a\b)/i.test(n)) return 0;
  if (/(?:^|[^a-z])(klasse\s*b|class\s*b|b[\s-]*klasse|epal\s*b|b\s*pallet|b\b)/i.test(n)) return 1;
  if (/(?:^|[^a-z])(klasse\s*c|class\s*c|c[\s-]*klasse|epal\s*c|c\s*pallet|c\b)/i.test(n)) return 2;
  return 3;
}
