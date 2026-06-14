/**
 * LUCID / VerpackG registration helpers.
 *
 * LUCID is the federal packaging registry operated by the Stiftung
 * Zentrale Stelle Verpackungsregister (ZSVR) in Osnabrück. Every
 * distributor that places packaging — including B2B transport
 * packaging like wooden pallets — on the German market must register
 * before first placement and submit annual data declarations.
 *
 * Non-registration fines: up to €200,000 per violation under §34
 * VerpackG + sales prohibition.
 *
 * Registration numbers issued by ZSVR follow the format
 *   `DE` + 13 digits, e.g. `DE1234567890123`.
 *
 * Pool participants (operators running an EPAL exchange) are
 * exempted from system participation under §12 VerpackG, but they
 * are NOT exempted from registration itself — a common compliance
 * gap our SaaS surfaces via the warning produced by `lucidStatus()`.
 */

// Strict ZSVR format. Anchored to disallow leading/trailing junk.
const LUCID_FORMAT_RE = /^DE\d{13}$/;

export type LucidStatus =
  // Not a German company; registration not required.
  | 'not_applicable'
  // DE company but neither field is set.
  | 'missing'
  // DE company has a registration number but malformed.
  | 'invalid_format'
  // DE company missing the registration date (operator forgot to
  // record the ZSVR confirmation date — still a compliance gap for
  // audit trail purposes).
  | 'missing_date'
  // DE company with valid number + date.
  | 'ok';

export interface LucidInput {
  country: string | null | undefined;
  lucid_registration_number: string | null | undefined;
  lucid_registered_at: string | null | undefined;
}

export function isLucidApplicable(country: string | null | undefined): boolean {
  if (!country) return false;
  return country.trim().toUpperCase() === 'DE';
}

export function isValidLucidNumber(value: string | null | undefined): boolean {
  if (!value) return false;
  return LUCID_FORMAT_RE.test(value.trim());
}

export function lucidStatus(input: LucidInput): LucidStatus {
  if (!isLucidApplicable(input.country)) return 'not_applicable';
  const num = (input.lucid_registration_number ?? '').trim();
  const dt = (input.lucid_registered_at ?? '').trim();
  if (!num && !dt) return 'missing';
  if (num && !isValidLucidNumber(num)) return 'invalid_format';
  if (!dt) return 'missing_date';
  return 'ok';
}

/**
 * Returns the next annual mass-quantity declaration deadline given
 * the LUCID registration date. ZSVR requires the data report to be
 * filed by 15 May of each year following the reporting year.
 *
 * For a registration on 03.07.2024:
 *   - first deadline 15.05.2025 (covering 2024)
 *   - then yearly thereafter
 *
 * Returns null if there's no registration date to anchor against.
 */
export function nextLucidDeclarationDeadline(
  registeredAt: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!registeredAt) return null;
  const reg = new Date(registeredAt);
  if (Number.isNaN(reg.getTime())) return null;
  // The first deadline is 15 May of the calendar year *after* the year
  // of registration. Subsequent deadlines repeat on 15 May each year.
  let year = reg.getUTCFullYear() + 1;
  let deadline = new Date(Date.UTC(year, 4, 15)); // month is 0-indexed, 4 = May
  while (deadline.getTime() < now.getTime()) {
    year += 1;
    deadline = new Date(Date.UTC(year, 4, 15));
  }
  return deadline;
}
