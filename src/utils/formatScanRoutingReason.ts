// Routing reasons come back from the `scan-document` edge function as
// structured parts (code + optional params) plus a flat Albanian string
// fallback. This formatter resolves the parts through `t()` for any
// locale and substitutes `{name}` placeholders. Older payloads that
// only carry the flat `match_reason` string fall through unchanged.

export interface ScanReasonPart {
  code: string;
  params?: { name?: string };
}

type Translator = (key: string) => string;

export function formatScanRoutingReason(
  parts: ScanReasonPart[] | undefined | null,
  fallback: string | undefined | null,
  t: Translator,
): string {
  if (parts && parts.length > 0) {
    const resolved = parts
      .map((part) => {
        const template = t(`scanner.routing.${part.code}`);
        // getNestedValue() returns the key itself when missing; if so,
        // fall back to whatever the server sent in the legacy string.
        if (!template || template === `scanner.routing.${part.code}`) return '';
        const name = part.params?.name;
        return name ? template.replace('{name}', name) : template;
      })
      .filter(Boolean);
    if (resolved.length > 0) return resolved.join('. ');
  }
  return fallback ?? '';
}
