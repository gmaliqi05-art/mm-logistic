import { describe, expect, it } from 'vitest';
import { extractAuditSummary } from './auditLogSummary';

describe('extractAuditSummary', () => {
  it('returns "" for null / undefined / non-object', () => {
    expect(extractAuditSummary(null)).toBe('');
    expect(extractAuditSummary(undefined)).toBe('');
    expect(extractAuditSummary('not an object')).toBe('');
    expect(extractAuditSummary(42)).toBe('');
  });

  it('returns "" for an empty object', () => {
    expect(extractAuditSummary({})).toBe('');
  });

  describe('manual logAudit shape', () => {
    it('prefers name when present', () => {
      expect(extractAuditSummary({ name: 'Depo Prishtine', email: 'a@b.com' })).toBe('Depo Prishtine');
    });

    it('falls back to email', () => {
      expect(extractAuditSummary({ email: 'driver@example.com' })).toBe('driver@example.com');
    });

    it('falls back to note_number', () => {
      expect(extractAuditSummary({ note_number: 'DN-2026-0042' })).toBe('DN-2026-0042');
    });

    it('falls back to license_plate', () => {
      expect(extractAuditSummary({ license_plate: 'B-XX 1234' })).toBe('B-XX 1234');
    });

    it('falls back to full_name', () => {
      expect(extractAuditSummary({ full_name: 'Agon Krasniqi' })).toBe('Agon Krasniqi');
    });

    it('treats blank strings as missing', () => {
      expect(extractAuditSummary({ name: '   ', email: 'x@y.com' })).toBe('x@y.com');
    });
  });

  describe('trigger shape', () => {
    it('reads after.name on INSERT', () => {
      expect(extractAuditSummary({ after: { name: 'New Partner' } })).toBe('New Partner');
    });

    it('reads before.note_number on DELETE', () => {
      expect(extractAuditSummary({ before: { note_number: 'DN-2026-0099' } })).toBe('DN-2026-0099');
    });

    it('reads changed.invoice_number on UPDATE', () => {
      expect(extractAuditSummary({ changed: { invoice_number: 'INV-2026-0007' } })).toBe('INV-2026-0007');
    });

    it('prefers manual keys at top level over snapshot', () => {
      expect(
        extractAuditSummary({
          name: 'top-level',
          after: { name: 'snapshot' },
        }),
      ).toBe('top-level');
    });

    it('prefers after over before over changed when both exist', () => {
      expect(
        extractAuditSummary({
          after: { name: 'A' },
          before: { name: 'B' },
          changed: { name: 'C' },
        }),
      ).toBe('A');
      expect(
        extractAuditSummary({
          before: { name: 'B' },
          changed: { name: 'C' },
        }),
      ).toBe('B');
    });

    it('falls back through name -> full_name -> note_number -> invoice_number -> license_plate -> title', () => {
      expect(extractAuditSummary({ after: { title: 'A document' } })).toBe('A document');
      expect(extractAuditSummary({ after: { license_plate: 'B-AA 1' } })).toBe('B-AA 1');
    });
  });
});
