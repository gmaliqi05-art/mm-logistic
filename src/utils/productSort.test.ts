import { describe, expect, it } from 'vitest';
import {
  classifyEuroPaletteProduct,
  compareCategoriesByPriority,
  compareProducts,
  epalClassRank,
  isEuroPaletteCategory,
  isEuroPaletteName,
  isNewPalletProduct,
} from './productSort';

describe('isEuroPaletteName', () => {
  it('returns false for empty input', () => {
    expect(isEuroPaletteName(null)).toBe(false);
    expect(isEuroPaletteName(undefined)).toBe(false);
    expect(isEuroPaletteName('')).toBe(false);
    expect(isEuroPaletteName('   ')).toBe(false);
  });

  it('recognises the EUR word as a whole token', () => {
    expect(isEuroPaletteName('EUR Pallet')).toBe(true);
    expect(isEuroPaletteName('eur')).toBe(true);
  });

  it('does not match EUR as substring of other words', () => {
    expect(isEuroPaletteName('Europalette')).toBe(true); // hits "europalette" pattern
    expect(isEuroPaletteName('Eurasia')).toBe(false); // no whole-word eur, no priority pattern
  });

  it('matches common euro-pallet variations', () => {
    expect(isEuroPaletteName('Euro Pallet')).toBe(true);
    expect(isEuroPaletteName('EPAL')).toBe(true);
    expect(isEuroPaletteName('UIC pallet')).toBe(true);
    expect(isEuroPaletteName('euro-pal')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isEuroPaletteName('EURO PALLET')).toBe(true);
    expect(isEuroPaletteName('Epal')).toBe(true);
  });
});

describe('isEuroPaletteCategory', () => {
  it('returns false for nullish category', () => {
    expect(isEuroPaletteCategory(null)).toBe(false);
    expect(isEuroPaletteCategory(undefined)).toBe(false);
  });

  it('matches by category name', () => {
    expect(isEuroPaletteCategory({ name: 'Euro Pallets' })).toBe(true);
    expect(isEuroPaletteCategory({ name: 'Random' })).toBe(false);
  });

  it('matches by alias when name does not match', () => {
    expect(isEuroPaletteCategory({ name: 'Pallets', aliases: ['EPAL'] })).toBe(true);
  });

  it('handles missing aliases array gracefully', () => {
    expect(isEuroPaletteCategory({ name: 'Random' })).toBe(false);
    expect(isEuroPaletteCategory({ name: 'Random', aliases: null })).toBe(false);
  });
});

describe('isNewPalletProduct', () => {
  it('matches Albanian "e re" / "e-re"', () => {
    expect(isNewPalletProduct('paleta e re')).toBe(true);
    expect(isNewPalletProduct('Paleta e-re')).toBe(true);
  });

  it('matches German "neu"', () => {
    expect(isNewPalletProduct('Palette neu')).toBe(true);
  });

  it('matches English "new"', () => {
    expect(isNewPalletProduct('New pallet')).toBe(true);
  });

  it('returns false for non-new products', () => {
    expect(isNewPalletProduct('Klasse A')).toBe(false);
    expect(isNewPalletProduct(null)).toBe(false);
    expect(isNewPalletProduct('')).toBe(false);
  });
});

describe('epalClassRank', () => {
  it('ranks "new" products as 0', () => {
    expect(epalClassRank('Paleta e re')).toBe(0);
  });

  it('ranks Klasse A / Class A as 1', () => {
    expect(epalClassRank('EPAL Klasse A')).toBe(1);
    expect(epalClassRank('Class A pallet')).toBe(1);
  });

  it('ranks Klasse B / Class B as 2', () => {
    expect(epalClassRank('Class B')).toBe(2);
  });

  it('ranks Klasse C / Class C as 3', () => {
    expect(epalClassRank('Klasse C')).toBe(3);
  });

  it('ranks defective products as 4', () => {
    expect(epalClassRank('Defekt')).toBe(4);
    expect(epalClassRank('Damaged pallet')).toBe(4);
    expect(epalClassRank('te demtuara')).toBe(4);
  });

  it('returns 0 for euro-pallet name without explicit class marker', () => {
    expect(epalClassRank('Euro Pallet')).toBe(0);
  });

  it('returns 5 for unknown product names', () => {
    expect(epalClassRank('Random Box')).toBe(5);
  });

  it('returns 10 for empty input', () => {
    expect(epalClassRank('')).toBe(10);
    expect(epalClassRank(null)).toBe(10);
  });
});

describe('classifyEuroPaletteProduct', () => {
  it('maps each rank to its label', () => {
    expect(classifyEuroPaletteProduct('Paleta e re')).toBe('new');
    expect(classifyEuroPaletteProduct('Klasse A')).toBe('a');
    expect(classifyEuroPaletteProduct('Klasse B')).toBe('b');
    expect(classifyEuroPaletteProduct('Klasse C')).toBe('c');
    expect(classifyEuroPaletteProduct('Defekt')).toBe('defekt');
    expect(classifyEuroPaletteProduct('Random Box')).toBe('unknown');
  });
});

describe('compareCategoriesByPriority', () => {
  it('puts euro-pallet categories before others', () => {
    expect(compareCategoriesByPriority('Random', 'Euro Pallets')).toBeGreaterThan(0);
    expect(compareCategoriesByPriority('EPAL', 'Random')).toBeLessThan(0);
  });

  it('sorts alphabetically within same priority', () => {
    expect(compareCategoriesByPriority('Boxes', 'Crates')).toBeLessThan(0);
    expect(compareCategoriesByPriority('Crates', 'Boxes')).toBeGreaterThan(0);
  });
});

describe('compareProducts', () => {
  type P = { cat: string; name: string };
  const getCat = (p: P) => p.cat;
  const getName = (p: P) => p.name;

  it('places euro-pallet categories first', () => {
    const a: P = { cat: 'Random', name: 'Box' };
    const b: P = { cat: 'EPAL', name: 'Klasse A' };
    expect(compareProducts(a, b, getCat, getName)).toBeGreaterThan(0);
  });

  it('within same category, sorts by EPAL class rank', () => {
    const a: P = { cat: 'EPAL', name: 'Klasse B' };
    const b: P = { cat: 'EPAL', name: 'Klasse A' };
    expect(compareProducts(a, b, getCat, getName)).toBeGreaterThan(0);
  });

  it('within same category and rank, sorts alphabetically by name', () => {
    const a: P = { cat: 'Boxes', name: 'Zeta' };
    const b: P = { cat: 'Boxes', name: 'Alpha' };
    expect(compareProducts(a, b, getCat, getName)).toBeGreaterThan(0);
  });
});
