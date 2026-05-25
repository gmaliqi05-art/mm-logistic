import { describe, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sq } from './sq';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { legalTranslations } from './legal';

// Recursively walk src/ collecting every file path under .ts/.tsx
// (excluding tests, the i18n folder itself, and node_modules).
function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.bolt') continue;
      walk(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    if (full.includes('/i18n/')) continue;
    out.push(full);
  }
  return out;
}

// Collect static `t('foo.bar.baz')` and `tRaw('foo.bar.baz')` calls.
// Skips template literals (`t(\`foo\`)`) and variable keys (`t(k)`).
function extractKeys(source: string): string[] {
  const re = /\b(?:t|tRaw)\(\s*['"]([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"]/g;
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) keys.add(m[1]);
  return Array.from(keys);
}

function resolveKey(root: Record<string, unknown>, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const SRC = resolve(__dirname, '..');

const tables = {
  sq: { ...sq, legal: legalTranslations.sq } as unknown as Record<string, unknown>,
  en: { ...en, legal: legalTranslations.en } as unknown as Record<string, unknown>,
  de: { ...de, legal: legalTranslations.de } as unknown as Record<string, unknown>,
  fr: { ...fr, legal: legalTranslations.fr } as unknown as Record<string, unknown>,
};

describe('i18n key existence', () => {
  const files = walk(SRC, []);
  const allKeys = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const k of extractKeys(source)) allKeys.add(k);
  }

  it('every t() / tRaw() key resolves to a string in sq.ts (source-of-truth)', () => {
    const missing: string[] = [];
    for (const key of allKeys) {
      const val = resolveKey(tables.sq, key);
      if (typeof val !== 'string') missing.push(key);
    }
    if (missing.length > 0) {
      throw new Error(
        `i18n keys present in src/ but missing from sq.ts (showing up to 30):\n  ${missing.slice(0, 30).join('\n  ')}\n` +
          (missing.length > 30 ? `  ...and ${missing.length - 30} more` : ''),
      );
    }
  });

  // Stricter follow-up: every key that resolves in sq must also
  // resolve in en/de/fr. Catches silent drift when sq grows but the
  // other locales don't get the matching entry.
  for (const lang of ['en', 'de', 'fr'] as const) {
    it(`every sq key resolves in ${lang}.ts`, () => {
      const missing: string[] = [];
      for (const key of allKeys) {
        if (typeof resolveKey(tables.sq, key) !== 'string') continue;
        if (typeof resolveKey(tables[lang], key) !== 'string') missing.push(key);
      }
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} key(s) defined in sq.ts but missing from ${lang}.ts (showing up to 30):\n  ${missing.slice(0, 30).join('\n  ')}`,
        );
      }
    });
  }
});
