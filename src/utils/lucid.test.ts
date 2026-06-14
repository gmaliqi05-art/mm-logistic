import { describe, expect, it } from 'vitest';
import {
  isLucidApplicable,
  isValidLucidNumber,
  lucidStatus,
  nextLucidDeclarationDeadline,
} from './lucid';

describe('isLucidApplicable', () => {
  it('is true only for DE', () => {
    expect(isLucidApplicable('DE')).toBe(true);
    expect(isLucidApplicable('de')).toBe(true);
    expect(isLucidApplicable('  DE  ')).toBe(true);
  });

  it('is false for other countries and missing input', () => {
    expect(isLucidApplicable('AT')).toBe(false);
    expect(isLucidApplicable('FR')).toBe(false);
    expect(isLucidApplicable('')).toBe(false);
    expect(isLucidApplicable(null)).toBe(false);
    expect(isLucidApplicable(undefined)).toBe(false);
  });
});

describe('isValidLucidNumber', () => {
  it('accepts the canonical DE + 13 digits', () => {
    expect(isValidLucidNumber('DE1234567890123')).toBe(true);
  });

  it('rejects wrong country prefix', () => {
    expect(isValidLucidNumber('AT1234567890123')).toBe(false);
  });

  it('rejects wrong digit count', () => {
    expect(isValidLucidNumber('DE123456789012')).toBe(false);
    expect(isValidLucidNumber('DE12345678901234')).toBe(false);
  });

  it('rejects letters / spaces in the digit block', () => {
    expect(isValidLucidNumber('DE123 4567890123')).toBe(false);
    expect(isValidLucidNumber('DE123456789012X')).toBe(false);
  });

  it('rejects empty / null', () => {
    expect(isValidLucidNumber('')).toBe(false);
    expect(isValidLucidNumber(null)).toBe(false);
    expect(isValidLucidNumber(undefined)).toBe(false);
  });
});

describe('lucidStatus', () => {
  it('is not_applicable for non-DE companies', () => {
    expect(
      lucidStatus({ country: 'AT', lucid_registration_number: null, lucid_registered_at: null }),
    ).toBe('not_applicable');
  });

  it('is missing when DE company has neither field', () => {
    expect(
      lucidStatus({ country: 'DE', lucid_registration_number: '', lucid_registered_at: null }),
    ).toBe('missing');
  });

  it('is invalid_format when the number is malformed', () => {
    expect(
      lucidStatus({
        country: 'DE',
        lucid_registration_number: 'DE-not-a-number',
        lucid_registered_at: '2024-07-03',
      }),
    ).toBe('invalid_format');
  });

  it('is missing_date when number is valid but date is absent', () => {
    expect(
      lucidStatus({
        country: 'DE',
        lucid_registration_number: 'DE1234567890123',
        lucid_registered_at: null,
      }),
    ).toBe('missing_date');
  });

  it('is ok when both fields are populated correctly', () => {
    expect(
      lucidStatus({
        country: 'DE',
        lucid_registration_number: 'DE1234567890123',
        lucid_registered_at: '2024-07-03',
      }),
    ).toBe('ok');
  });
});

describe('nextLucidDeclarationDeadline', () => {
  it('returns null when there is no registration date', () => {
    expect(nextLucidDeclarationDeadline(null)).toBeNull();
    expect(nextLucidDeclarationDeadline('not a date')).toBeNull();
  });

  it('returns the May 15 of the year after registration', () => {
    const got = nextLucidDeclarationDeadline('2024-07-03', new Date('2024-08-01T00:00:00Z'));
    expect(got?.toISOString()).toBe('2025-05-15T00:00:00.000Z');
  });

  it('rolls forward when the deadline has passed', () => {
    const got = nextLucidDeclarationDeadline('2020-01-01', new Date('2026-06-14T00:00:00Z'));
    expect(got?.toISOString()).toBe('2027-05-15T00:00:00.000Z');
  });

  it('still returns the same May 15 deadline when not yet reached', () => {
    const got = nextLucidDeclarationDeadline('2024-07-03', new Date('2025-04-30T00:00:00Z'));
    expect(got?.toISOString()).toBe('2025-05-15T00:00:00.000Z');
  });
});
