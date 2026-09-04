// Creator / reviewer earning maths (PRD 9A). Pure + deterministic integers.
// The api handler re-implements this inline; this module is the tested spec.

import type { CompensationModel } from './creatorRole';

export const CREATOR_HOLD_DAYS_DEFAULT = 14; // correction window before payable

export interface EarningInput {
  model: CompensationModel;
  rateMinor: number;
  /** Items accepted at publish (PER_ITEM) or reviewed (REVIEW). Ignored by FIXED. */
  quantity: number;
  /** True once a FIXED fee has already been generated for this assignment. */
  fixedAlreadyPaid?: boolean;
}

export interface EarningResult {
  type: 'CREATOR_FIXED_FEE' | 'CREATOR_ITEM_FEE' | 'REVIEWER_FEE';
  qty: number;
  grossMinor: number;
  /** null = nothing to generate (e.g. a FIXED fee already paid, or qty 0). */
  skip: boolean;
}

export function computeEarning(input: EarningInput): EarningResult {
  const rate = Math.max(0, Math.floor(input.rateMinor));
  const qty = Math.max(0, Math.floor(input.quantity));

  if (input.model === 'FIXED') {
    return {
      type: 'CREATOR_FIXED_FEE',
      qty: 1,
      grossMinor: rate,
      skip: !!input.fixedAlreadyPaid || rate <= 0,
    };
  }
  const type = input.model === 'REVIEW' ? 'REVIEWER_FEE' : 'CREATOR_ITEM_FEE';
  return { type, qty, grossMinor: rate * qty, skip: qty <= 0 || rate <= 0 };
}

export function holdDaysForCreator(configured: number | null | undefined): number {
  return typeof configured === 'number' && configured > 0 ? Math.floor(configured) : CREATOR_HOLD_DAYS_DEFAULT;
}

export function holdUntilMs(publishedAtMs: number, holdDays: number): number {
  return publishedAtMs + holdDays * 24 * 60 * 60 * 1000;
}

/** Idempotency key for an earning so republish / retries never double-pay. */
export function earningDocId(
  sourceType: 'assignment' | 'submission' | 'review',
  sourceRef: string,
  partnerId: string,
): string {
  return `${sourceType}_${sourceRef}_${partnerId}`;
}

/** When a published item is quarantined, the tied earning is reversed if it
 * has not yet been paid; an already-paid earning becomes RECOVERABLE. */
export function reversalTargetStatus(current: string): 'REVERSED' | 'RECOVERABLE' | null {
  if (['PENDING_HOLD', 'APPROVED', 'PAYABLE'].includes(current)) return 'REVERSED';
  if (['PROCESSING', 'PAID'].includes(current)) return 'RECOVERABLE';
  return null;
}
