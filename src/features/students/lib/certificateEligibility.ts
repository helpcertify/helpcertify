// Pure, framework-agnostic rules for when a completed quiz attempt or
// practice-test completion earns a certificate — no Firestore/network
// calls, so these are directly unit-testable (see
// certificateEligibility.test.ts), the same way referralRules.ts's rules
// are. api/results.ts re-implements the same short checks inline (no
// cross-file imports across api/*.ts, per this repo's existing convention)
// — this file is the tested, canonical spec for what that inline logic
// must do.

// A quiz attempt only earns a certificate once it's actually finished
// (submitted or auto-submitted at the time limit) and passed — an
// in-progress or abandoned/expired attempt is never eligible, matching
// this app's existing pass/fail gate (QuizDoc.passMarkPercent).
export function isQuizAttemptCertificateEligible(args: {
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'expired';
  correctCount: number;
  totalQuestions: number;
  passMarkPercent: number;
}): boolean {
  if (args.status !== 'submitted' && args.status !== 'auto_submitted') return false;
  if (args.totalQuestions <= 0) return false;
  const percent = (args.correctCount / args.totalQuestions) * 100;
  return percent >= args.passMarkPercent;
}

// A practice test has no pass/fail concept — it's eligible once every
// currently-published question has been answered at least once (matching
// the existing "Download Certificate" gate already live on
// PracticeTestsPage.tsx before this feature added server-side issuance).
export function isPracticeTestCertificateEligible(args: { answeredCount: number; totalQuestions: number }): boolean {
  return args.totalQuestions > 0 && args.answeredCount >= args.totalQuestions;
}

export function computeCompletionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

// The idempotency key a repeat "issue" request is matched against — same
// learner, same source item, same specific attempt always resolves to the
// same certificate; a genuinely different attemptId (a new quiz attempt,
// since QuizDoc.maxAttempts can allow more than one) always gets its own.
export function buildSourceAttemptKey(learnerUid: string, sourceType: 'quiz' | 'practiceTest', sourceId: string, attemptId: string): string {
  return `${learnerUid}_${sourceType}_${sourceId}_${attemptId}`;
}

// The one rule every certificate-owning endpoint (get/download) enforces
// server-side before doing anything else — a learner may only ever act on
// their own certificate, never one merely guessed/discovered by id.
export function canAccessCertificate(certificateLearnerUid: string, requesterUid: string): boolean {
  return certificateLearnerUid === requesterUid;
}
