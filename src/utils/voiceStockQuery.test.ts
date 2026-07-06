import { describe, expect, it } from 'vitest';
import { interpretStockQuestion, type VoiceStockRow } from './voiceStockQuery';

const ROWS: VoiceStockRow[] = [
  { depotName: 'Depo Qendrore', productName: 'Klasse A', condition: 'good', quantity: 375 },
  { depotName: 'Depo Veriore', productName: 'Klasse A', condition: 'good', quantity: 100 },
  { depotName: 'Depo Qendrore', productName: 'Klasse B', condition: 'good', quantity: 378 },
  { depotName: 'Depo Qendrore', productName: 'Klasse C', condition: 'good', quantity: 159 },
  { depotName: 'Depo Qendrore', productName: 'Euro Pallet EPAL', condition: 'good', quantity: 428 },
  { depotName: 'Depo Qendrore', productName: 'Kunststoffmehrwegpalette H1', condition: 'good', quantity: 352 },
];

describe('interpretStockQuestion', () => {
  it('returns unknown for empty input', () => {
    expect(interpretStockQuestion('', ROWS).kind).toBe('unknown');
    expect(interpretStockQuestion(null, ROWS).kind).toBe('unknown');
  });

  it("answers the owner's example: how many A-class euro pallets", () => {
    const r = interpretStockQuestion('me trego sa europaleta A Clase kemi ne stok', ROWS);
    expect(r.kind).toBe('product_total');
    if (r.kind === 'product_total') {
      expect(r.product).toBe('Klasse A');
      expect(r.quantity).toBe(475); // 375 + 100 across depots
      expect(r.byDepot[0]).toEqual({ depot: 'Depo Qendrore', quantity: 375 });
    }
  });

  it('detects the class letter in several phrasings and languages', () => {
    for (const q of ['sa Klasse B kemi', 'how many class B', 'wie viele B-Klasse', 'combien de classe B']) {
      const r = interpretStockQuestion(q, ROWS);
      expect(r.kind).toBe('product_total');
      if (r.kind === 'product_total') expect(r.product).toBe('Klasse B');
    }
  });

  it('sums a class across all depots', () => {
    const r = interpretStockQuestion('sa Klasse A kemi', ROWS);
    if (r.kind === 'product_total') {
      expect(r.quantity).toBe(475);
      expect(r.byDepot).toHaveLength(2);
    }
  });

  it('matches a named product (euro pallet / kunststoff)', () => {
    const a = interpretStockQuestion('sa euro pallet kemi', ROWS);
    expect(a.kind).toBe('product_total');
    if (a.kind === 'product_total') expect(a.product).toBe('Euro Pallet EPAL');

    const b = interpretStockQuestion('kunststoff sa kemi', ROWS);
    if (b.kind === 'product_total') expect(b.product).toBe('Kunststoffmehrwegpalette H1');
  });

  it('does not confuse a class letter with a plain word containing that letter', () => {
    // "banane" contains 'a'/'b'/'c' letters but no class context -> not a class match
    const r = interpretStockQuestion('a banane kemi', ROWS);
    // "a" here is a standalone token but no klas/clas word, so no class letter;
    // and no product token matches -> unknown (or grand-total if it had stock words)
    expect(r.kind).not.toBe('product_total');
  });

  it('answers a grand-total question', () => {
    const r = interpretStockQuestion('sa palet kemi gjithsej', ROWS);
    expect(r.kind).toBe('grand_total');
    if (r.kind === 'grand_total') expect(r.quantity).toBe(375 + 100 + 378 + 159 + 428 + 352);
  });

  it('returns unknown when nothing matches', () => {
    expect(interpretStockQuestion('sa mot bon neser', ROWS).kind).toBe('unknown');
  });
});
