/**
 * Deep-link URL validation used by push notification authoring +
 * homepage CMS link fields. Audit findings K14 + #10.
 *
 * The product expects deep-link strings to be one of:
 *   - relative app path starting with "/" (e.g., "/company/deliveries")
 *   - absolute https:// URL on an allow-listed brand domain
 *
 * Disallowed schemes — these are the actual attack surface:
 *   - javascript:    → XSS the moment the recipient taps the
 *                      notification action
 *   - data:          → can ship inline HTML/JS via the client
 *                      router or system browser
 *   - file: / blob:  → arbitrary local resource pointer
 *   - vbscript:      → legacy XSS on some webviews
 *   - any non-https  scheme (mailto:, tel:, ftp: …) — explicitly
 *                    NOT supported here so future schemes get the
 *                    safe default of "blocked".
 *
 * The allow-list of https hosts is conservative: just our public
 * brand domain plus the Supabase project domain. Operators who
 * legitimately need to link to a third-party page can switch the
 * notification to a long-form message; deep-linking outside the
 * product is intentionally not a feature.
 */

const ALLOWED_HTTPS_HOSTS = new Set<string>([
  "mm-logistic.app",
  "www.mm-logistic.app",
  "jitgvwtmufqrqyogdlxu.supabase.co",
]);

export type DeepLinkVerdict =
  | { ok: true; normalized: string }
  | { ok: false; reason: "empty" | "scheme" | "host" | "malformed" };

export function validateDeepLink(raw: string | null | undefined): DeepLinkVerdict {
  const s = (raw ?? "").trim();
  if (!s) return { ok: false, reason: "empty" };

  // Relative path — the common case. Must start with "/" so the
  // client router treats it as an in-app navigation. Reject "//"
  // (protocol-relative URL) and backslash variants that some
  // routers normalise to the public web.
  if (s.startsWith("/") && !s.startsWith("//")) {
    if (/\\/.test(s)) return { ok: false, reason: "malformed" };
    return { ok: true, normalized: s };
  }

  // Absolute URL — must be https on an allow-listed host.
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "https") return { ok: false, reason: "scheme" };

  const host = parsed.host.toLowerCase();
  if (!ALLOWED_HTTPS_HOSTS.has(host)) return { ok: false, reason: "host" };

  // Re-serialise so the stored form is canonical.
  return { ok: true, normalized: parsed.toString() };
}

/** Convenience: true when the URL is something we'd be willing to
 *  put in a push notification or a homepage CMS link field. */
export function isSafeDeepLink(raw: string | null | undefined): boolean {
  return validateDeepLink(raw).ok;
}
