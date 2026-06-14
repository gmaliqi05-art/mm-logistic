/**
 * EPAL QR code payload parser.
 *
 * Since January 2024 EPAL has been adding QR codes to newly produced
 * Euro-pallets — over 4 million in circulation by 2025 (see EPAL
 * announcement). Three payload variants have appeared on the wire:
 *
 *   1. Plain serial: bare alphanumeric token (most current rollout).
 *      Example: "1234202400A12B345"
 *
 *   2. URL form: https://qr.epal-pallets.org/{serial} or short links
 *      to the EPAL Pallet App.
 *      Example: "https://qr.epal-pallets.org/1234202400A12B345"
 *
 *   3. Structured form: "EPAL|licensee|year|serial" used by some
 *      legacy printers and pilot batches.
 *      Example: "EPAL|1234|2024|00A12B345"
 *
 * The parser is forgiving: it returns whatever components it can
 * confidently extract and leaves the rest as undefined rather than
 * throwing. Consumers (the depot scan flow, the partner ledger,
 * delivery-note items) can then decide whether to accept the row
 * (any serial > 0) or require all four components for a strict
 * receipt.
 *
 * Canonical form for storage:
 *   `EPAL-{licensee}-{year}-{serial}` when we have all three parts
 *   `EPAL-?-?-{serial}` when only the serial is known
 *
 * This way `delivery_note_items.epal_qr_serial` is searchable by a
 * substring on the serial regardless of which variant the partner
 * scanned in.
 */

export interface EpalQrPayload {
  /** Raw payload as scanned, trimmed. */
  raw: string;
  /** EPAL licensee number (manufacturer ID) when present. */
  licensee?: string;
  /** Four-digit production year when present. */
  year?: number;
  /** The per-pallet serial — the actually-unique part. */
  serial: string;
  /** True when we have enough to build a canonical key. */
  valid: boolean;
}

const URL_PREFIX_RE = /^https?:\/\/(?:qr\.)?epal-pallets\.org\/(.+)$/i;
const STRUCTURED_RE = /^EPAL[|/](\d{1,6})[|/](\d{4})[|/]([A-Z0-9]{4,})$/i;
const PLAIN_SERIAL_RE = /^[A-Z0-9]{6,32}$/i;

export function parseEpalQrPayload(input: string | null | undefined): EpalQrPayload | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Variant 2: URL form. Unwrap to the path, then re-parse.
  const urlMatch = URL_PREFIX_RE.exec(raw);
  if (urlMatch) {
    const inner = decodeURIComponent(urlMatch[1].split('?')[0].split('#')[0]);
    const recursed = parseEpalQrPayload(inner);
    if (recursed) {
      return { ...recursed, raw };
    }
    return null;
  }

  // Variant 3: structured form.
  const structured = STRUCTURED_RE.exec(raw);
  if (structured) {
    const licensee = structured[1];
    const year = Number(structured[2]);
    const serial = structured[3].toUpperCase();
    return {
      raw,
      licensee,
      year,
      serial,
      valid: serial.length >= 4 && year >= 2020 && year <= 2099,
    };
  }

  // Variant 1: plain alphanumeric. We treat the whole string as the
  // serial. Heuristic: when the leading 4 digits look like a licensee
  // and the next 4 look like a year, split them. Otherwise keep the
  // whole thing as serial.
  if (PLAIN_SERIAL_RE.test(raw)) {
    if (raw.length >= 12 && /^\d{8}/.test(raw)) {
      const licensee = raw.slice(0, 4);
      const yearNum = Number(raw.slice(4, 8));
      if (yearNum >= 2020 && yearNum <= 2099) {
        return {
          raw,
          licensee,
          year: yearNum,
          serial: raw.slice(8).toUpperCase(),
          valid: true,
        };
      }
    }
    return {
      raw,
      serial: raw.toUpperCase(),
      valid: raw.length >= 6,
    };
  }

  return null;
}

/**
 * Canonical storage form for `delivery_note_items.epal_qr_serial`.
 * '?' placeholders mark missing licensee/year so the canonical key
 * remains a stable substring search target.
 */
export function canonicalEpalKey(p: EpalQrPayload): string {
  const lic = p.licensee ?? '?';
  const yr = p.year ?? '?';
  return `EPAL-${lic}-${yr}-${p.serial}`;
}

/**
 * Returns just the canonical key for a raw payload, or null when the
 * payload couldn't be parsed. Convenience used by the scanner flow.
 */
export function parseEpalQrSerial(input: string | null | undefined): string | null {
  const parsed = parseEpalQrPayload(input);
  if (!parsed) return null;
  return canonicalEpalKey(parsed);
}
