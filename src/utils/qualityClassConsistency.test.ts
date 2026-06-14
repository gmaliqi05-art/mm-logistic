import { describe, it, expect } from 'vitest';
import {
  allowedQualityClassesFor,
  isQualityClassConsistent,
} from './qualityClassConsistency';

describe('isQualityClassConsistent', () => {
  it('accepts NULL/empty quality_class for any condition (unclassified)', () => {
    for (const cond of ['good', 'damaged', 'sorting', 'ready_a', 'ready_b', 'ready_c']) {
      expect(isQualityClassConsistent(cond, null)).toBe(true);
      expect(isQualityClassConsistent(cond, undefined)).toBe(true);
      expect(isQualityClassConsistent(cond, '')).toBe(true);
    }
  });

  it('good accepts NEU, A, B, C, UNSORTED', () => {
    for (const qc of ['NEU', 'A', 'B', 'C', 'UNSORTED']) {
      expect(isQualityClassConsistent('good', qc)).toBe(true);
    }
  });

  it('good rejects damage-side grades', () => {
    expect(isQualityClassConsistent('good', 'REPAIR_NEEDED')).toBe(false);
    expect(isQualityClassConsistent('good', 'SCRAP')).toBe(false);
  });

  it('damaged accepts REPAIR_NEEDED and SCRAP only', () => {
    expect(isQualityClassConsistent('damaged', 'REPAIR_NEEDED')).toBe(true);
    expect(isQualityClassConsistent('damaged', 'SCRAP')).toBe(true);
    for (const qc of ['NEU', 'A', 'B', 'C', 'UNSORTED']) {
      expect(isQualityClassConsistent('damaged', qc)).toBe(false);
    }
  });

  it('sorting accepts UNSORTED only', () => {
    expect(isQualityClassConsistent('sorting', 'UNSORTED')).toBe(true);
    for (const qc of ['NEU', 'A', 'B', 'C', 'REPAIR_NEEDED', 'SCRAP']) {
      expect(isQualityClassConsistent('sorting', qc)).toBe(false);
    }
  });

  it('ready_a / ready_b / ready_c each accept exactly their matching grade', () => {
    expect(isQualityClassConsistent('ready_a', 'A')).toBe(true);
    expect(isQualityClassConsistent('ready_a', 'B')).toBe(false);
    expect(isQualityClassConsistent('ready_b', 'B')).toBe(true);
    expect(isQualityClassConsistent('ready_b', 'C')).toBe(false);
    expect(isQualityClassConsistent('ready_c', 'C')).toBe(true);
    expect(isQualityClassConsistent('ready_c', 'A')).toBe(false);
  });

  it('rejects unknown / null conditions when a grade is present', () => {
    expect(isQualityClassConsistent('mystery', 'A')).toBe(false);
    expect(isQualityClassConsistent(null, 'A')).toBe(false);
    expect(isQualityClassConsistent(undefined, 'UNSORTED')).toBe(false);
  });
});

describe('allowedQualityClassesFor', () => {
  it('returns the documented set for each condition', () => {
    expect([...allowedQualityClassesFor('good')].sort()).toEqual(['A', 'B', 'C', 'NEU', 'UNSORTED']);
    expect([...allowedQualityClassesFor('damaged')].sort()).toEqual(['REPAIR_NEEDED', 'SCRAP']);
    expect(allowedQualityClassesFor('sorting')).toEqual(['UNSORTED']);
    expect(allowedQualityClassesFor('ready_a')).toEqual(['A']);
    expect(allowedQualityClassesFor('ready_b')).toEqual(['B']);
    expect(allowedQualityClassesFor('ready_c')).toEqual(['C']);
  });

  it('returns empty for unknown / null conditions', () => {
    expect(allowedQualityClassesFor('mystery')).toEqual([]);
    expect(allowedQualityClassesFor(null)).toEqual([]);
    expect(allowedQualityClassesFor(undefined)).toEqual([]);
  });
});
