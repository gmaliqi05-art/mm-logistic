export interface PeppolScheme {
  code: string;
  label: string;
  country?: string;
  example: string;
}

export const PEPPOL_SCHEMES: PeppolScheme[] = [
  { code: '9930', label: 'Germany VAT (USt-IdNr.)', country: 'DE', example: 'DE123456789' },
  { code: '9931', label: 'France VAT', country: 'FR', example: 'FRXX123456789' },
  { code: '9910', label: 'Austria VAT', country: 'AT', example: 'ATU12345678' },
  { code: '9909', label: 'Austria Participant', country: 'AT', example: '123456789' },
  { code: '9915', label: 'Austria Federal Gov.', country: 'AT', example: 'b' },
  { code: '0088', label: 'GLN', example: '1234567890123' },
  { code: '0192', label: 'Norway Organisation Number', country: 'NO', example: '123456785' },
  { code: '0007', label: 'Sweden Org. Number', country: 'SE', example: '5567321234' },
  { code: '0184', label: 'Denmark CVR', country: 'DK', example: '12345678' },
  { code: '9944', label: 'Netherlands KvK', country: 'NL', example: '12345678' },
  { code: '9906', label: 'Italy VAT', country: 'IT', example: 'IT12345678901' },
];

export interface PeppolValidation {
  valid: boolean;
  reason?: string;
}

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function mod11NorwegianCheck(digits: string): boolean {
  if (digits.length !== 9) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * weights[i];
  const rem = sum % 11;
  const check = rem === 0 ? 0 : 11 - rem;
  if (check === 10) return false;
  return check === Number(digits[8]);
}

export function validatePeppolId(scheme: string, id: string): PeppolValidation {
  if (!scheme || !id) return { valid: false, reason: 'Scheme and ID are required' };
  const trimmed = id.trim();

  switch (scheme) {
    case '9930':
      return /^DE\d{9}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Must match DE followed by 9 digits' };
    case '9931':
      return /^FR[A-Z0-9]{2}\d{9}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Must match FR + 2 alphanumeric + 9 digits' };
    case '9910':
      return /^ATU\d{8}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Must match ATU followed by 8 digits' };
    case '9906':
      return /^IT\d{11}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'Must match IT followed by 11 digits' };
    case '0088': {
      const digits = trimmed.replace(/\s+/g, '');
      if (!/^\d{13}$/.test(digits)) return { valid: false, reason: 'GLN must be 13 digits' };
      return luhnCheck(digits) ? { valid: true } : { valid: false, reason: 'GLN checksum (Luhn) failed' };
    }
    case '0192': {
      if (!/^\d{9}$/.test(trimmed)) return { valid: false, reason: 'NO org number must be 9 digits' };
      return mod11NorwegianCheck(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'MOD11 checksum failed' };
    }
    case '0007':
      return /^\d{10}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'SE org number must be 10 digits' };
    case '0184':
      return /^\d{8}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'DK CVR must be 8 digits' };
    case '9944':
      return /^\d{8}$/.test(trimmed)
        ? { valid: true }
        : { valid: false, reason: 'NL KvK must be 8 digits' };
    default:
      return trimmed.length > 0
        ? { valid: true }
        : { valid: false, reason: 'ID is required' };
  }
}

export function formatPeppolEndpoint(scheme: string | null | undefined, id: string | null | undefined): string {
  if (!scheme || !id) return '';
  return `${scheme}:${id}`;
}
