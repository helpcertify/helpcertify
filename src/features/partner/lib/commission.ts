// Partner Commission Framework - Phase 2 commission maths. Pure, deterministic,
// integer-only. The api/*.ts handlers re-implement this inline (per the
// no-shared-code-across-api-files convention) but this module is the tested
// spec they must match.

import type { CommissionStatus } from '@/types/models';

export interface CommissionInput {
  /** Item subtotal excluding tax, in minor units (paise). */
  subtotalExcludingTaxMinor: number;
  /** Discounts that must NOT earn commission, in minor units. */
  nonCommissionableDiscountMinor: number;
  /** Already-refunded portion of the base, in minor units (0 at order time). */
  refundedBaseMinor: number;
  /** Fees excluded from the base, in minor units. */
  excludedFeesMinor: number;
  rateBasisPoints: number; // 2000 = 20%
  /** Hard cap on gross commission, in minor units. null = uncapped. */
  maxCommissionMinor: number | null;
}

export interface CommissionResult {
  eligibleBaseMinor: number;
  grossCommissionMinor: number;
  capped: boolean;
}

/** Rounding rule: round half up to the nearest minor unit. Documented and
 * fixed - do not change without a migration note, historical commissions
 * were computed with this rule. */
export function roundMinor(value: number): number {
  return Math.floor(value + 0.5);
}

export function computeCommission(input: CommissionInput): CommissionResult {
  const rawBase =
    input.subtotalExcludingTaxMinor -
    input.nonCommissionableDiscountMinor -
    input.refundedBaseMinor -
    input.excludedFeesMinor;
  const eligibleBaseMinor = Math.max(0, rawBase);

  const uncapped = roundMinor((eligibleBaseMinor * input.rateBasisPoints) / 10000);
  const cap = input.maxCommissionMinor;
  const capped = cap != null && uncapped > cap;
  const grossCommissionMinor = capped ? cap : uncapped;

  return { eligibleBaseMinor, grossCommissionMinor, capped };
}

/** Hold period: the greater of the configured refund window and the pilot
 * floor of 7 days (PRD section 9). */
export function holdDaysFor(refundWindowDays: number | null | undefined): number {
  const PILOT_FLOOR_DAYS = 7;
  const configured = typeof refundWindowDays === 'number' && refundWindowDays > 0 ? refundWindowDays : 0;
  return Math.max(PILOT_FLOOR_DAYS, configured);
}

export function holdUntilMs(paidAtMs: number, holdDays: number): number {
  return paidAtMs + holdDays * 24 * 60 * 60 * 1000;
}

/** Commission state transition when the underlying order is refunded.
 * - Not yet paid out (PENDING_HOLD / ON_HOLD / APPROVED / PAYABLE) -> REVERSED.
 * - Already paid to the partner (PROCESSING / PAID) -> RECOVERABLE (offset
 *   against future earnings).
 * - Terminal / already-unwound states are unchanged. */
export function nextCommissionStatusOnRefund(current: CommissionStatus): CommissionStatus | null {
  switch (current) {
    case 'PENDING_HOLD':
    case 'ON_HOLD':
    case 'APPROVED':
    case 'PAYABLE':
      return 'REVERSED';
    case 'PROCESSING':
    case 'PAID':
      return 'RECOVERABLE';
    default:
      return null; // REJECTED / REVERSED / RECOVERABLE - nothing to do
  }
}

/** Which commission statuses a daily hold-release job may auto-advance to
 * PAYABLE. ON_HOLD is deliberately excluded - it needs a human. */
export function isAutoReleasable(status: CommissionStatus): boolean {
  return status === 'PENDING_HOLD';
}
