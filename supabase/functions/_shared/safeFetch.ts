// K16: hardening for outbound HTTP to user-controlled URLs (webhook-dispatcher).
//
// Threat model: a tenant `company_admin` inserts `webhooks.url` pointing at
// `http://169.254.169.254/latest/meta-data/...` or `http://10.0.0.5/`. The
// dispatcher fetches it server-side and writes up to ~2 KB of the response
// body back into `webhook_deliveries`, which the same admin can read via
// RLS. Net result: cloud-metadata IAM credentials / internal VPC services
// exfiltrate through the platform.
//
// Mitigations layered here:
//   1. Scheme allowlist (https only).
//   2. Reject literal-IP hostnames in private / loopback / link-local /
//      metadata / CG-NAT / multicast / reserved ranges (both IPv4 and IPv6,
//      including IPv4-mapped IPv6 like `::ffff:127.0.0.1`).
//   3. DNS resolve hostname before fetch; reject if ANY resolved address
//      falls into a blocked range.
//   4. `redirect: "manual"` — manually follow up to 3 hops, re-validating
//      every Location header.
//   5. Hard timeout (default 10 s) via AbortSignal.
//
// Known limitation: classic DNS-rebinding (TTL=0, second resolve returns
// 127.0.0.1) is not closed here. Supabase's Edge runtime maintains its own
// DNS cache and the practical attacker needs Deno Deploy egress to reach a
// private target, which the platform's network policy already restricts.

const PRIVATE_IPV4_CIDRS: ReadonlyArray<readonly [number, number]> = [
  // [networkBaseAsUint32, prefixLengthBits]
  [ipv4ToUint32(0, 0, 0, 0), 8],         // current network
  [ipv4ToUint32(10, 0, 0, 0), 8],        // RFC1918
  [ipv4ToUint32(100, 64, 0, 0), 10],     // RFC6598 CG-NAT
  [ipv4ToUint32(127, 0, 0, 0), 8],       // loopback
  [ipv4ToUint32(169, 254, 0, 0), 16],    // link-local + cloud metadata (169.254.169.254)
  [ipv4ToUint32(172, 16, 0, 0), 12],     // RFC1918
  [ipv4ToUint32(192, 0, 0, 0), 24],      // protocol assignments
  [ipv4ToUint32(192, 0, 2, 0), 24],      // TEST-NET-1
  [ipv4ToUint32(192, 168, 0, 0), 16],    // RFC1918
  [ipv4ToUint32(198, 18, 0, 0), 15],     // benchmarking
  [ipv4ToUint32(198, 51, 100, 0), 24],   // TEST-NET-2
  [ipv4ToUint32(203, 0, 113, 0), 24],    // TEST-NET-3
  [ipv4ToUint32(224, 0, 0, 0), 4],       // multicast
  [ipv4ToUint32(240, 0, 0, 0), 4],       // reserved / broadcast
];

function ipv4ToUint32(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function parseIPv4(ip: string): [number, number, number, number] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts: [number, number, number, number] = [+m[1], +m[2], +m[3], +m[4]];
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return parts;
}

export function isBlockedIPv4(ip: string): boolean {
  const parts = parseIPv4(ip);
  if (!parts) return false;
  const n = ipv4ToUint32(parts[0], parts[1], parts[2], parts[3]);
  for (const [base, bits] of PRIVATE_IPV4_CIDRS) {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) === (base & mask)) return true;
  }
  return false;
}

export function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // unique-local fc00::/7
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  // link-local fe80::/10  → first 10 bits = 1111111010xx — covers fe8x..febx
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // IPv4-mapped ::ffff:a.b.c.d → validate the embedded v4
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

export function isBlockedHostLiteral(hostname: string): boolean {
  // hostname may be wrapped in [] for IPv6 in URLs; URL.hostname strips them
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return isBlockedIPv4(hostname);
  }
  if (hostname.includes(":")) {
    return isBlockedIPv6(hostname);
  }
  return false;
}

export class SafeFetchError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

async function resolveAndValidate(hostname: string): Promise<void> {
  // Literal-IP hostnames don't hit DNS — caller already screened them.
  // For names, resolve A + AAAA and reject if ANY address is blocked.
  const lookups = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA"),
  ]);
  const addrs: string[] = [];
  for (const r of lookups) {
    if (r.status === "fulfilled") addrs.push(...r.value);
  }
  if (addrs.length === 0) {
    throw new SafeFetchError(`DNS resolution failed for ${hostname}`, "dns_no_answer");
  }
  for (const a of addrs) {
    if (isBlockedHostLiteral(a)) {
      throw new SafeFetchError(`Host ${hostname} resolved to blocked address`, "blocked_address");
    }
  }
}

function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError("Invalid URL", "invalid_url");
  }
  if (u.protocol !== "https:") {
    throw new SafeFetchError("Only https:// URLs are allowed", "scheme_not_allowed");
  }
  if (!u.hostname) {
    throw new SafeFetchError("URL has no hostname", "no_hostname");
  }
  if (isBlockedHostLiteral(u.hostname)) {
    throw new SafeFetchError("URL hostname is in a blocked range", "blocked_address");
  }
  return u;
}

export interface SafeFetchOptions extends Omit<RequestInit, "redirect" | "signal"> {
  timeoutMs?: number;
  maxRedirects?: number;
}

export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 10_000, maxRedirects = 3, ...init } = opts;
  let current = validateUrl(url);
  let hops = 0;

  while (true) {
    await resolveAndValidate(current.hostname);

    const res = await fetch(current.toString(), {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    // 3xx with Location: re-validate the next hop, do not blindly follow.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      if (hops >= maxRedirects) {
        throw new SafeFetchError("Too many redirects", "too_many_redirects");
      }
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new SafeFetchError("Invalid redirect URL", "invalid_redirect");
      }
      if (next.protocol !== "https:") {
        throw new SafeFetchError("Redirect to non-https URL", "scheme_not_allowed");
      }
      if (isBlockedHostLiteral(next.hostname)) {
        throw new SafeFetchError("Redirect target is in a blocked range", "blocked_address");
      }
      // Drain to free the connection before next hop.
      try { await res.body?.cancel(); } catch { /* ignore */ }
      current = next;
      hops += 1;
      continue;
    }

    return res;
  }
}
