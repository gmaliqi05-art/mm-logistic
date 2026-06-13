import { describe, expect, it } from 'vitest';
import {
  isVatExempt,
  effectiveVatRate,
  defaultVatTreatmentFor,
  vatTreatmentNoteKey,
} from './vatTreatment';

describe('isVatExempt', () => {
  it('treats standard as non-exempt', () => {
    expect(isVatExempt('standard')).toBe(false);
  });

  it('treats the four special treatments as exempt', () => {
    expect(isVatExempt('reverse_charge')).toBe(true);
    expect(isVatExempt('exempt')).toBe(true);
    expect(isVatExempt('sachdarlehen')).toBe(true);
    expect(isVatExempt('schadenersatz')).toBe(true);
  });

  it('treats null/undefined as non-exempt (back-compat)', () => {
    expect(isVatExempt(null)).toBe(false);
    expect(isVatExempt(undefined)).toBe(false);
  });
});

describe('effectiveVatRate', () => {
  it('returns the item rate for standard treatment', () => {
    expect(effectiveVatRate({ vat_rate: 19, vat_treatment: 'standard' })).toBe(19);
    expect(effectiveVatRate({ vat_rate: 7, vat_treatment: 'standard' })).toBe(7);
  });

  it('returns 0 for every exempt treatment regardless of stored rate', () => {
    expect(effectiveVatRate({ vat_rate: 19, vat_treatment: 'sachdarlehen' })).toBe(0);
    expect(effectiveVatRate({ vat_rate: 19, vat_treatment: 'reverse_charge' })).toBe(0);
    expect(effectiveVatRate({ vat_rate: 7, vat_treatment: 'exempt' })).toBe(0);
    expect(effectiveVatRate({ vat_rate: 19, vat_treatment: 'schadenersatz' })).toBe(0);
  });

  it('falls back to vat_rate when treatment is null/undefined', () => {
    expect(effectiveVatRate({ vat_rate: 19, vat_treatment: null })).toBe(19);
    expect(effectiveVatRate({ vat_rate: 19 })).toBe(19);
  });
});

describe('defaultVatTreatmentFor', () => {
  it('keeps standard for deposit partners regardless of line type', () => {
    expect(defaultVatTreatmentFor('deposit', 'pallet_exchange')).toBe('standard');
    expect(defaultVatTreatmentFor('deposit', 'pallet_deposit')).toBe('standard');
    expect(defaultVatTreatmentFor('deposit', 'transport')).toBe('standard');
    expect(defaultVatTreatmentFor('deposit', null)).toBe('standard');
  });

  it('routes pallet_exchange lines to sachdarlehen for exchange partners', () => {
    expect(defaultVatTreatmentFor('exchange', 'pallet_exchange')).toBe('sachdarlehen');
  });

  it('keeps handling and transport taxable even for exchange partners', () => {
    // BMF v. 05.11.2013: only the pallet swap itself is Sachdarlehen;
    // handling fees and rental keep 19% VAT.
    expect(defaultVatTreatmentFor('exchange', 'handling')).toBe('standard');
    expect(defaultVatTreatmentFor('exchange', 'transport')).toBe('standard');
    expect(defaultVatTreatmentFor('exchange', 'goods')).toBe('standard');
  });
});

describe('vatTreatmentNoteKey', () => {
  it('returns null for standard / missing treatment', () => {
    expect(vatTreatmentNoteKey('standard')).toBeNull();
    expect(vatTreatmentNoteKey(null)).toBeNull();
    expect(vatTreatmentNoteKey(undefined)).toBeNull();
  });

  it('returns a stable key per exempt treatment', () => {
    expect(vatTreatmentNoteKey('reverse_charge')).toBe(
      'accounting.vatTreatment.notes.reverse_charge',
    );
    expect(vatTreatmentNoteKey('sachdarlehen')).toBe(
      'accounting.vatTreatment.notes.sachdarlehen',
    );
    expect(vatTreatmentNoteKey('schadenersatz')).toBe(
      'accounting.vatTreatment.notes.schadenersatz',
    );
    expect(vatTreatmentNoteKey('exempt')).toBe(
      'accounting.vatTreatment.notes.exempt',
    );
  });
});
