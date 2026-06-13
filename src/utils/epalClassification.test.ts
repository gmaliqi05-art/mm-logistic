import { describe, expect, it } from 'vitest';
import type { StockCondition } from '../types';
import {
  qualityClassFor,
  conditionForQualityClass,
  isExchangeable,
  isDamageLike,
  isInProcess,
} from './epalClassification';

const ALL_CONDITIONS: StockCondition[] = [
  'good',
  'damaged',
  'repaired',
  'sorting',
  'sorting_pending',
];

describe('qualityClassFor', () => {
  it('maps every StockCondition deterministically', () => {
    // Exhaustiveness check — if a new StockCondition is added, this
    // test forces us to decide how it maps to EPAL.
    for (const c of ALL_CONDITIONS) {
      const qc = qualityClassFor(c);
      expect(qc).toMatch(/^(NEU|A|B|C|UNSORTED|REPAIR_NEEDED|SCRAP)$/);
    }
  });

  it('maps good and sorting buckets to UNSORTED', () => {
    expect(qualityClassFor('good')).toBe('UNSORTED');
    expect(qualityClassFor('sorting')).toBe('UNSORTED');
    expect(qualityClassFor('sorting_pending')).toBe('UNSORTED');
  });

  it('maps damaged to REPAIR_NEEDED', () => {
    expect(qualityClassFor('damaged')).toBe('REPAIR_NEEDED');
  });

  it('maps repaired to B (post-repair default)', () => {
    expect(qualityClassFor('repaired')).toBe('B');
  });
});

describe('conditionForQualityClass', () => {
  it('maps EPAL ledger grades back to operational good', () => {
    expect(conditionForQualityClass('A')).toBe('good');
    expect(conditionForQualityClass('B')).toBe('good');
    expect(conditionForQualityClass('C')).toBe('good');
    expect(conditionForQualityClass('NEU')).toBe('good');
    expect(conditionForQualityClass('UNSORTED')).toBe('good');
  });

  it('maps Defekt / repair / scrap to damaged', () => {
    expect(conditionForQualityClass('Defekt')).toBe('damaged');
    expect(conditionForQualityClass('REPAIR_NEEDED')).toBe('damaged');
    expect(conditionForQualityClass('SCRAP')).toBe('damaged');
  });
});

describe('isExchangeable', () => {
  it('treats good and repaired as exchangeable', () => {
    expect(isExchangeable('good')).toBe(true);
    expect(isExchangeable('repaired')).toBe(true);
  });

  it('treats damaged and in-process buckets as non-exchangeable', () => {
    expect(isExchangeable('damaged')).toBe(false);
    expect(isExchangeable('sorting')).toBe(false);
    expect(isExchangeable('sorting_pending')).toBe(false);
  });
});

describe('isDamageLike', () => {
  it('returns true only for damaged today', () => {
    // Today only 'damaged' is damage-like, but the helper is the
    // forward-compatible hook for future additions (e.g. 'awaiting_scrap').
    // Updating this fn alone keeps stock-alerts/reports correct.
    expect(isDamageLike('damaged')).toBe(true);
  });

  it('rejects every non-damage condition', () => {
    expect(isDamageLike('good')).toBe(false);
    expect(isDamageLike('repaired')).toBe(false);
    expect(isDamageLike('sorting')).toBe(false);
    expect(isDamageLike('sorting_pending')).toBe(false);
  });
});

describe('isInProcess', () => {
  it('flags sorting buckets', () => {
    expect(isInProcess('sorting')).toBe(true);
    expect(isInProcess('sorting_pending')).toBe(true);
  });

  it('does not flag terminal buckets', () => {
    expect(isInProcess('good')).toBe(false);
    expect(isInProcess('damaged')).toBe(false);
    expect(isInProcess('repaired')).toBe(false);
  });
});
