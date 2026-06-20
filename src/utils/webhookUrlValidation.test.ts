import { describe, expect, it } from 'vitest';
import { validateWebhookUrl } from './webhookUrlValidation';

describe('validateWebhookUrl', () => {
  it('accepts ordinary https URLs', () => {
    for (const url of [
      'https://hooks.zapier.com/abcd',
      'https://example.com/webhooks/mm',
      'https://api.example.com:8443/path?q=1&r=2',
      'https://sub.domain.co.uk/x',
    ]) {
      expect(validateWebhookUrl(url)).toEqual({ valid: true });
    }
  });

  it('rejects http (must mirror the DB constraint `webhooks_url_https_only`)', () => {
    expect(validateWebhookUrl('http://example.com/x')).toEqual({ valid: false, reason: 'not_https' });
  });

  it('rejects non-http schemes', () => {
    for (const url of ['ftp://evil/x', 'file:///etc/passwd', 'gopher://x', 'javascript:alert(1)']) {
      expect(validateWebhookUrl(url).valid).toBe(false);
    }
  });

  it('rejects whitespace anywhere in the URL (CRLF / header smuggling defense)', () => {
    expect(validateWebhookUrl('https://example.com/x y')).toEqual({ valid: false, reason: 'has_whitespace' });
    expect(validateWebhookUrl('https://example.com/x\ny')).toEqual({ valid: false, reason: 'has_whitespace' });
    expect(validateWebhookUrl('https://example.com/x\r\nHost: attacker')).toEqual({ valid: false, reason: 'has_whitespace' });
    expect(validateWebhookUrl('https://example.com/x\ty')).toEqual({ valid: false, reason: 'has_whitespace' });
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateWebhookUrl('')).toEqual({ valid: false, reason: 'empty' });
    expect(validateWebhookUrl('   ')).toEqual({ valid: false, reason: 'empty' });
  });

  it('rejects obvious loopback / RFC1918 / link-local hostnames', () => {
    for (const url of [
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://127.42.7.1/x',
      'https://0.0.0.0/x',
      'https://10.0.0.5/x',
      'https://192.168.1.10/x',
      'https://169.254.169.254/latest/meta-data/',
      'https://172.16.0.1/x',
      'https://172.31.255.255/x',
    ]) {
      expect(validateWebhookUrl(url)).toEqual({ valid: false, reason: 'blocked_host' });
    }
  });

  it('does not block legitimate public IPs that happen to share the 172 prefix outside RFC1918', () => {
    expect(validateWebhookUrl('https://172.15.0.1/x')).toEqual({ valid: true });
    expect(validateWebhookUrl('https://172.32.0.1/x')).toEqual({ valid: true });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateWebhookUrl('  https://example.com/x  ')).toEqual({ valid: true });
  });

  it('matches the DB regex `^https://[^\\s]+$` exactly for the same inputs', () => {
    const dbRegex = /^https:\/\/[^\s]+$/;
    const cases = [
      'https://x.example.com',
      'https://x.example.com/path?q=1',
      'http://example.com/x',
      'https:// example.com',
      'https://example.com/x y',
      'ftp://x',
    ];
    for (const c of cases) {
      const dbOk = dbRegex.test(c);
      const clientResult = validateWebhookUrl(c);
      if (dbOk) {
        const hostname = (() => { try { return new URL(c).hostname; } catch { return ''; } })();
        const isLocal = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
        if (!isLocal) expect(clientResult.valid).toBe(true);
      } else {
        expect(clientResult.valid).toBe(false);
      }
    }
  });
});
