import { describe, it, expect } from 'vitest';
import { isStopCommand } from './voiceCommands';

describe('isStopCommand', () => {
  it('detects the Albanian stop words', () => {
    expect(isStopCommand('ndalu', 'sq')).toBe(true);
    expect(isStopCommand('Ndalu!', 'sq')).toBe(true);
    expect(isStopCommand('mjaft', 'sq')).toBe(true);
    expect(isStopCommand('pusho', 'sq')).toBe(true);
  });

  it('detects stop words in the other languages', () => {
    expect(isStopCommand('stop', 'en')).toBe(true);
    expect(isStopCommand('enough', 'en')).toBe(true);
    expect(isStopCommand('halt', 'de')).toBe(true);
    expect(isStopCommand('arrête', 'fr')).toBe(true);
    expect(isStopCommand('arrete', 'fr')).toBe(true);
  });

  it('allows a short lead-in word', () => {
    expect(isStopCommand('hey stop', 'en')).toBe(true);
    expect(isStopCommand('ok ndalu', 'sq')).toBe(true);
  });

  it('accepts English "stop" in any language (universal command)', () => {
    expect(isStopCommand('stop', 'sq')).toBe(true);
    expect(isStopCommand('stop', 'de')).toBe(true);
  });

  it('does NOT trip on a real question that merely mentions the word', () => {
    expect(isStopCommand('sa paleta kemi ne stok', 'sq')).toBe(false);
    expect(isStopCommand('where is the stop for the truck route', 'en')).toBe(false);
    expect(isStopCommand('me trego porosine e fundit', 'sq')).toBe(false);
  });

  it('handles empty input', () => {
    expect(isStopCommand('', 'sq')).toBe(false);
    expect(isStopCommand('   ', 'en')).toBe(false);
  });
});
