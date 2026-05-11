export function normalizeCompanyLabel(value: string | null | undefined): string {
  if (!value) return '';
  const beforeSlash = value.split('/')[0] ?? value;
  return beforeSlash.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeVat(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isOwnCompanyName(
  candidateName: string | null | undefined,
  candidateVat: string | null | undefined,
  ownName: string | null | undefined,
  ownVat: string | null | undefined,
): boolean {
  const own = normalizeCompanyLabel(ownName);
  const cand = normalizeCompanyLabel(candidateName);
  if (own && cand) {
    if (cand === own) return true;
    if (cand.startsWith(own)) return true;
    if (own.startsWith(cand) && cand.length >= 4) return true;
  }
  const ov = normalizeVat(ownVat);
  const cv = normalizeVat(candidateVat);
  if (ov && cv && ov === cv) return true;
  return false;
}
