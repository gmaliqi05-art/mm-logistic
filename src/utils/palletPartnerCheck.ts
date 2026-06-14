/**
 * Detects when a delivery note will *silently* skip the pallet-account
 * ledger because the partner contact cannot be resolved.
 *
 * Background:
 *   `auto_pallet_ledger_on_delivery` (canonical form in migration
 *   20260508095640) RETURNs NEW without inserting any
 *   `pallet_account_transactions` row when `delivery_notes.partner_id`
 *   is NULL. That means an operator can confirm a delivery with EPAL
 *   pallet items but no partner contact, and the partner ledger silently
 *   never moves — partner balance drifts off-book.
 *
 *   This helper mirrors the DB trigger's gating logic so the UI can warn
 *   the operator before the silent skip happens.
 *
 *   Note: `our_role` of 'carrier' or 'internal_transfer' usually
 *   shouldn't touch the partner ledger (we're just transporting), so we
 *   treat those as `role_excluded` — no warning needed. Anything else
 *   without `partner_id` triggers `missing_partner`.
 */

import type { OurRole } from '../components/delivery/OurRoleSelector';

export interface PalletPartnerInput {
  our_role: OurRole | string | null | undefined;
  partner_id: string | null | undefined;
  /** Total pallet items on the note (sum of delivery_note_items.quantity where category_id IS NOT NULL). */
  pallet_items_total_quantity: number;
}

export type PalletPartnerStatus =
  // The note carries no pallet items, so no ledger entry would be expected.
  | 'not_applicable'
  // Items + role that does not produce a pallet movement (carrier,
  // internal_transfer): expected behaviour, no warning.
  | 'role_excluded'
  // Items + partner_id set: ledger will fire when status moves to
  // delivered/confirmed.
  | 'ok'
  // Items + no partner_id: ledger trigger will silently skip — this is
  // the silent-miss case we want to warn about.
  | 'missing_partner';

export function assessPalletPartnerStatus(input: PalletPartnerInput): PalletPartnerStatus {
  if (!input.pallet_items_total_quantity || input.pallet_items_total_quantity <= 0) {
    return 'not_applicable';
  }
  if (input.our_role === 'carrier' || input.our_role === 'internal_transfer') {
    return 'role_excluded';
  }
  return input.partner_id ? 'ok' : 'missing_partner';
}
