import type { Timestamp } from 'firebase/firestore';

// Shared frontend-side types for the Quiz + Practice Test platform (v2).
// Safe to import from anywhere under src/ — the "no shared code" constraint
// only applies to frontend/api/*.ts (each bundled in isolation by Vercel).
// See functions/src/_migrated-v1-reference/README.md for what this replaced.

export type Role = 'student' | 'admin';

// A solid, real starting set of well-known certification-issuing bodies/
// vendors across IT security, cloud, project management, networking, data,
// and a few adjacent domains — not literally every certification body that
// exists (that's not a fixed, enumerable list), but broad enough to cover
// what an exam-prep platform's catalog is realistically tagged with. "Other"
// is always available as a catch-all so tagging is never blocked by a gap
// in this list — ask to have a specific one added if it comes up.
export const CERTIFICATION_CATEGORIES = [
  'Adobe',
  'Amazon Web Services (AWS)',
  'Axelos (PRINCE2 / ITIL)',
  'CFA Institute',
  'Cisco',
  'CompTIA',
  'Databricks',
  'EC-Council',
  'GIAC',
  'Google Cloud',
  'HRCI',
  'IIBA',
  'ISACA',
  '(ISC)²',
  'ISO',
  'Juniper Networks',
  'Microsoft',
  'Oracle',
  'PMI (Project Management Institute)',
  'Red Hat',
  'Salesforce',
  'SAP',
  'SAS',
  'Scrum Alliance',
  'Scrum.org',
  'SHRM',
  'Six Sigma',
  'Tableau',
  'VMware',
  'Other',
] as const;
export type CertificationCategory = (typeof CERTIFICATION_CATEGORIES)[number];

