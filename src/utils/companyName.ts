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
    if (cand.includes(own) && own.length >= 4) return true;
  }
  const ov = normalizeVat(ownVat);
  const cv = normalizeVat(candidateVat);
  if (ov && cv && ov === cv) return true;
  return false;
}

const SEPARATOR_REGEX = /\s*(?:\/|\||\\|•|;|,|\s-\s|\s—\s|\s–\s|\svs\.?\s)\s*/i;

export function splitCompanyCandidates(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(SEPARATOR_REGEX)
    .map(p => p.trim())
    .filter(p => p.length >= 2);
}

/**
 * Remove the own company name from a combined string like "SAL PAL / Enlirat GmbH".
 * Returns the remaining partner name, or empty string if unclear/only own.
 */
export function stripOwnFromPartnerName(
  rawName: string | null | undefined,
  ownName: string | null | undefined,
  ownVat: string | null | undefined,
): string {
  const raw = (rawName ?? '').trim();
  if (!raw) return '';
  const parts = splitCompanyCandidates(raw);
  if (parts.length <= 1) {
    if (isOwnCompanyName(raw, null, ownName, ownVat)) return '';
    return raw;
  }
  const remaining = parts.filter(p => !isOwnCompanyName(p, null, ownName, ownVat));
  if (remaining.length === 0) return '';
  if (remaining.length === 1) return remaining[0];
  return remaining.join(' / ');
}

/**
 * True when the raw string contains the own company as one of the pieces AND at least one other party.
 */
export function containsOwnCompany(
  rawName: string | null | undefined,
  ownName: string | null | undefined,
  ownVat: string | null | undefined,
): boolean {
  const parts = splitCompanyCandidates(rawName ?? '');
  if (parts.length === 0) return false;
  return parts.some(p => isOwnCompanyName(p, null, ownName, ownVat));
}
