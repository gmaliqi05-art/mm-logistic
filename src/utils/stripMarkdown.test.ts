import { describe, expect, it } from 'vitest';
import { stripMarkdown } from './stripMarkdown';

describe('stripMarkdown', () => {
  it('returns empty for empty input', () => {
    expect(stripMarkdown('')).toBe('');
    expect(stripMarkdown(null)).toBe('');
    expect(stripMarkdown(undefined)).toBe('');
  });

  it('removes bold/italic markers but keeps the words', () => {
    expect(stripMarkdown('**Klasse B në stok.**')).toBe('Klasse B në stok.');
    expect(stripMarkdown('kemi **378** copë')).toBe('kemi 378 copë');
    expect(stripMarkdown('this is *important* text')).toBe('this is important text');
    expect(stripMarkdown('__bold__ and _italic_')).toBe('bold and italic');
  });

  it('handles the real reply from the screenshot', () => {
    const raw = '**Klasse B në stok.** – **Depo Qendrore** 378 copë (gjendje e mirë). Kjo është e gjithë stoku ynë i **Klasse B**.';
    const out = stripMarkdown(raw);
    expect(out).not.toContain('*');
    expect(out).toContain('Klasse B në stok.');
    expect(out).toContain('378 copë');
    expect(out).toContain('Depo Qendrore');
  });

  it('strips headings, bullets and blockquotes', () => {
    expect(stripMarkdown('# Title')).toBe('Title');
    expect(stripMarkdown('- one\n- two')).toBe('one\ntwo');
    expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond');
    expect(stripMarkdown('> quoted')).toBe('quoted');
  });

  it('converts links to their text and strips code ticks', () => {
    expect(stripMarkdown('see [the report](https://x.y/z)')).toBe('see the report');
    expect(stripMarkdown('run `npm test` now')).toBe('run npm test now');
  });

  it('leaves plain text untouched', () => {
    expect(stripMarkdown('Keni 475 Klasse A në stok.')).toBe('Keni 475 Klasse A në stok.');
  });
});
