// Published content item versioning (PRD 9B, 19: "Material edits to
// approved content create a new version and require re-review"; "Every
// published item retains internal creator attribution, contract reference
// and version history"). Pure; the api handler re-implements it.

export type ContentChangeType = 'typo' | 'clarification' | 'answer_change' | 'stem_rewrite' | 'option_change';

/** The next version number for an item. Versions are append-only - a new
 * version never overwrites an older one. */
export function nextItemVersion(currentVersion: number): number {
  return Math.max(1, Math.floor(currentVersion)) + 1;
}

/** Whether a change is "material" enough to force the item back through
 * SME review before the new version is visible to learners. */
export function requiresReReview(change: ContentChangeType): boolean {
  // A pure typo fix does not; anything touching meaning does.
  return change !== 'typo';
}

/** A historical published item must keep the exact contract + creator it
 * was made under, even after the contract ends or the creator is
 * suspended. This validates that an update does not rewrite those. */
export function preservesAttribution(
  before: { creatorContractId: string | null; partnerId: string; submissionId: string },
  after: { creatorContractId: string | null; partnerId: string; submissionId: string },
): boolean {
  return (
    before.creatorContractId === after.creatorContractId &&
    before.partnerId === after.partnerId &&
    before.submissionId === after.submissionId
  );
}
