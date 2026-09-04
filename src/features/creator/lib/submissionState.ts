// Content submission workflow (PRD 9B). Pure transition table; the api
// handlers enforce it.
//
//   DRAFT ─submit→ SUBMITTED ─auto→ AUTOMATED_CHECKS ─pass→ SME_REVIEW
//                     │                    │                    │
//                  withdraw             flagged           changes_required
//                     ▼                    ▼                    ▼
//                  WITHDRAWN            FLAGGED          CHANGES_REQUIRED ─resubmit→ SUBMITTED
//                                                              │
//   SME_REVIEW ─approve→ APPROVED ─publish→ PUBLISHED          ▼
//   SME_REVIEW ─reject→ REJECTED                          (creator edits)
//   FLAGGED ─cleared→ SME_REVIEW   FLAGGED ─upheld→ REJECTED

export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'AUTOMATED_CHECKS'
  | 'FLAGGED'
  | 'SME_REVIEW'
  | 'CHANGES_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'PUBLISHED';

export type SubmissionEvent =
  | 'submit'
  | 'autochecks_pass'
  | 'autochecks_flag'
  | 'flag_cleared'
  | 'flag_upheld'
  | 'review_approve'
  | 'review_changes'
  | 'review_reject'
  | 'resubmit'
  | 'withdraw'
  | 'publish';

const TABLE: Record<SubmissionStatus, Partial<Record<SubmissionEvent, SubmissionStatus>>> = {
  DRAFT: { submit: 'SUBMITTED', withdraw: 'WITHDRAWN' },
  SUBMITTED: { autochecks_pass: 'SME_REVIEW', autochecks_flag: 'FLAGGED', withdraw: 'WITHDRAWN' },
  AUTOMATED_CHECKS: { autochecks_pass: 'SME_REVIEW', autochecks_flag: 'FLAGGED' },
  FLAGGED: { flag_cleared: 'SME_REVIEW', flag_upheld: 'REJECTED', withdraw: 'WITHDRAWN' },
  SME_REVIEW: { review_approve: 'APPROVED', review_changes: 'CHANGES_REQUIRED', review_reject: 'REJECTED' },
  CHANGES_REQUIRED: { resubmit: 'SUBMITTED', withdraw: 'WITHDRAWN' },
  APPROVED: { publish: 'PUBLISHED' },
  REJECTED: {},
  WITHDRAWN: {},
  PUBLISHED: {},
};

export function nextStatus(from: SubmissionStatus, event: SubmissionEvent): SubmissionStatus | null {
  return TABLE[from]?.[event] ?? null;
}

export function canTransition(from: SubmissionStatus, event: SubmissionEvent): boolean {
  return nextStatus(from, event) !== null;
}

/** Terminal states never move again. */
export function isTerminal(status: SubmissionStatus): boolean {
  return status === 'REJECTED' || status === 'WITHDRAWN' || status === 'PUBLISHED';
}

/** A creator may edit + resubmit only from these states. */
export function creatorCanEdit(status: SubmissionStatus): boolean {
  return status === 'DRAFT' || status === 'CHANGES_REQUIRED';
}
