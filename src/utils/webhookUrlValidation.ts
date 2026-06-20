// K16 — client-side companion to the DB constraint `webhooks_url_https_only`
// and the edge-function SSRF guard in `supabase/functions/_shared/safeFetch.ts`.
//
// The regex MUST stay in sync with `webhooks_url_https_only` in
// `supabase/migrations/20260620100000_webhooks_url_https_only.sql` so the
// frontend rejects the same set of strings the database does — otherwise
// a user gets an opaque pg `check_violation` error after submit.

const HTTPS_NO_WHITESPACE = /^https:\/\/[^\s]+$/;

// Hostname patterns blocked at form-time. Server-side `safeFetch` does the
// authoritative check (DNS resolve + CIDR match across IPv4/IPv6); this is a
// usability layer that catches obvious mistakes like `http://localhost` or
// `https://192.168.1.10/x` before the dispatcher ever sees them.
const OBVIOUS_LOCAL_HOSTNAME =
  /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|\[?::1\]?|\[?::\]?)$/i;

export type WebhookUrlValidation =
  | { valid: true }
  | { valid: false; reason: 'empty' | 'not_https' | 'has_whitespace' | 'invalid_url' | 'blocked_host' };

export function validateWebhookUrl(raw: string): WebhookUrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, reason: 'empty' };
  if (/\s/.test(trimmed)) return { valid: false, reason: 'has_whitespace' };
  if (!HTTPS_NO_WHITESPACE.test(trimmed)) {
    return { valid: false, reason: trimmed.toLowerCase().startsWith('https://') ? 'invalid_url' : 'not_https' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
  if (OBVIOUS_LOCAL_HOSTNAME.test(parsed.hostname)) {
    return { valid: false, reason: 'blocked_host' };
  }
  return { valid: true };
}
