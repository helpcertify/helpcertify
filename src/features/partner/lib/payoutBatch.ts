// Partner Commission Framework - Phase 3 payout-batch rules. Pure and
// deterministic; the api/admin.ts handler re-implements this inline (per the
// no-shared-code-across-api/*.ts convention). No money moves here or there -
// the MVP payout is a human recording an external bank transfer reference.

import type { PayoutBatchStatus } from '@/types/models';

export const MIN_PAYOUT_MINOR = 50000; // ₹500, PRD section 9 ("configurable")

export interface PayableCommission {
  id: string;
  partnerId: string;
  netPayableMinor: number;
  currency: string;
}

export interface PartnerPayoutGroup {
  partnerId: string;
  currency: string;
  commissionIds: string[];
  grossMinor: number;
  meetsMinimum: boolean;
}

/** Groups PAYABLE commissions by partner, sums each partner's total, and
 * flags whoever clears the configurable minimum payout. A partner below the
 * minimum is carried forward - their commissions stay PAYABLE. */
export function groupPayableByPartner(
  commissions: PayableCommission[],
  minPayoutMinor: number = MIN_PAYOUT_MINOR,
): PartnerPayoutGroup[] {
  const byPartner = new Map<string, PartnerPayoutGroup>();
  for (const c of commissions) {
    const key = `${c.partnerId}::${c.currency}`;
    const g = byPartner.get(key) ?? {
      partnerId: c.partnerId,
      currency: c.currency,
      commissionIds: [],
      grossMinor: 0,
      meetsMinimum: false,
    };
    g.commissionIds.push(c.id);
    g.grossMinor += Math.max(0, c.netPayableMinor);
    byPartner.set(key, g);
  }
  const groups = [...byPartner.values()];
  for (const g of groups) g.meetsMinimum = g.grossMinor >= minPayoutMinor;
  return groups.sort((a, b) => b.grossMinor - a.grossMinor);
}

export interface BatchTransition {
  ok: boolean;
  error?: string;
}

/** Maker/checker: the same person cannot both create and approve a batch,
 * and a batch can only be paid once approved. */
export function canApproveBatch(status: PayoutBatchStatus, createdBy: string, approver: string): BatchTransition {
  if (status !== 'DRAFT') return { ok: false, error: `Only a DRAFT batch can be approved (this one is ${status})` };
  if (createdBy === approver) return { ok: false, error: 'The batch creator cannot approve it. A second staff member must approve.' };
  return { ok: true };
}

export function canMarkBatchPaid(status: PayoutBatchStatus, externalReference: string): BatchTransition {
  if (status !== 'APPROVED') return { ok: false, error: `Only an APPROVED batch can be marked paid (this one is ${status})` };
  if (!externalReference.trim()) return { ok: false, error: 'A bank / transfer reference is required to mark a batch paid.' };
  return { ok: true };
}

export function canCancelBatch(status: PayoutBatchStatus): BatchTransition {
  if (status === 'PAID') return { ok: false, error: 'A paid batch cannot be cancelled.' };
  if (status === 'CANCELLED') return { ok: false, error: 'Batch is already cancelled.' };
  return { ok: true };
}

export interface PayableEarning {
  id: string;
  partnerId: string;
  netMinor: number;
  currency: string;
}

export interface CombinedPayoutGroup {
  partnerId: string;
  currency: string;
  commissionIds: string[];
  earningIds: string[];
  commissionMinor: number;
  earningMinor: number;
  grossMinor: number;
  meetsMinimum: boolean;
}

/** Sales commissions and creator/reviewer earnings are separate liabilities
 * but share ONE payout run (PRD 9A). Groups both per partner+currency and
 * sums to a single gross - the batch total must equal the sum of every
 * included net line item (PRD 19). Mirrors api/admin.ts gatherPayable. */
export function combinePayable(
  commissions: PayableCommission[],
  earnings: PayableEarning[],
  minPayoutMinor: number = MIN_PAYOUT_MINOR,
): CombinedPayoutGroup[] {
  const byKey = new Map<string, CombinedPayoutGroup>();
  const grp = (partnerId: string, currency: string): CombinedPayoutGroup => {
    const key = `${partnerId}::${currency}`;
    const g =
      byKey.get(key) ??
      {
        partnerId,
        currency,
        commissionIds: [],
        earningIds: [],
        commissionMinor: 0,
        earningMinor: 0,
        grossMinor: 0,
        meetsMinimum: false,
      };
    byKey.set(key, g);
    return g;
  };
  for (const c of commissions) {
    const g = grp(c.partnerId, c.currency);
    g.commissionIds.push(c.id);
    const m = Math.max(0, c.netPayableMinor);
    g.commissionMinor += m;
    g.grossMinor += m;
  }
  for (const e of earnings) {
    const g = grp(e.partnerId, e.currency);
    g.earningIds.push(e.id);
    const m = Math.max(0, e.netMinor);
    g.earningMinor += m;
    g.grossMinor += m;
  }
  const groups = [...byKey.values()];
  for (const g of groups) g.meetsMinimum = g.grossMinor >= minPayoutMinor;
  return groups.sort((a, b) => b.grossMinor - a.grossMinor);
}

/** Masks a value to its last n characters, e.g. bank account -> "•••3456". */
export function maskTail(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, '');
  if (trimmed.length <= keep) return '•'.repeat(trimmed.length);
  return '•'.repeat(Math.min(6, trimmed.length - keep)) + trimmed.slice(-keep);
}
