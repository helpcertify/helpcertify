// Pure rules for creator roles + contracts (PRD 9A). No Firestore/network;
// api/auth.ts + api/content-admin.ts re-implement the checks inline and this
// module is the tested spec.

export const CREATOR_ROLES = ['course_creator', 'practice_test_creator', 'mock_test_creator', 'reviewer'] as const;
export type CreatorRole = (typeof CREATOR_ROLES)[number];

export function isValidCreatorRole(v: string): v is CreatorRole {
  return (CREATOR_ROLES as readonly string[]).includes(v);
}

/** partnerRoles doc id - ties one partner to one role so a partner has at
 * most one row per role and suspending one never touches the others. */
export function partnerRoleDocId(partnerId: string, role: CreatorRole): string {
  return `${partnerId}__${role}`;
}

/** A partner may apply for a role only if they do not already hold it in a
 * live state (APPLIED / UNDER_REVIEW / APPROVED). REJECTED or SUSPENDED can
 * re-apply. */
export function canApplyForRole(existingStatus: string | null | undefined): boolean {
  return existingStatus == null || existingStatus === 'REJECTED';
}

export type CompensationModel = 'FIXED' | 'PER_ITEM' | 'REVIEW';

/** Contract rate validation. All money is integer minor units; the pilot
 * has no revenue-share, so a rate is always a positive fee. */
export function validateContractRate(model: CompensationModel, rateMinor: number): { ok: boolean; error?: string } {
  if (!Number.isInteger(rateMinor) || rateMinor <= 0) {
    return { ok: false, error: 'Rate must be a positive whole number of paise.' };
  }
  if (model === 'FIXED' && rateMinor > 5_000_000) {
    return { ok: false, error: 'A fixed assignment fee over ₹50,000 needs finance sign-off - split into milestones.' };
  }
  if ((model === 'PER_ITEM' || model === 'REVIEW') && rateMinor > 100_000) {
    return { ok: false, error: 'A per-item rate over ₹1,000 is unusually high - confirm before saving.' };
  }
  return { ok: true };
}

/** Earning preview for a contract, given a count of accepted items. FIXED
 * ignores the count; PER_ITEM / REVIEW multiply. Deterministic integers. */
export function previewEarningMinor(model: CompensationModel, rateMinor: number, acceptedItemCount: number): number {
  if (model === 'FIXED') return Math.max(0, rateMinor);
  return Math.max(0, rateMinor) * Math.max(0, Math.floor(acceptedItemCount));
}

/** Which earning type a contract's compensation model produces. */
export function earningTypeFor(model: CompensationModel): 'CREATOR_FIXED_FEE' | 'CREATOR_ITEM_FEE' | 'REVIEWER_FEE' {
  if (model === 'FIXED') return 'CREATOR_FIXED_FEE';
  if (model === 'REVIEW') return 'REVIEWER_FEE';
  return 'CREATOR_ITEM_FEE';
}
