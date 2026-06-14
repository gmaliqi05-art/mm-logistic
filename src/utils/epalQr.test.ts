import { describe, expect, it } from 'vitest';
import {
  parseEpalQrPayload,
  parseEpalQrSerial,
  canonicalEpalKey,
} from './epalQr';

describe('parseEpalQrPayload', () => {
  it('returns null for empty / nullish input', () => {
    expect(parseEpalQrPayload(null)).toBeNull();
    expect(parseEpalQrPayload(undefined)).toBeNull();
    expect(parseEpalQrPayload('')).toBeNull();
    expect(parseEpalQrPayload('   ')).toBeNull();
  });

  it('parses structured EPAL|licensee|year|serial form', () => {
    const p = parseEpalQrPayload('EPAL|1234|2024|00A12B345');
    expect(p).not.toBeNull();
    expect(p!.licensee).toBe('1234');
    expect(p!.year).toBe(2024);
    expect(p!.serial).toBe('00A12B345');
    expect(p!.valid).toBe(true);
  });

  it('accepts slash separators in structured form', () => {
    const p = parseEpalQrPayload('EPAL/0001/2024/ABCD');
    expect(p).not.toBeNull();
    expect(p!.licensee).toBe('0001');
    expect(p!.serial).toBe('ABCD');
  });

  it('rejects structured form with implausible year', () => {
    const p = parseEpalQrPayload('EPAL|1234|1999|ABCD');
    expect(p!.valid).toBe(false);
  });

  it('parses URL form by unwrapping the path', () => {
    const p = parseEpalQrPayload('https://qr.epal-pallets.org/1234202400A12B345');
    expect(p).not.toBeNull();
    expect(p!.licensee).toBe('1234');
    expect(p!.year).toBe(2024);
    expect(p!.serial).toBe('00A12B345');
    expect(p!.raw).toContain('epal-pallets.org');
  });

  it('strips query strings and fragments from URL form', () => {
    const p = parseEpalQrPayload('https://qr.epal-pallets.org/1234202400A12B345?utm=app#hash');
    expect(p).not.toBeNull();
    expect(p!.serial).toBe('00A12B345');
  });

  it('parses plain numeric form and splits licensee/year heuristically', () => {
    const p = parseEpalQrPayload('1234202400A12B345');
    expect(p).not.toBeNull();
    expect(p!.licensee).toBe('1234');
    expect(p!.year).toBe(2024);
    expect(p!.serial).toBe('00A12B345');
    expect(p!.valid).toBe(true);
  });

  it('falls back to whole-string serial when split fails', () => {
    const p = parseEpalQrPayload('ABCDEF1234');
    expect(p).not.toBeNull();
    expect(p!.licensee).toBeUndefined();
    expect(p!.year).toBeUndefined();
    expect(p!.serial).toBe('ABCDEF1234');
    expect(p!.valid).toBe(true);
  });

  it('returns null for unrecognisable payloads', () => {
    expect(parseEpalQrPayload('!!!')).toBeNull();
    expect(parseEpalQrPayload('hello world')).toBeNull();
  });

  it('marks too-short serials as invalid', () => {
    const p = parseEpalQrPayload('ABC');
    expect(p).toBeNull();
  });
});

describe('canonicalEpalKey', () => {
  it('builds a canonical key with all parts', () => {
    expect(
      canonicalEpalKey({ raw: '', licensee: '1234', year: 2024, serial: 'X', valid: true }),
    ).toBe('EPAL-1234-2024-X');
  });

  it('uses ? placeholders for missing parts', () => {
    expect(canonicalEpalKey({ raw: '', serial: 'X', valid: true })).toBe('EPAL-?-?-X');
  });
});

describe('parseEpalQrSerial', () => {
  it('returns the canonical key directly', () => {
    expect(parseEpalQrSerial('EPAL|1234|2024|ABCD')).toBe('EPAL-1234-2024-ABCD');
  });

  it('returns null for unparseable input', () => {
    expect(parseEpalQrSerial('not a qr')).toBeNull();
    expect(parseEpalQrSerial(null)).toBeNull();
  });
});
