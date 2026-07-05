import { describe, expect, it } from 'vitest';
import { matchReportIntent, normalizeQuestion, REPORT_INTENTS } from './reportIntents';

describe('normalizeQuestion', () => {
  it('lowercases, strips diacritics, collapses whitespace', () => {
    expect(normalizeQuestion('  Épuisé   BALANCÉ ')).toBe('epuise balance');
    expect(normalizeQuestion('Überfällig')).toBe('uberfallig');
    expect(normalizeQuestion('të dëmtuara')).toBe('te demtuara');
  });
});

describe('matchReportIntent', () => {
  it('returns null for empty / whitespace / gibberish', () => {
    expect(matchReportIntent('')).toBeNull();
    expect(matchReportIntent(null)).toBeNull();
    expect(matchReportIntent('   ')).toBeNull();
    expect(matchReportIntent('xyzzy qwerty asdf')).toBeNull();
  });

  it('matches English questions to the right intent', () => {
    expect(matchReportIntent('show me stock by depot')?.intentId).toBe('stock_overview');
    expect(matchReportIntent('what will run out soon?')?.intentId).toBe('stock_runout');
    expect(matchReportIntent('list unpaid invoices')?.intentId).toBe('unpaid_invoices');
    expect(matchReportIntent('which invoices are overdue')?.intentId).toBe('overdue_invoices');
    expect(matchReportIntent('who owes us pallets')?.intentId).toBe('pallet_debtors');
    expect(matchReportIntent('how much damaged stock')?.intentId).toBe('damaged_stock');
    expect(matchReportIntent('show overdue deliveries')?.intentId).toBe('overdue_deliveries');
    expect(matchReportIntent('who are our top partners')?.intentId).toBe('top_partners');
  });

  it('matches the new operational intents across languages', () => {
    expect(matchReportIntent('dergesa te vonuara')?.intentId).toBe('overdue_deliveries');
    expect(matchReportIntent('überfällige lieferungen')?.intentId).toBe('overdue_deliveries');
    expect(matchReportIntent('partneret kryesore')?.intentId).toBe('top_partners');
    expect(matchReportIntent('meilleurs partenaires')?.intentId).toBe('top_partners');
  });

  it('matches Albanian questions', () => {
    expect(matchReportIntent('sa stok kam ne depo')?.intentId).toBe('stock_overview');
    expect(matchReportIntent('kush me ka borxh paleta')?.intentId).toBe('pallet_debtors');
    expect(matchReportIntent('fatura te papaguara')?.intentId).toBe('unpaid_invoices');
  });

  it('matches German and French questions', () => {
    expect(matchReportIntent('überfällige rechnungen')?.intentId).toBe('overdue_invoices');
    expect(matchReportIntent('welcher bestand geht zur neige')?.intentId).toBe('stock_runout');
    expect(matchReportIntent('factures impayées')?.intentId).toBe('unpaid_invoices');
    expect(matchReportIntent('palettes défectueuses')?.intentId).toBe('damaged_stock');
  });

  it('is accent-insensitive (é/ü/ë)', () => {
    // written without accents should still match the accented keyword pool
    expect(matchReportIntent('factures impayees')?.intentId).toBe('unpaid_invoices');
    expect(matchReportIntent('uberfallige rechnungen')?.intentId).toBe('overdue_invoices');
  });

  it('prefers the more specific multi-word phrase on overlap', () => {
    // "overdue invoices" (overdue_invoices) should win over a bare "invoices"
    const m = matchReportIntent('please show overdue invoices report');
    expect(m?.intentId).toBe('overdue_invoices');
    expect(m?.matchedKeywords).toContain('overdue invoices');
  });

  it('reports matched keywords for explainability and a bounded score', () => {
    const m = matchReportIntent('who owes us pallets this month');
    expect(m).not.toBeNull();
    expect(m!.matchedKeywords.length).toBeGreaterThan(0);
    expect(m!.score).toBeGreaterThan(0);
    expect(m!.score).toBeLessThanOrEqual(1);
  });

  it('every intent id in the catalogue is matchable by at least one keyword', () => {
    for (const intent of REPORT_INTENTS) {
      const m = matchReportIntent(intent.keywords[0]);
      expect(m?.intentId).toBe(intent.id);
    }
  });
});