// Matches how certification tracks are actually tiered (e.g. ISACA's
// Foundation/Practitioner-style progression) rather than a generic
// Beginner/Intermediate/Advanced label, since every item here already
// belongs to a specific certification body via `category`.
export const SKILL_LEVELS = ['Foundation', 'Associate', 'Expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** users/{uid} — doc id is the Firebase Auth uid. */
export interface UserDoc {
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type QuestionSourceFormat = 'standard' | 'cisa_qa';

export interface QuestionOption {
  id: string;
  text: string;
}

/** {quizzes|practiceTests}/{id}/questions/{questionId} — never contains the answer. */
export interface QuestionDoc {
  order: number;
  questionText: string;
  options: QuestionOption[];
}

/** .../questions/{questionId}/private/answerKey — split from the public doc because
 * Firestore has no field-level security, only document-level. */
export interface AnswerKeyDoc {
  correctOptionId: string;
  explanation?: string;
}

export type DurationType = 'overall' | 'per_question';

/** quizzes/{quizId} — a timed, strict, single-attempt exam quiz ("Exam Quiz Studio"). */
export interface QuizDoc {
  title: string;
  code: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  enforceSequentialNav: boolean;
  showImmediateResult: boolean;
  showFinalScore: boolean;
  durationType: DurationType;
  durationMinutes: number;
  scheduledStart: Timestamp | null;
  isPublished: boolean;
  antiCheat: { blockAltTab: boolean };
  // price/originalPrice are in the smallest unit of `currency` (paise for
  // INR, cents for USD — see src/utils/currency.ts), matching what
  // Razorpay's Orders API expects and avoiding float rounding on money.
  // price 0 = free, no purchase gate. originalPrice is the "marketing"
  // price shown struck through/"% off"; it's never charged, and defaults to
  // null (no discount display) on docs that predate this field. currency
  // defaults to 'INR' for the same reason — docs from before multi-currency
  // support has no value here.
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  // Which certification body/vendor this content belongs to (ISACA,
  // Microsoft, etc.) — defaults to 'Other' on docs that predate this field.
  category: CertificationCategory;
  // Defaults to 'Foundation' on docs that predate this field.
  skillLevel: SkillLevel;
  // Freeform "About this quiz" copy shown on the student-facing detail page
  // (QuizDetailPage) — defaults to '' on docs that predate this field, in
  // which case the detail page just omits the About section.
  description: string;
  // Denormalized rating aggregate, recomputed transactionally by
  // api/reviews.ts on every submit/edit/delete so listing pages can show a
  // star badge without reading the reviews subcollection. 0/0 on docs that
  // predate this field (same as a doc with no reviews yet) — render code
  // should treat ratingCount === 0 as "no badge to show", not "0 stars".
  ratingAvg: number;
  ratingCount: number;
  // Minimum percent of correctCount/totalQuestions needed for a submitted
  // attempt to count as "passed" — the only thing certificate eligibility
  // (src/utils/certificate.ts) checks for a quiz. Defaults to 60 on docs
  // that predate this field.
  passMarkPercent: number;
  // How many of the first (by `order`) questions a non-buyer can try for
  // free before being asked to purchase — admin-configurable per quiz at
  // create/edit time (QuizFormCard.tsx). Defaults to 5 on docs that predate
  // this field (api/quiz-session.ts's previewCheckAnswer falls back the
  // same way).
  previewQuestionCount: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** practiceTests/{testId} — a large, batched, resumable question bank ("Practice Manager"). */
export interface PracticeTestDoc {
  title: string;
  // Always set — the create form requires both bounds (unlike QuizDoc's
  // optional scheduledStart).
  availableFrom: Timestamp;
  availableUntil: Timestamp;
  // null when the admin has left session length up to each student instead
  // of fixing one (see api/practice-session.ts's startOrResumeBatch, which
  // then requires the student to supply one when starting a fresh session).
  durationPerSessionMinutes: number | null;
  defaultInitialBatchSize: number;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  // See QuizDoc's price/originalPrice/currency comment — same convention.
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  category: CertificationCategory;
  // See QuizDoc's skillLevel comment — same convention.
  skillLevel: SkillLevel;
  // See QuizDoc's description comment — same convention.
  description: string;
  // See QuizDoc's ratingAvg/ratingCount comment — same convention.
  ratingAvg: number;
  ratingCount: number;
  // See QuizDoc's previewQuestionCount comment — same convention.
  previewQuestionCount: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PurchasableItemType = 'quiz' | 'practiceTest';

/** carts/{uid} — one cart per student. Items never store a price; the
 * price is always re-read live from the quiz/practiceTest doc so an admin
 * price change (or a discontinued item) is reflected instantly and can't be
 * gamed by a stale cart entry. A cart can only ever hold items in one
 * currency at a time (enforced in api/cart.ts's addItem) — Razorpay orders
 * are single-currency, so mixing would mean either splitting into multiple
 * orders or rejecting at checkout; rejecting at add-time is simpler and
 * catches the problem where the student can actually act on it. */
export interface CartItemEntry {
  itemType: PurchasableItemType;
  itemId: string;
  addedAt: Timestamp;
}
export interface CartDoc {
  userId: string;
  items: CartItemEntry[];
  couponCode: string | null;
  updatedAt: Timestamp;
}

/** wishlists/{uid} — one wishlist per student, same shape/reasoning as
 * CartDoc (never stores price/title, always re-read live) but with no
 * single-currency constraint since a wishlist is never checked out
 * directly — items move to the cart or straight to Buy Now from here. */
export interface WishlistItemEntry {
  itemType: PurchasableItemType;
  itemId: string;
  addedAt: Timestamp;
}
export interface WishlistDoc {
  userId: string;
  items: WishlistItemEntry[];
  updatedAt: Timestamp;
}

/** coupons/{CODE} — doc id is the uppercased code itself, for an O(1) lookup
 * instead of a query. Admin-managed. */
export interface CouponDoc {
  discountType: 'percent' | 'flat';
  // percent: 1-95 (see api/checkout.ts for why 100 is disallowed); flat: paise.
  discountValue: number;
  active: boolean;
  expiresAt: Timestamp | null;
  maxUses: number | null;
  usedCount: number;
  createdBy: string;
  createdAt: Timestamp;
}

/** orders/{orderId} — one checkout attempt. Prices are snapshotted here at
 * order-creation time (unlike the cart) since a paid order must stay an
 * accurate receipt even if the item's price changes later. */
export interface OrderItemEntry {
  itemType: PurchasableItemType;
  itemId: string;
  title: string;
  unitPrice: number;
}
export interface OrderDoc {
  userId: string;
  items: OrderItemEntry[];
  couponCode: string | null;
  subtotal: number;
  discount: number;
  total: number;
  currency: 'INR' | 'USD';
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  status: 'created' | 'paid' | 'failed';
  // Buy Now creates an order straight from one item, bypassing the cart —
  // finalizeOrder only clears the cart on payment for a fromCart order,
  // otherwise a Buy Now purchase would wipe out unrelated items someone
  // still had sitting in their cart.
  fromCart: boolean;
  createdAt: Timestamp;
  paidAt: Timestamp | null;
}

/** purchases/{uid}_{itemType}_{itemId} — the entitlement record. Composite
 * doc id (same convention as practiceProgress/{uid}_{testId}) makes "does
 * this user own this item" an O(1) doc-get instead of a query, both from the
 * paywall gate in quiz-session.ts/practice-session.ts and from the student
 * UI checking what's already unlocked. */
export interface PurchaseDoc {
  userId: string;
  itemType: PurchasableItemType;
  itemId: string;
  orderId: string;
  purchasedAt: Timestamp;
}

/** reviews/{uid}_{itemType}_{itemId} — one student's rating/review of one
 * item. Composite doc id (same convention as PurchaseDoc/PracticeProgressDoc)
 * makes "does this user already have a review for this item" an O(1)
 * doc-get, and a resubmission is a plain overwrite (one review per user per
 * item, edit-in-place rather than a growing history). itemId alone is
 * globally unique across quizzes/practiceTests (independent Firestore
 * auto-ids), so api/reviews.ts queries only filter by itemId, not itemType
 * too — kept here on the doc anyway for display/debugging. */
export interface ReviewDoc {
  userId: string;
  userName: string;
  itemType: PurchasableItemType;
  itemId: string;
  rating: number; // integer 1-5
  comment: string; // may be ''
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'expired';

/** quizAttempts/{attemptId} — one student's attempt at one quiz. */
export interface QuizAttemptDoc {
  userId: string;
  userName: string;
  quizId: string;
  quizTitle: string;
  status: AttemptStatus;
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
  expiresAt: Timestamp;
  totalQuestions: number;
  answeredCount: number;
  notAnsweredCount: number;
  incorrectCount: number;
  correctCount: number;
  marks: number;
  durationSeconds: number;
  exitCount: number;
}

/** quizAttempts/{attemptId}/answers/{questionId} */
export interface QuizAnswerDoc {
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  answeredAt: Timestamp;
}

/** practiceSessions/{sessionId} — one batch within a practice test. */
export interface PracticeSessionDoc {
  userId: string;
  testId: string;
  batchQuestionIds: string[];
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
  expiresAt: Timestamp;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  isReattempt: boolean;
}

/** practiceSessions/{sessionId}/answers/{questionId} — immediate feedback, so isCorrect is known right away. */
export interface PracticeAnswerDoc {
  selectedOptionId: string;
  isCorrect: boolean;
  answeredAt: Timestamp;
}

/** practiceProgress/{uid_testId} — denormalized so "resume, only unanswered" doesn't scan every past session. */
export interface PracticeProgressDoc {
  userId: string;
  testId: string;
  answeredQuestionIds: string[];
  lastBatchQuestionIds: string[];
  updatedAt: Timestamp;
}

/** adminLogs/{logId} */
export interface AdminLogDoc {
  performedBy: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: Timestamp;
}
