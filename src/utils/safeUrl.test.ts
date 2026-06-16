import { describe, expect, it } from 'vitest';
import { isSafeDeepLink, validateDeepLink } from './safeUrl';

describe('validateDeepLink', () => {
  it('rejects empty / whitespace', () => {
    expect(validateDeepLink('').ok).toBe(false);
    expect(validateDeepLink('   ').ok).toBe(false);
    expect(validateDeepLink(null).ok).toBe(false);
    expect(validateDeepLink(undefined).ok).toBe(false);
  });

  it('accepts in-app paths', () => {
    expect(validateDeepLink('/')).toEqual({ ok: true, normalized: '/' });
    expect(validateDeepLink('/company/deliveries')).toEqual({
      ok: true,
      normalized: '/company/deliveries',
    });
    expect(validateDeepLink('/driver/tracking?focus=42')).toEqual({
      ok: true,
      normalized: '/driver/tracking?focus=42',
    });
  });

  it('rejects protocol-relative // URLs', () => {
    // Browsers treat these as same-protocol absolute URLs to evil.example.
    const r = validateDeepLink('//evil.example.com/phish');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('rejects backslash variants', () => {
    const r = validateDeepLink('/foo\\bar');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('rejects javascript: / data: / file: / vbscript:', () => {
    for (const evil of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox',
      'mailto:foo@bar',
      'tel:+49123',
      'ftp://x.com',
    ]) {
      const r = validateDeepLink(evil);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/scheme|malformed|host/);
    }
  });

  it('accepts https URLs on allow-listed hosts', () => {
    const r = validateDeepLink('https://mm-logistic.app/legal/dpa');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://mm-logistic.app/legal/dpa');
  });

  it('rejects https URLs on foreign hosts', () => {
    const r = validateDeepLink('https://evil.example.com/page');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('host');
  });

  it('rejects http:// (downgrade) even on allowed host', () => {
    const r = validateDeepLink('http://mm-logistic.app/page');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('scheme');
  });

  it('matches host case-insensitively', () => {
    expect(validateDeepLink('https://MM-LOGISTIC.APP/x').ok).toBe(true);
  });
});

describe('isSafeDeepLink', () => {
  it('is the boolean shorthand', () => {
    expect(isSafeDeepLink('/x')).toBe(true);
    expect(isSafeDeepLink('javascript:alert(1)')).toBe(false);
  });
});
