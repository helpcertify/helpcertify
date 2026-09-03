// Separation of duties for content review + publication (PRD 9B, 19):
// a creator can never approve or publish their own work, and the publisher
// must differ from the reviewer. Pure; the api handlers enforce these.

export interface ReviewParties {
  /** uid of the staff member acting. */
  actorUid: string;
  /** uid of the creator who made the submission. */
  creatorUid: string;
  /** Does the actor have an open conflict-of-interest flag for this scope? */
  conflictOfInterest?: boolean;
}

export interface GuardResult {
  ok: boolean;
  error?: string;
}

/** May this staff member review this submission? */
export function canReview(p: ReviewParties): GuardResult {
  if (p.actorUid === p.creatorUid) {
    return { ok: false, error: 'A creator cannot review their own submission.' };
  }
  if (p.conflictOfInterest) {
    return { ok: false, error: 'You have a declared conflict of interest for this content.' };
  }
  return { ok: true };
}

export interface PublishParties {
  actorUid: string;
  creatorUid: string;
  /** uid of the reviewer who approved the submission. */
  reviewerUid: string;
}

/** May this staff member publish this approved submission? */
export function canPublish(p: PublishParties): GuardResult {
  if (p.actorUid === p.creatorUid) {
    return { ok: false, error: 'A creator cannot publish their own submission.' };
  }
  if (p.actorUid === p.reviewerUid) {
    return { ok: false, error: 'The reviewer cannot also be the publisher - a second staff member must publish.' };
  }
  return { ok: true };
}

/** Declarations a submission must carry before it can enter review, given
 * the contract's requirements. */
export function missingDeclarations(
  declared: { originality?: boolean; aiAssisted?: boolean; aiVerifiedBy?: string | null; noLeakedExam?: boolean },
  required: { originality: boolean; aiDisclosure: boolean },
): string[] {
  const missing: string[] = [];
  if (required.originality && declared.originality !== true) missing.push('originality declaration');
  if (declared.noLeakedExam !== true) missing.push('no-leaked-exam-content declaration');
  if (required.aiDisclosure) {
    if (declared.aiAssisted === undefined) missing.push('AI-assistance disclosure');
    if (declared.aiAssisted === true && !declared.aiVerifiedBy) missing.push('human verifier for AI-assisted content');
  }
  return missing;
}
