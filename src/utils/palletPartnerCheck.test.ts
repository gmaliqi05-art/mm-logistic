import { describe, it, expect } from 'vitest';
import {
  assessPalletPartnerStatus,
  type PalletPartnerInput,
} from './palletPartnerCheck';

function input(overrides: Partial<PalletPartnerInput> = {}): PalletPartnerInput {
  return {
    our_role: 'consignor',
    partner_id: null,
    pallet_items_total_quantity: 0,
    ...overrides,
  };
}

describe('assessPalletPartnerStatus', () => {
  it('is not_applicable when there are no pallet items', () => {
    expect(assessPalletPartnerStatus(input({ pallet_items_total_quantity: 0 }))).toBe('not_applicable');
  });

  it('is not_applicable for negative quantities (defensive)', () => {
    expect(assessPalletPartnerStatus(input({ pallet_items_total_quantity: -3, partner_id: 'p' }))).toBe('not_applicable');
  });

  it('is role_excluded for carrier (transport-only, no pallet movement expected)', () => {
    expect(
      assessPalletPartnerStatus(
        input({ our_role: 'carrier', pallet_items_total_quantity: 5 }),
      ),
    ).toBe('role_excluded');
  });

  it('is role_excluded for internal_transfer', () => {
    expect(
      assessPalletPartnerStatus(
        input({ our_role: 'internal_transfer', pallet_items_total_quantity: 5 }),
      ),
    ).toBe('role_excluded');
  });

  it('is ok when partner_id is set and items present (consignor)', () => {
    expect(
      assessPalletPartnerStatus(
        input({ our_role: 'consignor', partner_id: 'c1', pallet_items_total_quantity: 10 }),
      ),
    ).toBe('ok');
  });

  it('is ok when partner_id is set and items present (consignee)', () => {
    expect(
      assessPalletPartnerStatus(
        input({ our_role: 'consignee', partner_id: 'c1', pallet_items_total_quantity: 10 }),
      ),
    ).toBe('ok');
  });

  it('is missing_partner when consignor + items but no partner_id', () => {
    expect(
      assessPalletPartnerStatus(input({ our_role: 'consignor', pallet_items_total_quantity: 10 })),
    ).toBe('missing_partner');
  });

  it('is missing_partner when role is unknown / null and items but no partner_id', () => {
    expect(
      assessPalletPartnerStatus(input({ our_role: null, pallet_items_total_quantity: 10 })),
    ).toBe('missing_partner');
  });

  it('is missing_partner for custodian roles without partner_id', () => {
    expect(
      assessPalletPartnerStatus(input({ our_role: 'custodian_in', pallet_items_total_quantity: 4 })),
    ).toBe('missing_partner');
    expect(
      assessPalletPartnerStatus(input({ our_role: 'custodian_out', pallet_items_total_quantity: 4 })),
    ).toBe('missing_partner');
  });
});
