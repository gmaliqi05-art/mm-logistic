import { LIMITATION_THRESHOLDS } from './palletReconciliation';

/**
 * Pallet-return forecasting.
 *
 * `palletReconciliation.ts` answers "how close is this Palettenkonto to the
 * §439 HGB 1-year limitation" from the *age* of the oldest open item. This is
 * the behavioural complement: from a partner's recent **return velocity** it
 * estimates *when* their outstanding balance will clear, and crosses that with
 * the limitation clock to flag partners who — at their own current pace — will
 * NOT have returned the pallets before the claim prescribes. Those are the
 * accounts to chase now rather than after they are time-barred.
 *
 * Sign convention (see 20260629160000_fix_pallet_ledger_sign_convention):
 *   direction 'in'  = we delivered our pallets to the partner  (+, they owe us more)
 *   direction 'out' = the partner returned our pallets          (-, they owe us less)
 *   current_balance > 0 = the partner owes us that many pallets.
 *
 * A return is therefore an `out` transaction. Pure function (explicit `asOf`,
 * no `Date.now()`), so it is fully unit-testable and can run over rows the UI
 * already loads.
 */

export type PalletReturnStatus = 'settled' | 'on_track' | 'at_risk' | 'stalled';

/** Minimal ledger-transaction shape this forecaster needs. */
export interface PalletReturnTxn {
  pallet_account_id: string;
  direction: 'in' | 'out';
  quantity: number;
  transaction_date: string;
}

/** Per-account balance input — matches the `v_pallet_account_aging` view. */
export interface PalletAccountBalance {
  pallet_account_id: string;
  current_balance: number;
  /** Age of the oldest open transaction, from the aging view. Drives the limitation cross-check. */
  oldest_open_txn_age_days?: number | null;
}

export interface PalletReturnForecast {
  pallet_account_id: string;
  currentBalance: number;
  /** Average pallets returned ('out') per day over the window. */
  avgDailyReturns: number;
  /** Whole days until the balance clears at the current return rate; null if not clearing. */
  daysToClearance: number | null;
  expectedClearanceDate: string | null;
  /** Days until the §439 HGB limitation lapses on the oldest open item; null if unknown. */
  daysUntilLimitation: number | null;
  status: PalletReturnStatus;
}

export interface PalletReturnForecastOptions {
  /** Reference "now" as an ISO timestamp. Required — keeps the fn pure. */
  asOf: string;
  /** Days of return history the velocity is averaged over. Default 90 (pallet cycles are slow). */
  windowDays?: number;
}

const DAY_MS = 86_400_000;

const STATUS_ORDER: Record<PalletReturnStatus, number> = {
  stalled: 0,
  at_risk: 1,
  on_track: 2,
  settled: 3,
};

/**
 * Forecast balance clearance per pallet account.
 *
 * Returns one entry per account in `balances`, sorted most-urgent first
 * (stalled, then at_risk, then by soonest limitation, then largest balance).
 */
export function forecastPalletReturns(
  balances: PalletAccountBalance[],
  transactions: PalletReturnTxn[],
  options: PalletReturnForecastOptions,
): PalletReturnForecast[] {
  const windowDays = options.windowDays && options.windowDays > 0 ? options.windowDays : 90;

  const asOfMs = Date.parse(options.asOf);
  if (Number.isNaN(asOfMs)) {
    throw new Error(`forecastPalletReturns: invalid asOf "${options.asOf}"`);
  }
  const windowStartMs = asOfMs - windowDays * DAY_MS;

  // Sum returned ('out') quantity within the window per account.
  const returnedByAccount = new Map<string, number>();
  for (const t of transactions) {
    if (t.direction !== 'out') continue;
    if (!t.pallet_account_id) continue;
    const ts = Date.parse(t.transaction_date);
    if (Number.isNaN(ts) || ts < windowStartMs || ts > asOfMs) continue;
    returnedByAccount.set(t.pallet_account_id, (returnedByAccount.get(t.pallet_account_id) ?? 0) + (t.quantity ?? 0));
  }

  const forecasts: PalletReturnForecast[] = balances.map((b) => {
    const currentBalance = b.current_balance ?? 0;
    const returned = returnedByAccount.get(b.pallet_account_id) ?? 0;
    const avgDailyReturns = returned / windowDays;

    const age = b.oldest_open_txn_age_days;
    const daysUntilLimitation = age == null ? null : LIMITATION_THRESHOLDS.expired - age;

    let daysToClearance: number | null;
    let expectedClearanceDate: string | null;
    let status: PalletReturnStatus;

    if (currentBalance <= 0) {
      daysToClearance = null;
      expectedClearanceDate = null;
      status = 'settled';
    } else if (avgDailyReturns <= 0) {
      // Owes us pallets but has returned nothing in the window.
      daysToClearance = null;
      expectedClearanceDate = null;
      status = 'stalled';
    } else {
      daysToClearance = Math.ceil(currentBalance / avgDailyReturns);
      expectedClearanceDate = new Date(asOfMs + daysToClearance * DAY_MS).toISOString().slice(0, 10);
      status =
        daysUntilLimitation != null && daysToClearance > daysUntilLimitation ? 'at_risk' : 'on_track';
    }

    return {
      pallet_account_id: b.pallet_account_id,
      currentBalance,
      avgDailyReturns,
      daysToClearance,
      expectedClearanceDate,
      daysUntilLimitation,
      status,
    };
  });

  forecasts.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const al = a.daysUntilLimitation ?? Number.POSITIVE_INFINITY;
    const bl = b.daysUntilLimitation ?? Number.POSITIVE_INFINITY;
    if (al !== bl) return al - bl;
    return b.currentBalance - a.currentBalance;
  });

  return forecasts;
}

/**
 * The accounts that warrant action: a partner holding our pallets who has
 * either returned nothing recently (`stalled`) or, at their current pace, will
 * not clear before the claim prescribes (`at_risk`).
 */
export function getPalletReturnRisks(
  balances: PalletAccountBalance[],
  transactions: PalletReturnTxn[],
  options: PalletReturnForecastOptions,
): PalletReturnForecast[] {
  return forecastPalletReturns(balances, transactions, options).filter(
    (f) => f.status === 'stalled' || f.status === 'at_risk',
  );
}
