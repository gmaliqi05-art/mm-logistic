/**
 * VAT treatment helpers for the Tausch / Pfand pallet billing model.
 *
 * German EPAL pool operators must invoice differently depending on the
 * partner relationship:
 *
 *   - 'deposit' (Pfand)   — Pallets billed at standard VAT (19% in DE).
 *                           Default for every partner.
 *   - 'exchange' (Tausch) — Pallets booked as Sachdarlehen §607 BGB; no
 *                           VAT on the pallet swap itself, only on the
 *                           handling fee. The compensation for unreturned
 *                           pallets is Schadenersatz (also no VAT).
 *
 * These helpers are the single source of truth for "is this line VAT-
 * exempt by treatment?" and "what should be defaulted when a partner
 * has clearing_model = X?". The migration that adds the underlying
 * columns is 20260613180000_add_tausch_pfand_foundation.sql.
 *
 * Existing code that doesn't pass `vat_treatment` keeps the historic
 * behaviour because the defaults all map to 'standard'.
 */

import type { ClearingModel, LineType, VatTreatment } from '../types/accounting';

/**
 * VAT treatments that always force the effective rate to 0, regardless
 * of the `vat_rate` column on the item. Centralising this list keeps
 * the printed invoice, the journal posting and the VAT breakdown in
 * agreement.
 */
const EXEMPT_TREATMENTS: ReadonlySet<VatTreatment> = new Set([
  'reverse_charge',
  'exempt',
  'sachdarlehen',
  'schadenersatz',
]);

export function isVatExempt(treatment: VatTreatment | null | undefined): boolean {
  if (!treatment) return false;
  return EXEMPT_TREATMENTS.has(treatment);
}

/**
 * Returns the VAT rate that actually applies to a line. For any
 * non-standard treatment the rate is forced to 0 — this is what the
 * journal posting and the VAT breakdown should use.
 *
 * IMPORTANT: callers should keep storing the human-meaningful
 * `vat_rate` on the item (e.g. 19) even when treatment is
 * 'sachdarlehen'; the rate is needed to render the legal note on the
 * invoice ("normally 19% — Sachdarlehen §607 BGB applies"). Only the
 * effective rate goes into the totals.
 */
export function effectiveVatRate(item: {
  vat_rate: number;
  vat_treatment?: VatTreatment | null;
}): number {
  if (isVatExempt(item.vat_treatment)) return 0;
  return item.vat_rate;
}

/**
 * When the operator creates an invoice for a partner with a specific
 * clearing model, suggest a treatment for new pallet lines. Operators
 * can always override per line; this is just the smart default.
 */
export function defaultVatTreatmentFor(
  model: ClearingModel,
  lineType: LineType | null | undefined,
): VatTreatment {
  if (model === 'exchange') {
    if (lineType === 'pallet_exchange') return 'sachdarlehen';
    // Handling and transport fees stay taxable even in an exchange
    // relationship — BMF v. 05.11.2013 is explicit on this point.
  }
  return 'standard';
}

/**
 * Short i18n-key for the legal annotation that must appear next to a
 * non-standard line on the printed invoice. The actual text lives in
 * src/i18n/{sq,en,de,fr}.ts. Returning null means "no annotation".
 */
export function vatTreatmentNoteKey(
  treatment: VatTreatment | null | undefined,
): string | null {
  switch (treatment) {
    case 'reverse_charge':
      return 'accounting.vatTreatment.notes.reverse_charge';
    case 'exempt':
      return 'accounting.vatTreatment.notes.exempt';
    case 'sachdarlehen':
      return 'accounting.vatTreatment.notes.sachdarlehen';
    case 'schadenersatz':
      return 'accounting.vatTreatment.notes.schadenersatz';
    case 'standard':
    case null:
    case undefined:
      return null;
  }
}
