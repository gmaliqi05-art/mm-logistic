import { describe, expect, it } from 'vitest';
import {
  containsOwnCompany,
  isOwnCompanyName,
  normalizeCompanyLabel,
  splitCompanyCandidates,
  stripOwnFromPartnerName,
} from './companyName';

describe('normalizeCompanyLabel', () => {
  it('returns empty string for nullish input', () => {
    expect(normalizeCompanyLabel(null)).toBe('');
    expect(normalizeCompanyLabel(undefined)).toBe('');
    expect(normalizeCompanyLabel('')).toBe('');
  });

  it('lowercases and strips non-alphanumerics', () => {
    expect(normalizeCompanyLabel('SAL Pal GmbH')).toBe('salpalgmbh');
    expect(normalizeCompanyLabel('Müller & Co.')).toBe('mllerco');
  });

  it('truncates at first slash before normalising', () => {
    expect(normalizeCompanyLabel('SAL Pal / Enlirat')).toBe('salpal');
    expect(normalizeCompanyLabel('A/B')).toBe('a');
  });
});

describe('isOwnCompanyName', () => {
  it('matches exact normalised names', () => {
    expect(isOwnCompanyName('SAL Pal', null, 'salpal', null)).toBe(true);
  });

  it('matches when candidate starts with own', () => {
    expect(isOwnCompanyName('SAL Pal GmbH', null, 'SAL Pal', null)).toBe(true);
  });

  it('matches when own starts with candidate (>= 4 chars)', () => {
    expect(isOwnCompanyName('SAL Pal', null, 'SAL Pal GmbH', null)).toBe(true);
  });

  it('requires candidate to be >= 4 chars for prefix match against own', () => {
    expect(isOwnCompanyName('SP', null, 'SAL Pal', null)).toBe(false);
  });

  it('matches by VAT regardless of name', () => {
    expect(isOwnCompanyName('Different Name', 'DE123', 'Own Name', 'DE-123')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(isOwnCompanyName('Acme', null, 'Beta Corp', null)).toBe(false);
  });
});

describe('splitCompanyCandidates', () => {
  it('returns [] for nullish or empty', () => {
    expect(splitCompanyCandidates(null)).toEqual([]);
    expect(splitCompanyCandidates(undefined)).toEqual([]);
    expect(splitCompanyCandidates('')).toEqual([]);
  });

  it('splits on common separators', () => {
    expect(splitCompanyCandidates('Acme / Beta')).toEqual(['Acme', 'Beta']);
    expect(splitCompanyCandidates('Acme | Beta')).toEqual(['Acme', 'Beta']);
    expect(splitCompanyCandidates('Acme; Beta')).toEqual(['Acme', 'Beta']);
    expect(splitCompanyCandidates('Acme vs. Beta')).toEqual(['Acme', 'Beta']);
  });

  it('drops fragments shorter than 2 chars', () => {
    expect(splitCompanyCandidates('A / B / C')).toEqual([]);
    expect(splitCompanyCandidates('SAL / Enlirat')).toEqual(['SAL', 'Enlirat']);
  });
});

describe('stripOwnFromPartnerName', () => {
  it('returns empty string when input is empty', () => {
    expect(stripOwnFromPartnerName(null, 'Own', null)).toBe('');
    expect(stripOwnFromPartnerName('', 'Own', null)).toBe('');
  });

  it('returns the partner when the combined name has own + one other', () => {
    expect(stripOwnFromPartnerName('SAL Pal / Enlirat GmbH', 'SAL Pal', null)).toBe('Enlirat GmbH');
  });

  it('returns empty string when the combined name is only own', () => {
    expect(stripOwnFromPartnerName('SAL Pal', 'SAL Pal', null)).toBe('');
  });

  it('returns the raw name when nothing matches own', () => {
    expect(stripOwnFromPartnerName('Acme GmbH', 'SAL Pal', null)).toBe('Acme GmbH');
  });

  it('joins remaining parts with " / " when more than one survives', () => {
    expect(stripOwnFromPartnerName('SAL Pal / Acme / Beta', 'SAL Pal', null)).toBe('Acme / Beta');
  });
});

describe('containsOwnCompany', () => {
  it('returns false for empty input', () => {
    expect(containsOwnCompany('', 'Own', null)).toBe(false);
    expect(containsOwnCompany(null, 'Own', null)).toBe(false);
  });

  it('detects own company as one of multiple parts', () => {
    expect(containsOwnCompany('SAL Pal / Enlirat', 'SAL Pal', null)).toBe(true);
  });

  it('does not detect when own company is not present', () => {
    expect(containsOwnCompany('Acme / Beta', 'SAL Pal', null)).toBe(false);
  });
});
