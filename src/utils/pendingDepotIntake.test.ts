import { describe, it, expect } from 'vitest';
import {
  countAwaitingDepotIntake,
  isAwaitingDepotIntake,
  PENDING_INTAKE_STATUSES,
  type PendingDepotIntakeNote,
} from './pendingDepotIntake';

const DEPOT_A = '11111111-1111-1111-1111-111111111111';
const DEPOT_B = '22222222-2222-2222-2222-222222222222';

function note(overrides: Partial<PendingDepotIntakeNote> = {}): PendingDepotIntakeNote {
  return {
    status: 'delivered',
    assigned_depot_id: DEPOT_A,
    stock_posted: false,
    ...overrides,
  };
}

describe('isAwaitingDepotIntake', () => {
  it('is true for each pending status assigned to this depot', () => {
    for (const status of PENDING_INTAKE_STATUSES) {
      expect(isAwaitingDepotIntake(note({ status }), DEPOT_A)).toBe(true);
    }
  });

  it('is false when stock_posted is already true (trigger already ran)', () => {
    expect(isAwaitingDepotIntake(note({ stock_posted: true }), DEPOT_A)).toBe(false);
  });

  it('is false when the note is assigned to a different depot', () => {
    expect(isAwaitingDepotIntake(note({ assigned_depot_id: DEPOT_B }), DEPOT_A)).toBe(false);
  });

  it('is false when no depot id is supplied (caller is not in a depot context)', () => {
    expect(isAwaitingDepotIntake(note(), null)).toBe(false);
    expect(isAwaitingDepotIntake(note(), undefined)).toBe(false);
    expect(isAwaitingDepotIntake(note(), '')).toBe(false);
  });

  it('is false for terminal / pre-shipment statuses', () => {
    for (const status of ['draft', 'sent', 'in_transit', 'confirmed', 'completed', 'cancelled']) {
      expect(isAwaitingDepotIntake(note({ status }), DEPOT_A)).toBe(false);
    }
  });

  it('handles null/empty status defensively', () => {
    expect(isAwaitingDepotIntake(note({ status: null }), DEPOT_A)).toBe(false);
    expect(isAwaitingDepotIntake(note({ status: '' }), DEPOT_A)).toBe(false);
  });
});

describe('countAwaitingDepotIntake', () => {
  it('counts only matching notes', () => {
    const notes = [
      note({ status: 'delivered' }),
      note({ status: 'delivered', assigned_depot_id: DEPOT_B }),
      note({ status: 'pending_stock_confirmation' }),
      note({ status: 'confirmed' }),
      note({ status: 'delivered', stock_posted: true }),
    ];
    expect(countAwaitingDepotIntake(notes, DEPOT_A)).toBe(2);
  });

  it('returns 0 when depotId is missing', () => {
    expect(countAwaitingDepotIntake([note()], null)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(countAwaitingDepotIntake([], DEPOT_A)).toBe(0);
  });
});
