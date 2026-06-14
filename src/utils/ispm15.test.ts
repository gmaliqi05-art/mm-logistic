import { describe, expect, it } from 'vitest';
import {
  EPAL_COMPONENTS_TOTAL,
  ISPM15_REPLACEMENT_THRESHOLD,
  totalReplacements,
  ispm15Status,
  requiresRetreatment,
  replacementRatio,
} from './ispm15';

describe('totalReplacements', () => {
  it('sums boards + blocks', () => {
    expect(totalReplacements(2, 3)).toBe(5);
  });

  it('treats null/undefined as zero', () => {
    expect(totalReplacements(null, undefined)).toBe(0);
    expect(totalReplacements(undefined, 4)).toBe(4);
    expect(totalReplacements(3, null)).toBe(3);
  });

  it('clamps negative inputs to zero (defensive)', () => {
    expect(totalReplacements(-5, 2)).toBe(2);
    expect(totalReplacements(3, -1)).toBe(3);
  });
});

describe('ispm15Status', () => {
  it('returns ok well below the threshold', () => {
    expect(ispm15Status(0)).toBe('ok');
    expect(ispm15Status(4)).toBe('ok');
  });

  it('returns warning two below the threshold', () => {
    expect(ispm15Status(5)).toBe('warning');
    expect(ispm15Status(6)).toBe('warning');
  });

  it('returns exceeded at the threshold', () => {
    expect(ispm15Status(ISPM15_REPLACEMENT_THRESHOLD)).toBe('exceeded');
    expect(ispm15Status(20)).toBe('exceeded');
  });
});

describe('requiresRetreatment', () => {
  it('is false until the 1/3 rule trips', () => {
    expect(requiresRetreatment(3, 3)).toBe(false); // 6 < 7
  });

  it('is true once exceeded', () => {
    expect(requiresRetreatment(4, 3)).toBe(true); // 7
    expect(requiresRetreatment(7, 0)).toBe(true);
    expect(requiresRetreatment(0, 7)).toBe(true);
  });

  it('handles missing input', () => {
    expect(requiresRetreatment(null, null)).toBe(false);
  });
});

describe('replacementRatio', () => {
  it('returns 0 for an unmodified pallet', () => {
    expect(replacementRatio(0, 0)).toBe(0);
    expect(replacementRatio(null, null)).toBe(0);
  });

  it('returns 1/4 = 0.25 for 5 of 20', () => {
    expect(replacementRatio(3, 2)).toBeCloseTo(0.25, 5);
  });

  it('caps at 1 if the operator over-reports', () => {
    expect(replacementRatio(20, 20)).toBe(1);
  });

  it('is consistent with EPAL_COMPONENTS_TOTAL', () => {
    expect(EPAL_COMPONENTS_TOTAL).toBe(20);
    expect(replacementRatio(20, 0)).toBe(1);
  });
});
