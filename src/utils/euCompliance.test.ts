import { describe, expect, it } from 'vitest';
import { buildVatBreakdown } from './euCompliance';

describe('buildVatBreakdown', () => {
  it('aggregates a single standard-rate line as before (back-compat)', () => {
    const rows = buildVatBreakdown([{ net: 100, vat_rate: 19 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ rate: 19, category: 'S', net: 100, vat: 19, gross: 119 });
  });

  it('groups multiple lines with the same rate + category', () => {
    const rows = buildVatBreakdown([
      { net: 100, vat_rate: 19 },
      { net: 200, vat_rate: 19 },
      { net: 50, vat_rate: 7 },
    ]);
    expect(rows).toHaveLength(2);
    const row19 = rows.find((r) => r.rate === 19)!;
    const row7 = rows.find((r) => r.rate === 7)!;
    expect(row19.net).toBe(300);
    expect(row19.vat).toBe(57);
    expect(row7.net).toBe(50);
    expect(row7.vat).toBe(3.5);
  });

  it('forces effective rate to 0 for sachdarlehen treatment', () => {
    const rows = buildVatBreakdown([
      { net: 100, vat_rate: 19, vat_treatment: 'sachdarlehen' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ rate: 0, category: 'S', net: 100, vat: 0, gross: 100 });
  });

  it('keeps standard-treatment lines taxable alongside exempt ones', () => {
    // Realistic Tausch invoice: pallet swap (sachdarlehen, no VAT) +
    // handling fee (standard, 19% VAT).
    const rows = buildVatBreakdown([
      { net: 500, vat_rate: 19, vat_treatment: 'sachdarlehen' },
      { net: 50, vat_rate: 19, vat_treatment: 'standard' },
    ]);
    expect(rows).toHaveLength(2);
    const exemptRow = rows.find((r) => r.rate === 0)!;
    const standardRow = rows.find((r) => r.rate === 19)!;
    expect(exemptRow.net).toBe(500);
    expect(exemptRow.vat).toBe(0);
    expect(standardRow.net).toBe(50);
    expect(standardRow.vat).toBe(9.5);
  });

  it('treats reverse_charge, exempt, schadenersatz the same as sachdarlehen', () => {
    const rows = buildVatBreakdown([
      { net: 100, vat_rate: 19, vat_treatment: 'reverse_charge' },
      { net: 100, vat_rate: 19, vat_treatment: 'exempt' },
      { net: 100, vat_rate: 19, vat_treatment: 'schadenersatz' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ rate: 0, category: 'S', net: 300, vat: 0, gross: 300 });
  });

  it('falls back to vat_rate when vat_treatment is missing or null', () => {
    const rows = buildVatBreakdown([
      { net: 100, vat_rate: 19, vat_treatment: null },
      { net: 100, vat_rate: 19 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].vat).toBe(38);
  });

  it('respects vat_category when grouping (S vs Z)', () => {
    const rows = buildVatBreakdown([
      { net: 100, vat_rate: 19, vat_category: 'S' },
      { net: 100, vat_rate: 19, vat_category: 'Z' },
    ]);
    expect(rows).toHaveLength(2);
  });
});
