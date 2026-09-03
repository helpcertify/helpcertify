import type { Timestamp } from 'firebase/firestore';

// Shared frontend-side types for the Quiz + Practice Test platform (v2).
// Safe to import from anywhere under src/ - the "no shared code" constraint
// only applies to frontend/api/*.ts (each bundled in isolation by Vercel).
// See functions/src/_migrated-v1-reference/README.md for what this replaced.

export type Role = 'student' | 'admin' | 'finance_admin';

// A solid, real starting set of well-known certification-issuing bodies/
// vendors across IT security, cloud, project management, networking, data,
// and a few adjacent domains - not literally every certification body that
// exists (that's not a fixed, enumerable list), but broad enough to cover
// what an exam-prep platform's catalog is realistically tagged with. "Other"
// is always available as a catch-all so tagging is never blocked by a gap
// in this list - ask to have a specific one added if it comes up.
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

/** users/{uid} - doc id is the Firebase Auth uid. */
export interface UserDoc {
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  // IANA name (e.g. "Asia/Kolkata") - detected client-side once and kept in
  // sync silently if it changes (see initAuth.ts). Used only for "what day
  // is it for this learner" (Study Planner greetings/streak boundaries),
  // never anything security-sensitive.
  timezone?: string;
  // Refer & Earn - this learner's own invite code (lazily generated and
  // backfilled the first time they visit My Profile, via api/auth.ts's
  // ensureReferralCode; missing on every account until then). `referredBy`
  // is the referrer's uid, set once at signup if a valid code was used -
  // never changed after that. Neither field is ever read by any
  // entitlement/paywall check; see ReferralDoc for the actual reward
  // tracking.
  referralCode?: string;
  referredBy?: string;
  // Refer & Earn fraud signal - captured once, at register()/
  // provisionProfile() time, never updated after. Compared against a
  // referrer's own signupIp (see referralRules.ts's isSameSignupIp) to
  // catch the same person signing up twice to farm their own referral
  // reward. Never blocks account creation itself - only whether a
  // referral code gets linked.
  signupIp?: string | null;
  // Partner Commission Framework - set by api/admin.ts's
  // reviewPartnerApplication on approval; the id of this account's
  // partners/{partnerId} doc. Absent for non-partners. Never read by any
  // learner paywall - it only gates the partner portal (Phase 3).
  partnerId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// The full referral lifecycle (see referralRules.ts's nextStatusOnRefund
// for the one transition rule that operates on this). 'invited' is a
// reserved value nothing in this app currently transitions a doc into -
// detecting "code was shared/viewed but not yet used" would need page-
// view tracking this app doesn't have, so the real lifecycle starts at
// 'registered'. 'purchased' is the brief moment between the referee's
// qualifying order being marked paid and the pending/rejected decision
// being written in the same batch - in practice always resolves to one of
// those two before any reader sees 'purchased' stored, but kept as its
// own value to make the audit trail's intent explicit. 'rejected' covers
// self-referral, same-signup-IP, an unknown/expired code, an existing
// user who'd already purchased before applying a code, or the referrer's
// monthly reward limit being reached - always paired with
// rejectionReason.
export type ReferralStatus = 'invited' | 'registered' | 'purchased' | 'pending' | 'rewarded' | 'rejected' | 'reversed' | 'expired';

// Same convention as CouponDoc: 'flat' is paise, 'percent' is 1-95.
export type ReferralRewardType = 'flat' | 'percent';

/** referrals/{refereeUid} - one doc per referred signup (doc id is the new
 * account's own uid, so a given signup can only ever be referred once -
 * see referralRules.ts's canLinkReferral). Created at signup by
 * api/auth.ts (register/provisionProfile/applyReferralCode) when a valid
 * referral code was used, with the referee's own welcome coupon already
 * attached (granted immediately, to encourage that very first purchase -
 * default 10% off, see REFEREE_REWARD_DEFAULTS). `status` tracks the
 * *referrer's* separate reward instead - a real HelpCertify credit ledger
 * entry (creditLedgerEntries/{qualifyingOrderId}, see
 * CreditLedgerEntryDoc), not a coupon, since it's non-withdrawable, has a
 * validation/holding period, and can be partially spent across several
 * future purchases. Granted only once the referee's first *eligible*
 * order is actually paid (see api/checkout.ts's/
 * api/razorpay-webhook.ts's finalizeOrder), never on signup alone, so an
 * account that never buys anything never costs the referrer's reward.
 * Reward type/value/validation-period/expiry are all read from
 * appSettings/general at the moment each is granted (see api/admin.ts's
 * getAppSettings/updateAppSettings, the admin-editable Refer & Earn
 * control) and frozen onto the credit entry, so a later change to the
 * configured reward never rewrites what was already promised to an
 * existing referral. */
export interface ReferralDoc {
  referrerUid: string;
  refereeUid: string;
  refereeName: string;
  status: ReferralStatus;
  // Set only when status is 'rejected' - human-readable, e.g. "Self-
  // referral", "Same signup IP as referrer", "Referrer's monthly referral
  // limit reached", "Account already made a purchase before applying a
  // code".
  rejectionReason: string | null;
  // The order that made this referral's referrer reward eligible (first
  // paid order containing at least one eligible item) - for audit
  // traceability and as the credit ledger entry's own doc id.
  qualifyingOrderId: string | null;
  // The referrer's own credit ledger entry once one exists (status
  // 'pending' or later) - see CreditLedgerEntryDoc. Null while status is
  // still 'invited'/'registered'/'rejected'.
  creditEntryId: string | null;
  // The referee's own welcome coupon - set at creation time (immediately
  // at signup), not gated on any purchase. Always present together, or
  // all null on a referral doc predating this field (or one that was
  // rejected before a coupon was ever minted).
  refereeCouponCode: string | null;
  refereeRewardType: ReferralRewardType | null;
  refereeRewardValue: number | null;
  createdAt: Timestamp;
  rewardedAt: Timestamp | null;
}

/** creditLedgerEntries/{qualifyingOrderId} - the referrer's own Refer &
 * Earn credit, one doc per grant. Doc id is deliberately the *order* id
 * that triggered it (not an auto-generated id) - a retried webhook or
 * duplicate client confirmation for the same order overwrites this same
 * doc instead of minting a second entry, which is the idempotency
 * guarantee for this feature (see referralRules.ts's
 * shouldSkipAlreadyProcessedOrder, and finalizeOrder's own earlier
 * already-paid guard, which this sits behind anyway).
 *
 * `status`'s two passive transitions ('pending_validation' -> 'active',
 * and either -> 'expired') are computed lazily from the timestamps below
 * wherever an entry is read (see referralRules.ts's computeCreditStatus)
 * - there's no scheduled job in this app to flip them proactively. Code
 * that *reads* an entry for display may write the recomputed status back
 * so it self-heals over time, but code that *spends* an entry always
 * recomputes from the timestamps at spend time rather than trusting a
 * possibly-stale stored value. 'depleted' (spent to zero) and 'reversed'
 * (refund clawback) are the two transitions something explicitly writes. */
export interface CreditLedgerEntryDoc {
  referrerUid: string;
  referralId: string; // referrals/{refereeUid}
  amountMinor: number; // originally granted, in paise
  remainingMinor: number; // not yet spent
  status: 'pending_validation' | 'active' | 'depleted' | 'expired' | 'reversed';
  grantedAt: Timestamp;
  validationEndsAt: Timestamp;
  expiresAt: Timestamp;
  reversedAt: Timestamp | null;
  reversalReason: string | null;
}

export type QuestionSourceFormat = 'standard' | 'cisa_qa';

export interface QuestionOption {
  id: string;
  text: string;
}

/** {quizzes|practiceTests}/{id}/questions/{questionId} - never contains the answer. */
export interface QuestionDoc {
  order: number;
  questionText: string;
  options: QuestionOption[];
  // Optional domain/topic tag, settable via the admin question editor
  // (QuestionEditorList.tsx) - never set by the bulk .docx upload parser.
  // Missing on every question until an admin tags it; Domain Progress
  // (Release 3) is intentionally not built yet since there's no tagged
  // content to show it against.
  domain?: string;
}

/** .../questions/{questionId}/private/answerKey - split from the public doc because
 * Firestore has no field-level security, only document-level. */
export interface AnswerKeyDoc {
  correctOptionId: string;
  explanation?: string;
}

export type DurationType = 'overall' | 'per_question';

/** quizzes/{quizId} - a timed, strict, single-attempt exam quiz ("Exam Quiz Studio"). */
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
  // INR, cents for USD - see src/utils/currency.ts), matching what
  // Razorpay's Orders API expects and avoiding float rounding on money.
  // price 0 = free, no purchase gate. originalPrice is the "marketing"
  // price shown struck through/"% off"; it's never charged, and defaults to
  // null (no discount display) on docs that predate this field. currency
  // defaults to 'INR' for the same reason - docs from before multi-currency
  // support has no value here.
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  // Which certification body/vendor this content belongs to (ISACA,
  // Microsoft, etc.) - defaults to 'Other' on docs that predate this field.
  category: CertificationCategory;
  // Defaults to 'Foundation' on docs that predate this field.
  skillLevel: SkillLevel;
  // Freeform "About this quiz" copy shown on the student-facing detail page
  // (QuizDetailPage) - defaults to '' on docs that predate this field, in
  // which case the detail page just omits the About section.
  description: string;
  // Denormalized rating aggregate, recomputed transactionally by
  // api/reviews.ts on every submit/edit/delete so listing pages can show a
  // star badge without reading the reviews subcollection. 0/0 on docs that
  // predate this field (same as a doc with no reviews yet) - render code
  // should treat ratingCount === 0 as "no badge to show", not "0 stars".
  ratingAvg: number;
  ratingCount: number;
  // Minimum percent of correctCount/totalQuestions needed for a submitted
  // attempt to count as "passed" - what api/results.ts's
  // issueOrGetCertificate checks before issuing a quiz completion
  // certificate (see CertificateDoc). Defaults to 60 on docs that predate
  // this field.
  passMarkPercent: number;
  // How many of the first (by `order`) questions a non-buyer can try for
  // free before being asked to purchase - admin-configurable per quiz at
  // create/edit time (QuizFormCard.tsx). Defaults to 5 on docs that predate
  // this field (api/quiz-session.ts's previewCheckAnswer falls back the
  // same way).
  previewQuestionCount: number;
  // Set on quizzes generated as one of a certification's mock-exam batches
  // (see ContentSeriesDoc / api/content-admin.ts's createBatchedSeries).
  // `isMock` is display-only; `shufflePerAttempt` makes api/quiz-session.ts's
  // startAttempt randomise question + option order for that attempt and
  // snapshot the order onto the quizAttempts doc. Absent on every
  // single-upload quiz.
  isMock?: boolean;
  shufflePerAttempt?: boolean;
  // Series batches are `price: 0` (they are sold only inside a
  // certification package, never individually), so this flag - not the
  // price - is what makes the paywall in api/quiz-session.ts require a
  // purchases/ record. Listing pages show "Unlock with a package" instead
  // of a Buy button for a non-owned entitlement-gated item.
  requiresEntitlement?: boolean;
  // The content series this doc belongs to, and its 1-based position within
  // that series' mock list. Absent on single-upload quizzes.
  seriesId?: string;
  batchIndex?: number;
  // How many separate attempts a student may start for this quiz - real
  // field replacing what used to be a hardcoded "1 attempt" assumption on
  // the student home page and an "any prior attempt blocks a new one" gate
  // in api/quiz-session.ts. Defaults to 1 on docs that predate this field,
  // which preserves the exact old behavior.
  maxAttempts: number;
  // Access period shown at checkout and snapshotted into the
  // purchase-consent record (see PurchaseConsentDoc). 0 = no expiry
  // ("Lifetime access"), which is the current behaviour for individual
  // quizzes - entitlement gates do not enforce expiry today, this is a
  // display/audit value. Admin-set on QuizFormCard; defaults to 0 on docs
  // that predate this field.
  accessPeriodDays: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** practiceTests/{testId} - a large, batched, resumable question bank ("Practice Manager"). */
export interface PracticeTestDoc {
  title: string;
  // Always set - the create form requires both bounds (unlike QuizDoc's
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
  // See QuizDoc's price/originalPrice/currency comment - same convention.
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  category: CertificationCategory;
  // See QuizDoc's skillLevel comment - same convention.
  skillLevel: SkillLevel;
  // See QuizDoc's description comment - same convention.
  description: string;
  // See QuizDoc's ratingAvg/ratingCount comment - same convention.
  ratingAvg: number;
  ratingCount: number;
  // See QuizDoc's previewQuestionCount comment - same convention.
  previewQuestionCount: number;
  // Study Planner (Phase 1) course-level defaults, all admin-configurable
  // on the Practice Test form, all optional so an existing test predating
  // this feature keeps working with sensible fallbacks (3, 1.8, true -
  // applied wherever these are read, not written back onto old docs).
  revisionBufferDays?: number;
  defaultMinutesPerQuestion?: number;
  studyPlannerEnabled?: boolean;
  // The certification/exam this content prepares for (e.g. "CISA", "CISM",
  // "AZ-104") - distinct from `title`, which is a freeform, admin-written
  // product name ("CISA 2025 Full Bank") that can vary between multiple
  // practice tests covering the same exam. Optional so a test created
  // before this field existed still works; every reader that shows an
  // exam/certification name falls back to `title` when it's unset, never
  // to a placeholder string. `category` (the existing CertificationCategory
  // enum, e.g. "ISACA") already covers the provider half of this - this
  // field is the only piece that was actually missing.
  examName?: string;
  // See QuizDoc.accessPeriodDays - same convention (0 = Lifetime access,
  // display/audit only, defaults to 0 on older docs).
  accessPeriodDays?: number;
  // Set on practice tests generated as one of a certification's practice
  // batches (see ContentSeriesDoc). `batchIndex` is the 1-based position;
  // the learner picks "Practice Exam <batchIndex>" from the list. Absent on
  // single-upload practice tests. `requiresEntitlement` - see QuizDoc.
  seriesId?: string;
  batchIndex?: number;
  requiresEntitlement?: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** contentSeries/{seriesId} - the manifest for one uploaded question doc
 *  that api/content-admin.ts's createBatchedSeries split into several
 *  practice-test batches and several mock-exam batches. Lets the admin
 *  editor show "10 practice batches, 5 mock exams" and re-generate/replace
 *  the set. The questions themselves live only on the individual
 *  practiceTests/{id} and quizzes/{id} docs this manifest points at. */
export interface ContentSeriesDoc {
  certificationId: string;
  examName: string;
  category: string;
  sourceFileUrl: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  practiceBatchSize: number;
  practiceTestIds: string[];
  mockQuizIds: string[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Small, fixed, admin-picked icon set for a certification card - not a
// free-text URL, so there's no image-upload plumbing to add this phase
// (blob-upload.ts already holds one of the 12 api/*.ts slots and isn't
// being extended for this) and no risk of a broken/missing image if an
// admin mistypes a URL. Each key renders to an emoji/SVG already shipped
// in the bundle (see CertificationCard.tsx).
export const CERTIFICATION_ICON_KEYS = ['shield', 'cloud', 'network', 'chart', 'generic'] as const;
export type CertificationIconKey = (typeof CERTIFICATION_ICON_KEYS)[number];

// Admin-facing lifecycle for a certification/package - richer than the
// plain `isPublished` boolean the learner-side read (api/cart.ts's
// getLearnerCatalog) already relies on. `isPublished` is kept as a derived
// field (`status === 'published'`) so the existing, unmodified learner
// query keeps working verbatim; `status` is the admin portal's own source
// of truth for Draft/Scheduled/Published/Unpublished/Archived.
export type CertificationStatus = 'draft' | 'scheduled' | 'published' | 'unpublished' | 'archived';
export type PackageStatus = 'draft' | 'published' | 'unpublished' | 'archived';

/** Embedded on CertificationDoc.contentVersions - a certification can have
 * more than one exam-outline version over time (e.g. ISACA retiring the old
 * CISM outline for a new one on a announced date); each version points at
 * one existing quiz or practice test as its question bank, so mock
 * blueprints can be scoped to "this version's bank" and never silently mix
 * questions across an outline change. */
export interface ContentVersionDoc {
  id: string;
  versionName: string;
  versionCode: string;
  effectiveFrom: Timestamp;
  effectiveTo: Timestamp | null;
  associatedBankType: 'quiz' | 'practiceTest';
  associatedBankId: string;
  status: 'draft' | 'active' | 'retired';
  notes: string;
}

export interface DomainAllocation {
  domain: string;
  percent: number;
  questionCount: number;
}

/** Embedded on CertificationDoc.mockBlueprints - one per content version,
 * the admin-configured recipe a future mock-generation service would draw
 * from (this phase only configures and persists it; api/quiz-session.ts's
 * actual generation logic is untouched - see this doc's own header
 * comment in api/content-admin.ts). */
export interface MockBlueprintDoc {
  id: string;
  contentVersionId: string;
  totalQuestions: number;
  durationMinutes: number;
  domains: DomainAllocation[];
  // null = difficulty distribution not enforced for this blueprint.
  difficultyDistribution: { easy: number; medium: number; hard: number } | null;
  repeatPolicy: 'minimize_repeats' | 'allow_repeats';
  shuffleOptions: boolean;
  explanationRelease: 'after_submission' | 'immediate' | 'never';
  allowPauseResume: boolean;
  autoSubmit: boolean;
  // null = no readiness-threshold messaging configured.
  readinessThresholdPercent: number | null;
  status: 'draft' | 'active';
}

/** certifications/{certificationId} - the grouping entity a learner
 * actually shops for ("CISM Preparation"), one level above the individual
 * quizzes/practiceTests that make up its packages. Admin-managed via the
 * Products & Pricing admin portal (src/features/admin/pages/
 * CertificationEditorPage.tsx) and api/content-admin.ts. */
export interface CertificationDoc {
  // Short, code-like name ("CISM") distinct from the marketing display
  // name ("CISM Preparation") - mirrors PracticeTestDoc.examName's own
  // short-name/title distinction.
  shortName: string;
  name: string;
  // Reuses the existing vendor enum rather than a new "provider" field -
  // every QuizDoc/PracticeTestDoc already tags `category` the same way.
  provider: CertificationCategory;
  // URL-safe, unique across all certifications - validated in
  // api/content-admin.ts's createCertification/updateCertification.
  slug: string;
  // A plain string, not the CertificationCategory union - same convention
  // as QuizDoc/PracticeTestDoc's own `category` field (an admin can type a
  // vendor/track label beyond the fixed CERTIFICATION_CATEGORIES list).
  category: string;
  shortDescription: string;
  description: string;
  iconKey: CertificationIconKey;
  effectiveFrom: Timestamp | null;
  effectiveTo: Timestamp | null;
  // Fallback access-validity (days) for a package that doesn't set its own.
  defaultValidityDays: number;
  featured: boolean;
  status: CertificationStatus;
  // Shown on the learner-facing detail/checkout surfaces once wired up -
  // stored now, not rendered anywhere yet (see CertificationDetailModal.tsx
  // for the existing, unrelated generic disclaimer it shows today).
  independentPrepDisclaimer: string;
  // The simplified product form's remembered bank choices. `practiceBankId`
  // is the practiceTest bank its Practice/Complete packages reference;
  // `mockBankId` is the quiz bank that backs its mock content version and
  // Mock/Complete packages. null on certifications created before this field
  // or through the raw Advanced form. Packages remain the source of truth
  // for what a purchase actually grants - these are a convenience pointer.
  practiceBankId: string | null;
  mockBankId: string | null;
  // The full set of practice-batch / mock-batch bank ids when this
  // certification's content came from a batched upload (ContentSeriesDoc).
  // `practiceBankId` / `mockBankId` stay populated with the first id for
  // any older reader. Empty on certifications that link a single bank.
  practiceBankIds?: string[];
  mockBankIds?: string[];
  seriesId?: string | null;
  contentVersions: ContentVersionDoc[];
  mockBlueprints: MockBlueprintDoc[];
  // Derived from `status` at write time - never the field the admin portal
  // reasons about directly, kept only so api/cart.ts's existing learner
  // query (`where('isPublished', '==', true)`) keeps working unmodified.
  isPublished: boolean;
  // Admin-controlled ordering on the learner home page; ties broken by
  // createdAt.
  displayOrder: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** packages/{packageId} - a purchasable bundle under one certification
 * ("Mock Exams", "Practice Questions", "Complete"). Deliberately just a
 * *reference* to existing quizzes/practiceTests, not a new entitlement
 * type of its own: buying a package fans out to the exact same
 * `purchases/{uid}_{itemType}_{itemId}` docs an individual purchase would
 * create (see api/checkout.ts's finalizeOrder), so every existing
 * paywall gate (api/quiz-session.ts, api/practice-session.ts) and every
 * student page's owned-item check keeps working completely unmodified -
 * a package purchase is indistinguishable from buying each included item
 * one at a time. No `purchases/{uid}_package_{packageId}` doc is ever
 * written; a package is a checkout-time bundle, not its own access grant. */
export interface PackageDoc {
  certificationId: string;
  // Freeform, not a fixed enum - "Support future package types without
  // changing the main certification model" (a few conventional values are
  // offered in the admin form: mock/practice/complete/custom).
  packageType: string;
  name: string;
  shortDescription: string;
  includedFeatures: string[];
  // null = no badge shown. Admin freeform text ("Best Value", "Most
  // Popular") rather than a fixed enum, matching how flexible marketing
  // copy usually needs to be.
  badgeText: string | null;
  // At most one package per certification should have this true - enforced
  // in api/content-admin.ts's createPackage/updatePackage (unsets any
  // sibling's flag in the same write), not at the Firestore layer.
  isRecommended: boolean;
  description: string;
  includedQuizIds: string[];
  includedPracticeTestIds: string[];

  // --- Access configuration ---
  practiceAccessEnabled: boolean;
  accessibleQuestionCount: number;
  explanationAccessEnabled: boolean;
  mockAccessEnabled: boolean;
  fullMockAttempts: number;
  miniMockAttempts: number;
  questionsPerMock: number;
  mockDurationMinutes: number;
  studyPlanAccessEnabled: boolean;
  analyticsAccessEnabled: boolean;
  trialAvailable: boolean;
  accessValidityDays: number;
  renewalAvailable: boolean;
  upgradeAvailable: boolean;
  promoEligible: boolean;
  referralEligible: boolean;
  refundEligible: boolean;

  // --- Pricing ---
  currency: 'INR' | 'USD';
  // The struck-through "was" price - same value api/checkout.ts already
  // reads as `originalPrice` for display, kept as the bridge field so a
  // future learner-integration change doesn't have to touch checkout at
  // all. `regularPrice` is the new admin-facing name for the same figure.
  regularPrice: number;
  // What's actually charged absent an active offer - mirrors what
  // api/checkout.ts already reads as `price`.
  sellingPrice: number;
  // Time-boxed lower price; null/no window = no offer configured. NOT YET
  // read by api/checkout.ts/api/cart.ts - this phase only stores it (see
  // this file's own header comment on learner-integration being a
  // separate, later phase). Admin preview computes the effective price
  // from these fields via src/features/admin/lib/offerStatus.ts.
  offerPrice: number | null;
  offerStart: Timestamp | null;
  offerEnd: Timestamp | null;
  offerCancelledAt: Timestamp | null;
  renewalPrice: number | null;
  taxTreatment: 'inclusive' | 'exclusive' | 'exempt';
  isFree: boolean;

  status: PackageStatus;
  // Derived from `status` at write time - see CertificationDoc.isPublished
  // for why this bridge field exists.
  isPublished: boolean;
  // Same value as `sellingPrice`/`regularPrice` above - kept so
  // api/checkout.ts's existing `price`/`originalPrice` reads keep working
  // unmodified once/if learner integration is wired up.
  price: number;
  originalPrice: number | null;
  // Ordering within a certification's package-selector row.
  displayOrder: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PurchasableItemType = 'quiz' | 'practiceTest' | 'package';

/** carts/{uid} - one cart per student. Items never store a price; the
 * price is always re-read live from the quiz/practiceTest doc so an admin
 * price change (or a discontinued item) is reflected instantly and can't be
 * gamed by a stale cart entry. A cart can only ever hold items in one
 * currency at a time (enforced in api/cart.ts's addItem) - Razorpay orders
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

/** wishlists/{uid} - one wishlist per student, same shape/reasoning as
 * CartDoc (never stores price/title, always re-read live) but with no
 * single-currency constraint since a wishlist is never checked out
 * directly - items move to the cart or straight to Buy Now from here. */
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

/** coupons/{CODE} - doc id is the uppercased code itself, for an O(1) lookup
 * instead of a query. Admin-managed. */
export interface CouponDoc {
  discountType: 'percent' | 'flat';
  // percent: 1-95 (see api/checkout.ts for why 100 is disallowed); flat: paise.
  discountValue: number;
  active: boolean;
  expiresAt: Timestamp | null;
  maxUses: number | null;
  usedCount: number;
  // Set only on a Refer & Earn reward coupon (see ReferralDoc) - restricts
  // redemption to this one uid instead of the code being usable by whoever
  // has it. Absent on every admin-created coupon (those stay usable by any
  // signed-in learner, same as before this field existed).
  restrictedToUserId?: string;
  createdBy: string;
  createdAt: Timestamp;
}

/** orders/{orderId} - one checkout attempt. Prices are snapshotted here at
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
  // How much of this account's own Refer & Earn credit balance was
  // applied (see api/checkout.ts's createOrder), and which
  // creditLedgerEntries docs it was drawn from - recorded for audit
  // traceability, same reasoning as couponCode. Empty/0 on an order that
  // didn't use any credit, or one that predates this field.
  creditAppliedMinor: number;
  creditEntryIdsUsed: string[];
  subtotal: number;
  discount: number;
  total: number;
  currency: 'INR' | 'USD';
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  // Set only once status is 'refunded' - see api/admin.ts's refundOrder.
  refundedAt: Timestamp | null;
  refundReason: string | null;
  // Buy Now creates an order straight from one item, bypassing the cart -
  // finalizeOrder only clears the cart on payment for a fromCart order,
  // otherwise a Buy Now purchase would wipe out unrelated items someone
  // still had sitting in their cart.
  fromCart: boolean;
  // The four mandatory purchase-consent acknowledgements the buyer ticked
  // at checkout, plus when. Enforced server-side in api/checkout.ts's
  // createOrder (all four must be true). The authoritative, immutable copy
  // lives in purchaseConsents/{orderId} (PurchaseConsentDoc); this is a
  // convenience copy on the order. Absent on orders that predate this.
  consent?: PurchaseConsentAcknowledgements;
  // Policy version identifiers shown to the buyer at checkout (see
  // src/features/marketing/policyVersions.ts). Absent on older orders.
  policyVersions?: Record<string, string>;
  createdAt: Timestamp;
  paidAt: Timestamp | null;
}

export interface PurchaseConsentAcknowledgements {
  correctProduct: boolean;
  previewAcknowledged: boolean;
  policiesAccepted: boolean;
  technicalPolicyAcknowledged: boolean;
  /** ISO timestamp captured on the client when the last box was ticked. */
  acceptedAt: string;
}

/** purchaseConsents/{orderId} - write-once audit record of exactly what a
 * customer was shown and agreed to at purchase time. Written by
 * api/checkout.ts's createOrder (never updated except a one-time
 * razorpayPaymentId/paidAt patch by finalizeOrder). Deliberately
 * independent of the mutable orders/{id} doc and of the current product
 * configuration, so a later price/policy change cannot rewrite history. */
export interface PurchaseConsentDoc {
  userId: string;
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  currency: 'INR' | 'USD';
  subtotal: number;
  discount: number;
  total: number;
  items: {
    itemType: PurchasableItemType;
    itemId: string;
    certificationId: string | null;
    displayedName: string;
    displayedPrice: number;
    accessPeriodLabel: string;
  }[];
  consent: PurchaseConsentAcknowledgements;
  policyVersions: Record<string, string>;
  consentRecordedAt: Timestamp;
  paidAt: Timestamp | null;
}

/** purchases/{uid}_{itemType}_{itemId} - the entitlement record. Composite
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
  // Set only when this purchase doc was written as part of a Package's
  // fan-out (see PackageDoc) rather than a direct individual purchase -
  // used for audit/display ("unlocked via the CISA Complete package") and
  // to distinguish package-derived access (which can expire) from a direct
  // purchase (lifetime). Absent on every purchase made before packages
  // existed, and on every direct (non-package) purchase.
  sourcePackageId?: string;
  // When package-derived access lapses: purchasedAt + the package's
  // accessValidityDays. null / absent = no expiry (a direct purchase, or a
  // package with validity 0). Every entitlement gate treats
  // `expiresAt && expiresAt < now` as not-owned; buying the package again
  // overwrites this doc with a fresh window.
  expiresAt?: Timestamp | null;
}

/** reviews/{uid}_{itemType}_{itemId} - one student's rating/review of one
 * item. Composite doc id (same convention as PurchaseDoc/PracticeProgressDoc)
 * makes "does this user already have a review for this item" an O(1)
 * doc-get, and a resubmission is a plain overwrite (one review per user per
 * item, edit-in-place rather than a growing history). itemId alone is
 * globally unique across quizzes/practiceTests (independent Firestore
 * auto-ids), so api/reviews.ts queries only filter by itemId, not itemType
 * too - kept here on the doc anyway for display/debugging. */
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

/** quizAttempts/{attemptId} - one student's attempt at one quiz. */
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

export type PracticeFeedbackMode = 'immediate' | 'end_of_session';
export type PracticeConfidence = 'guessing' | 'unsure' | 'confident';

/** practiceSessions/{sessionId} - one batch within a practice test. */
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
  // 'immediate' (Learn As You Go) reveals correctness/explanation right
  // after each answer; 'end_of_session' (Review At End) hides all of that
  // until the whole batch is submitted (see api/practice-session.ts's
  // saveAnswer, which enforces this server-side, not just in the UI).
  // Missing on any session created before this field existed - treated as
  // 'immediate', matching how every session behaved before this feature.
  feedbackMode?: PracticeFeedbackMode;
  // Practice Momentum (Release 2) - Master My Mistakes session, drawn from
  // practiceProgress.incorrectQuestionIds rather than unseen questions.
  // Same "doesn't count toward unique coverage" treatment as isReattempt,
  // kept as its own flag rather than overloading isReattempt so the
  // completion screen can tell "redo my last batch" from "drill my
  // mistakes" apart.
  isMastery?: boolean;
  // Intelligent Learning (Release 3) - same "doesn't count toward unique
  // coverage" treatment, drawn from a different source: isWeakAreas from
  // practiceProgress.questionStats entries with low cumulative accuracy;
  // isRevision from the full question bank, only ever startable once
  // uniqueCoverage is already 100% (Section 32's "Revision Cycle").
  isWeakAreas?: boolean;
  isRevision?: boolean;
  // Correct-answer-in-a-row within this session; resets to 0 on a miss.
  // Practice Test only - never read or written by quiz-session.ts.
  currentStreak?: number;
  bestStreakThisSession?: number;
}

/** practiceSessions/{sessionId}/answers/{questionId} - immediate feedback, so isCorrect is known right away. */
export interface PracticeAnswerDoc {
  selectedOptionId: string;
  isCorrect: boolean;
  answeredAt: Timestamp;
  // Optional self-rating, learning analytics only - never affects grading
  // (see api/practice-session.ts's saveAnswer: confidence is stored
  // alongside isCorrect, computed independently of it).
  confidence?: PracticeConfidence;
}

/** practiceProgress/{uid_testId} - denormalized so "resume, only unanswered" doesn't scan every past session. */
export interface PracticeProgressDoc {
  userId: string;
  testId: string;
  answeredQuestionIds: string[];
  lastBatchQuestionIds: string[];
  updatedAt: Timestamp;
  // Practice Momentum (Release 2) - motivational only, never read by any
  // entitlement/progress/coverage calculation. bestStreak is this test's
  // all-time longest correct-streak (compared at submitBatch); xpTotal is
  // lifetime XP for this test; incorrectQuestionIds feeds Master My
  // Mistakes - added on a miss, removed the moment that same question is
  // answered correctly again in any session.
  bestStreak?: number;
  xpTotal?: number;
  incorrectQuestionIds?: string[];
  // Intelligent Learning (Release 3) - cumulative attempts/correct per
  // question across every session type (normal, reattempt, mastery, weak
  // areas, revision), plus the most recent confidence rating. Powers the
  // Question Bank Dashboard's Mastered/Learning/Needs Review buckets and
  // Weak Areas selection - never read by any entitlement/coverage
  // calculation, and never affects grading.
  questionStats?: Record<string, { attempts: number; correct: number; lastConfidence?: PracticeConfidence }>;
}

// Personal Study Planner (Phase 1) - attaches to a practice test only, not a
// quiz (see the proposal's own scope note: "course" in the product brief
// maps to a practiceTest's totalQuestions, not a timed single-attempt
// quiz). One Mon-Sun selection of which days the learner intends to study;
// all true by default.
export interface StudyDaySelection {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
}

export const ALL_STUDY_DAYS: StudyDaySelection = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

export type StudyPlanningMode = 'examDate' | 'pace';

/** studyPlans/{uid}_{testId} - one active plan per (learner, practice test).
 * Calculated numbers (daily target, ahead/behind, exam-ready date) are never
 * stored here - they're recomputed live on every read from this doc plus
 * practiceProgress/practiceSessions, so an admin changing totalQuestions or
 * a learner catching up never leaves a stale cached number behind. The only
 * "calculated" values kept here are the baseline trio, frozen once at
 * creation (or reset) specifically so ahead/on-track/catch-up status has a
 * fixed reference point to compare today's live numbers against. */
export interface StudyPlanDoc {
  userId: string;
  // For a legacy per-test plan this is the practice test. For a series plan
  // (scope: 'series') it is the first batch id, kept populated only so
  // readers that key off testId still resolve a doc.
  testId: string;
  // Absent = 'test' (a per-practice-test plan). 'series' = one goal covering
  // every batch of a generated series (studyPlans/{uid}_series_{seriesId}),
  // with progress aggregated across seriesBatchIds. See api/practice-session.ts.
  scope?: 'test' | 'series';
  seriesId?: string | null;
  certificationId?: string | null;
  certificationName?: string | null;
  // Every practiceTests batch in the series, so home/stat-row readers can
  // aggregate practiceProgress without a contentSeries fetch.
  seriesBatchIds?: string[];
  seriesTotalQuestions?: number;
  planningMode: StudyPlanningMode;
  // Option A only.
  targetExamDate: Timestamp | null;
  // Option B only - exactly one of these two is the learner's actual input;
  // the other is a derived display value, never a second stored input.
  paceQuestionsPerDay: number | null;
  paceMinutesPerDay: number | null;
  studyDays: StudyDaySelection;
  // Copied from the practice test's own default at creation time (see
  // PracticeTestDoc.revisionBufferDays), not recomputed if the admin
  // changes the course default later - an existing plan keeps the buffer
  // it was built around.
  revisionBufferDays: number;
  // Frozen at creation, or at the last explicit plan reset (exam date/pace/
  // study-days change) - see the calculation engine for how these three
  // turn "ahead/behind" into a single live comparison instead of a
  // separately-tracked progress ledger.
  baselineDailyTarget: number;
  baselineAnsweredCount: number;
  baselineDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// One doc per (learner, test, milestone) - existence alone means "already
// celebrated," a plain write-once record. `value` is only set for the two
// personal-best milestones (accuracy, mock score), where a *new* best still
// needs to re-trigger a celebration unlike the one-shot question/streak ones.
export interface StudyMilestoneDoc {
  userId: string;
  testId: string;
  milestoneKey: string;
  reachedAt: Timestamp;
  value?: number;
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
  // Products & Pricing audit trail (item 19) reuses this same collection
  // rather than a parallel one - these three are optional so every
  // pre-existing log entry (which never set them) still matches this type.
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

export type CertificateSourceType = 'quiz' | 'practiceTest';
export type CertificateStatus = 'issued' | 'revoked' | 'superseded' | 'invalid';

/** certificates/{certificateId} - a learner's completion certificate for
 * one finished, eligible quiz attempt or practice-test completion. Doc id
 * is a Firestore auto-id (not a predictable/sequential value - see item
 * "Prevent predictable database IDs" in the spec this was built against),
 * used directly as the public Certificate ID shown on the PDF, in the
 * download filename, and in the /verify/:certificateId URL/QR code.
 *
 * Every field the PDF renders is snapshotted here at issuance time from
 * server-trusted sources only (the users/{uid} doc for the name, the
 * graded quizAttempts/practiceProgress doc for the score/completion data)
 * - never re-derived from, or trusted from, a client request at download
 * time. api/results.ts's issueOrGetCertificate is the only writer.
 *
 * Idempotency: `sourceAttemptKey` is a deterministic string
 * (`{learnerUid}_{sourceType}_{sourceId}_{attemptId}`) checked via an
 * equality-filter query before every issuance - a repeat request for the
 * same completed attempt returns the existing doc instead of minting a
 * second certificate, while a genuinely new attempt (a fresh quizAttempts
 * doc, since QuizDoc.maxAttempts allows more than one) gets its own. */
export interface CertificateDoc {
  learnerUid: string;
  learnerName: string;
  sourceType: CertificateSourceType;
  sourceId: string;
  sourceTitle: string;
  // Best-effort "which certification track this prepares for" label
  // (PracticeTestDoc.examName, falling back to category) - display only.
  certificationName: string;
  attemptId: string;
  attemptNumber: number;
  questionsCompleted: number;
  totalQuestions: number;
  // null for a practice-test certificate - practice has no pass/fail score,
  // only a completion state (see PracticeTestDoc's own "no pass/fail
  // concept" comment elsewhere in this file).
  scoreCorrect: number | null;
  completionPercent: number;
  passMarkPercent: number | null;
  completedAt: Timestamp;
  durationSeconds: number | null;
  status: CertificateStatus;
  revokedAt: Timestamp | null;
  revokedReason: string | null;
  sourceAttemptKey: string;
  createdAt: Timestamp;
}

/** certificateAccessLogs/{logId} - one doc per view/download/verify, kept
 * separate from adminLogs since this is a learner (and, for verify,
 * possibly anonymous) action, not an admin one. */
export interface CertificateAccessLogDoc {
  certificateId: string;
  learnerUid: string | null; // null for an anonymous public verification
  action: 'view' | 'download' | 'verify';
  createdAt: Timestamp;
}

// ===========================================================================
// Partner Commission Framework (see Common_Partner_Commission_Framework_PRD.md)
// Phase 1: identity, offers, versioned policy, referral codes, audit.
// Every doc carries productId so the same core serves Bizzux / JobGalax later.
// All money is integer minor units (paise); commission rate is basis points
// (2000 = 20%). Collections are Admin-SDK-write-only; see firestore.rules.
// ===========================================================================

/** e.g. 'HELPCERTIFY'. A free string so the core stays product-agnostic. */
export type ProductId = string;
export type PartnerType = 'referral' | 'sales' | 'implementation' | 'agency';

export type PartnerApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export type PartnerPayoutStatus = 'OK' | 'KYC_ACTION_REQUIRED' | 'PAYOUT_BLOCKED';
export type PanStatus = 'CAPTURED' | 'FORMAT_VALID' | 'VERIFIED' | 'MISMATCH' | 'INVALID';

/** partnerApplications/{id} - one per submission by a signed-in user.
 * The full PAN / GSTIN / address live in a SEPARATE deny-all collection
 * partnerApplicationKyc/{appId} - never here, because an applicant can read
 * their own application doc back. Only non-sensitive mirrors (panMasked,
 * panLast4) stay on this doc. On approval the KYC is promoted to
 * partnerKyc/{partnerId}. */
export interface PartnerApplicationDoc {
  userId: string;
  productId: ProductId;
  legalName: string;
  displayName: string;
  dateOfBirth: string; // ISO yyyy-mm-dd; 18+ enforced client + server
  phone: string;
  partnerType: PartnerType;
  country: string; // ISO-3166 alpha-2; 'IN' requires PAN
  agreementVersion: string;
  panConsentVersion: string | null;
  panMasked: string | null; // ABCDE****F
  panLast4: string | null;
  panStatus: PanStatus | null;
  gstinMasked: string | null;
  duplicatePanFlag: boolean;
  status: PartnerApplicationStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  partnerId: string | null; // set once status === 'APPROVED'
  submittedAt: Timestamp;
  updatedAt: Timestamp;
}

/** partnerApplicationKyc/{appId} - Admin-SDK-only (allow read, write: if false).
 * Deleted when the application is approved (promoted to partnerKyc) or
 * rejected. */
export interface PartnerApplicationKycDoc extends PartnerKycInput {
  appId: string;
  userId: string;
  createdAt: Timestamp;
}

/** The sensitive block captured at application and promoted to
 * partnerKyc/{partnerId} on approval. Never returned to any client. */
export interface PartnerKycInput {
  panFull: string;
  panHash: string; // sha256(normalizedPan) - duplicate detection only
  panName: string | null; // name as printed on the PAN card
  gstin: string | null;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/** partnerKyc/{partnerId} - Admin-SDK-only (rules: allow read, write: if false).
 * Full PAN lives here and nowhere client-reachable. Revealing it is a
 * dedicated audited admin action gated on users/{uid}.canRevealPan. */
export interface PartnerKycDoc extends PartnerKycInput {
  partnerId: string;
  panStatus: PanStatus;
  verificationProvider: string | null;
  verificationRef: string | null;
  verifiedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PartnerStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

/** partners/{partnerId} - doc id is a non-guessable code (e.g. HCP + base32).
 * linkedUserId is also mirrored onto users/{uid}.partnerId. KYC (PAN / bank)
 * is not collected in Phase 1; when it is, those fields are masked in every
 * UI and excluded from audit logs. */
export interface PartnerDoc {
  linkedUserId: string;
  productId: ProductId;
  displayName: string;
  partnerType: PartnerType;
  status: PartnerStatus;
  agreementVersion: string;
  suspendedReason: string | null;
  createdBy: string; // reviewing staff uid
  country: string;
  panMasked: string | null;
  panLast4: string | null;
  panStatus: PanStatus | null;
  // Gates inclusion in a payout batch. Starts KYC_ACTION_REQUIRED at
  // approval (PAN captured, not yet verified); a staff member moves it to
  // OK, or the system blocks it.
  payoutStatus: PartnerPayoutStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** partnerAgreements/{id} - immutable acceptance record, one per accept. */
export interface PartnerAgreementDoc {
  partnerId: string;
  version: string;
  acceptedAt: Timestamp;
  ip: string | null;
}

/** products/{productId} - one per integrated product; seeded once. */
export interface PartnerProductDoc {
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  baseUrl: string;
  currency: 'INR' | 'USD';
  defaultAttributionDays: number;
  defaultHoldDays: number;
  /** Product-default commission policy (PRD precedence level 5). Used when no
   * more specific offer policy matches the order. null = no commission. */
  defaultCommissionPolicyId: string | null;
  allowReferralCode: boolean;
  allowLeadRegistration: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** offers/{offerId} - a sellable plan a partner can be paid for promoting.
 * externalRef points at the product's own catalogue (a packages/{id} here). */
export interface PartnerOfferDoc {
  productId: ProductId;
  externalRef: string;
  name: string;
  eligiblePartnerTypes: PartnerType[];
  commissionPolicyId: string;
  holdDays: number;
  combineWithDiscount: boolean;
  validFrom: Timestamp | null;
  validTo: Timestamp | null;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CommissionRuleType = 'percent' | 'fixed' | 'tiered';

/** commissionPolicies/{policyId} - the container; the actual numbers live in
 * an append-only versions subcollection so a historical order can always
 * retain the version applied when its payment order was created. */
export interface CommissionPolicyDoc {
  productId: ProductId;
  name: string;
  activeVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** commissionPolicies/{policyId}/versions/{version} - never edited once
 * written. A new version supersedes; old orders keep their frozen version. */
export interface CommissionPolicyVersionDoc {
  version: number;
  ruleType: CommissionRuleType;
  rateBasisPoints: number; // 2000 = 20%; used for 'percent'
  fixedAmountMinor: number | null; // used for 'fixed'
  tiers: { minMonthlySales: number; rateBasisPoints: number }[] | null; // 'tiered'
  maxCommissionMinor: number | null;
  firstPurchaseOnly: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

/** referralCodes/{NORMALISED_CODE} - doc id IS the code (upper-cased). One
 * partner has many; suspending the partner sets active:false on all of them. */
export interface ReferralCodeDoc {
  partnerId: string;
  productId: ProductId;
  offerId: string | null;
  active: boolean;
  createdAt: Timestamp;
}

/** referralEvents/{id} - a click / landing-page visit carrying ?ref=. Used
 * for velocity checks and the referral->paid conversion report. */
export interface ReferralEventDoc {
  code: string;
  productId: ProductId;
  ipHash: string | null;
  uaHash: string | null;
  landingPath: string | null;
  createdAt: Timestamp;
}

export type AuditActorType = 'staff' | 'partner' | 'system' | 'customer';

/** auditEvents/{id} - append-only. before/after already have PAN / bank /
 * UPI / token / full-email fields stripped before write (see
 * src/features/partner/lib/auditEvent.ts). */
export interface AuditEventDoc {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorType: AuditActorType;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: Timestamp;
}

export type AttributionMethod = 'REFERRAL_LINK' | 'REFERRAL_CODE';

/** The attribution + policy snapshot frozen onto orders/{orderId} at
 * createOrder time (Phase 2). Null on every non-attributed order. Never
 * rewritten after the payment order exists except by an audited admin
 * correction. */
export interface OrderPartnerAttribution {
  partnerId: string;
  attributionMethod: AttributionMethod;
  referralCodeSnapshot: string;
  commissionable: boolean; // false = attributed but no commission (e.g. repeat customer, no policy)
  ineligibleReason: string | null;
  commissionPolicyId: string | null;
  commissionPolicyVersion: number | null;
  commissionRateBasisPoints: number | null;
  commissionBaseMinor: number | null; // eligible base, frozen
  maxCommissionMinor: number | null;
  frozenAt: Timestamp;
}

export type CommissionStatus =
  | 'PENDING_HOLD'
  | 'APPROVED'
  | 'PAYABLE'
  | 'PROCESSING'
  | 'PAID'
  | 'ON_HOLD'
  | 'REJECTED'
  | 'REVERSED'
  | 'RECOVERABLE';

/** commissions/{orderId} - doc id IS the internal order id, so creation is
 * idempotent against a webhook + client double-finalize. One order has at
 * most one primary commission owner in the MVP. */
export interface CommissionDoc {
  orderId: string;
  partnerId: string;
  productId: ProductId;
  customerId: string;
  currency: string;
  eligibleBaseMinor: number;
  rateBasisPoints: number;
  grossCommissionMinor: number;
  deductionsMinor: number;
  netPayableMinor: number;
  status: CommissionStatus;
  holdUntil: Timestamp | null;
  onHoldReason: string | null;
  // Cumulative commission unwound by (possibly partial) refunds. When it
  // reaches grossCommissionMinor the status becomes REVERSED; below that the
  // commission stays live with netPayableMinor reduced.
  reversedMinor: number;
  commissionPolicyId: string;
  commissionPolicyVersion: number;
  payoutBatchId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** paymentEvents/{providerEventId} - Admin-SDK-only. One doc per processed
 * Razorpay webhook delivery (x-razorpay-event-id) or client verify
 * (razorpay_payment_id), written inside the finalize transaction so a
 * duplicate delivery is a true no-op even under a race (PRD 15). */
export interface PaymentEventDoc {
  provider: 'RAZORPAY';
  eventId: string;
  source: 'webhook' | 'client';
  orderId: string | null;
  type: string | null;
  receivedAt: Timestamp;
}

/** commissionLedger/{id} - append-only. Every commission status change
 * writes one row here; financial history is never overwritten. */
export interface CommissionLedgerDoc {
  commissionId: string; // = orderId
  orderId: string;
  partnerId: string;
  fromStatus: CommissionStatus | null;
  toStatus: CommissionStatus;
  amountMinor: number; // signed: negative on REVERSED / RECOVERABLE
  reason: string;
  actorId: string;
  actorType: AuditActorType;
  createdAt: Timestamp;
}

export type PartnerPayoutMethod = 'BANK' | 'UPI';

/** partners/{id}.payout - the destination for a MANUAL payout. Finance needs
 * the real values to pay by hand in the MVP (there is no RazorpayX
 * automation); rules deny client reads except the owning partner + staff,
 * and auditEvent redaction strips these keys from every audit doc. */
export interface PartnerPayoutDetails {
  method: PartnerPayoutMethod;
  accountName: string;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiVpa: string | null;
  panLast4: string | null;
  updatedAt: Timestamp;
}

export type PayoutBatchStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';

/** payoutBatches/{batchId} - a monthly run. Maker/checker: approvedBy must
 * differ from createdBy. Money never moves automatically - a human records
 * the external transfer reference and marks it PAID. */
export interface PayoutBatchDoc {
  productId: ProductId;
  periodLabel: string; // e.g. "2026-08"
  status: PayoutBatchStatus;
  commissionCount: number;
  grossMinor: number;
  currency: string;
  createdBy: string;
  approvedBy: string | null;
  paidBy: string | null;
  externalReference: string | null; // bank UTR / RazorpayX id, entered by hand
  note: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PayoutStatus = 'PENDING' | 'PAID' | 'FAILED';

/** payouts/{payoutId} - one partner's slice of a batch, and the partner
 * statement row. Doc id = `${batchId}_${partnerId}`. */
export interface PayoutDoc {
  batchId: string;
  partnerId: string;
  productId: ProductId;
  periodLabel: string;
  currency: string;
  commissionIds: string[];
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  status: PayoutStatus;
  externalReference: string | null;
  paidAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
