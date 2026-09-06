import { callAction } from '@/lib/vercelApi';
import type {
  QuestionSourceFormat,
  DurationType,
  SkillLevel,
  CertificationIconKey,
  CertificationStatus,
  PackageStatus,
  ContentVersionDoc,
  MockBlueprintDoc,
} from '@/types/models';

export interface QuestionOption {
  id: string;
  text: string;
}

// One entry per question the .docx parser (api/content-admin.ts) had to
// skip - surfaced in the create-form's upload report, not just the browser
// console, so an admin can actually see what needs fixing in the source
// file without opening dev tools.
export interface ParseErrorEntry {
  line: number;
  message: string;
  rawText: string;
}
export interface EditableQuestion {
  id: string;
  order: number;
  questionText: string;
  options: QuestionOption[];
  correctOptionId: string | null;
  // Optional domain/topic tag (Intelligent Learning) - the only way a
  // question ever gets one; never set by the bulk .docx upload parser.
  domain?: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  code: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  durationType: DurationType;
  durationMinutes: number;
  // Serialized Firestore Timestamp over JSON - { _seconds, _nanoseconds },
  // not { seconds }. Read via @/utils/formatDate's toDate(), never this
  // field directly (see QuizTakingPage.tsx's countdown-timer bug history).
  scheduledStart: unknown;
  isPublished: boolean;
  enforceSequentialNav: boolean;
  showImmediateResult: boolean;
  showFinalScore: boolean;
  antiCheat: { blockAltTab: boolean };
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union - the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  passMarkPercent: number;
  previewQuestionCount: number;
  // Access period shown at checkout. 0 = "Lifetime access". Defaults to 0
  // on quizzes created before this field existed.
  accessPeriodDays?: number;
}

export interface PracticeTestSummary {
  id: string;
  title: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  // null when the admin has left session length up to each student (see
  // api/practice-session.ts's startOrResumeBatch) instead of setting one.
  durationPerSessionMinutes: number | null;
  defaultInitialBatchSize: number;
  // Serialized Firestore Timestamp over JSON - { _seconds, _nanoseconds },
  // not { seconds }. Read via @/utils/formatDate's toDate().
  availableFrom: unknown;
  availableUntil: unknown;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union - the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  // The certification/exam this test prepares for (e.g. "CISA") - distinct
  // from `title`. See PracticeTestDoc.examName in src/types/models.ts.
  examName?: string;
  previewQuestionCount: number;
  // Personal Study Planner (Phase 1) config - see CreatePracticeTestPayload's
  // comment on the same three fields.
  revisionBufferDays?: number;
  defaultMinutesPerQuestion?: number;
  studyPlannerEnabled?: boolean;
  // Access period shown at checkout. 0 = "Lifetime access".
  accessPeriodDays?: number;
}

export interface CreateQuizPayload {
  title: string;
  sourceFormat: QuestionSourceFormat;
  fileUrl: string;
  durationType: DurationType;
  durationMinutes: number;
  enforceSequentialNav: boolean;
  showImmediateResult: boolean;
  showFinalScore: boolean;
  scheduledStart?: string;
  blockAltTab: boolean;
  price: number;
  originalPrice?: number | null;
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union - the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  passMarkPercent: number;
  previewQuestionCount: number;
  accessPeriodDays?: number;
}

export interface CreatePracticeTestPayload {
  title: string;
  // The certification/exam this test prepares for (e.g. "CISA") - distinct
  // from `title`. See PracticeTestDoc.examName in src/types/models.ts.
  examName?: string;
  sourceFormat: QuestionSourceFormat;
  fileUrl: string;
  availableFrom: string;
  availableUntil: string;
  // null means the admin is leaving session length up to each student -
  // see PracticeTestSummary's comment on this same field.
  durationPerSessionMinutes: number | null;
  defaultInitialBatchSize: number;
  price: number;
  originalPrice?: number | null;
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union - the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  previewQuestionCount: number;
  // Personal Study Planner (Phase 1) config - see api/content-admin.ts's
  // createPracticeTestSchema for defaults.
  revisionBufferDays?: number;
  defaultMinutesPerQuestion?: number;
  studyPlannerEnabled?: boolean;
  accessPeriodDays?: number;
}

// --- Products & Pricing: Certifications / Packages ------------------------

export interface CertificationAdminRow {
  id: string;
  shortName: string;
  name: string;
  provider: string;
  slug: string;
  category: string;
  shortDescription: string;
  description: string;
  iconKey: CertificationIconKey;
  effectiveFrom: unknown;
  effectiveTo: unknown;
  defaultValidityDays: number;
  featured: boolean;
  status: CertificationStatus;
  independentPrepDisclaimer: string;
  practiceBankId: string | null;
  mockBankId: string | null;
  practiceBankIds: string[];
  mockBankIds: string[];
  seriesId: string | null;
  contentVersions: ContentVersionDoc[];
  mockBlueprints: MockBlueprintDoc[];
  isPublished: boolean;
  displayOrder: number;
  updatedAt: unknown;
}

export interface PackageAdminRow {
  id: string;
  certificationId: string;
  packageType: string;
  name: string;
  shortDescription: string;
  includedFeatures: string[];
  badgeText: string | null;
  isRecommended: boolean;
  description: string;
  includedQuizIds: string[];
  includedPracticeTestIds: string[];
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
  currency: 'INR' | 'USD';
  regularPrice: number;
  sellingPrice: number;
  offerPrice: number | null;
  offerStart: unknown;
  offerEnd: unknown;
  offerCancelledAt: unknown;
  renewalPrice: number | null;
  taxTreatment: 'inclusive' | 'exclusive' | 'exempt';
  isFree: boolean;
  comboDiscount: { mode: 'percent' | 'amount'; value: number } | null;
  status: PackageStatus;
  isPublished: boolean;
  displayOrder: number;
  updatedAt: unknown;
}

export interface CreateCertificationPayload {
  shortName: string;
  name: string;
  provider: string;
  slug: string;
  category: string;
  shortDescription: string;
  description: string;
  iconKey: CertificationIconKey;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  defaultValidityDays: number;
  featured: boolean;
  independentPrepDisclaimer: string;
  displayOrder: number;
  practiceBankId?: string | null;
  mockBankId?: string | null;
}

export interface CreateBatchedSeriesPayload {
  certificationId: string;
  fileUrl: string;
  sourceFormat: QuestionSourceFormat;
  examName: string;
  category: string;
  practiceBatchSize: number;
  mockCount: number;
  mockBatchSize: number;
  mockDurationMinutes: number;
  passMarkPercent: number;
  previewQuestionCount: number;
  durationPerSessionMinutes: number | null;
}

export interface CreatePackagePayload {
  certificationId: string;
  name: string;
  badgeText?: string | null;
  isRecommended: boolean;
  description: string;
  includedQuizIds: string[];
  includedPracticeTestIds: string[];
  displayOrder: number;
  packageType: string;
  shortDescription: string;
  includedFeatures: string[];
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
  regularPrice: number;
  sellingPrice: number;
  offerPrice?: number | null;
  offerStart?: string | null;
  offerEnd?: string | null;
  renewalPrice?: number | null;
  taxTreatment: 'inclusive' | 'exclusive' | 'exempt';
  isFree: boolean;
  currency: 'INR' | 'USD';
  comboDiscount?: { mode: 'percent' | 'amount'; value: number } | null;
}

export interface AuditLogEntry {
  id: string;
  performedBy: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: unknown;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

export const contentAdminApi = {
  createQuiz: (payload: CreateQuizPayload) =>
    callAction<{ quizId: string; totalQuestions: number; parseErrors: ParseErrorEntry[]; parseWarnings: string[] }>(
      'content-admin',
      'createQuiz',
      { ...payload }
    ),
  updateQuiz: (
    payload: { quizId: string } & Partial<Omit<CreateQuizPayload, 'scheduledStart'>> & {
        isPublished?: boolean;
        scheduledStart?: string | null;
      }
  ) => callAction<{ success: true }>('content-admin', 'updateQuiz', { ...payload }),
  deleteQuiz: (quizId: string) => callAction<{ success: true }>('content-admin', 'deleteQuiz', { quizId }),
  listQuizzesAdmin: () => callAction<{ quizzes: QuizSummary[] }>('content-admin', 'listQuizzesAdmin'),
  getQuizAnswerKey: (quizId: string) =>
    callAction<{ quiz: QuizSummary; questions: EditableQuestion[] }>('content-admin', 'getQuizAnswerKey', { quizId }),
  updateQuizQuestion: (payload: {
    quizId: string;
    questionId: string;
    questionText: string;
    options: QuestionOption[];
    correctOptionId: string;
    domain?: string;
  }) => callAction<{ success: true }>('content-admin', 'updateQuizQuestion', { ...payload }),

  createPracticeTest: (payload: CreatePracticeTestPayload) =>
    callAction<{ testId: string; totalQuestions: number; parseErrors: ParseErrorEntry[]; parseWarnings: string[] }>(
      'content-admin',
      'createPracticeTest',
      { ...payload }
    ),
  updatePracticeTest: (payload: { testId: string } & Partial<CreatePracticeTestPayload>) =>
    callAction<{ success: true }>('content-admin', 'updatePracticeTest', { ...payload }),
  deletePracticeTest: (testId: string) =>
    callAction<{ success: true }>('content-admin', 'deletePracticeTest', { testId }),
  listPracticeTestsAdmin: () =>
    callAction<{ practiceTests: PracticeTestSummary[] }>('content-admin', 'listPracticeTestsAdmin'),
  getPracticeTestAnswerKey: (testId: string) =>
    callAction<{ practiceTest: PracticeTestSummary; questions: EditableQuestion[] }>(
      'content-admin',
      'getPracticeTestAnswerKey',
      { testId }
    ),
  updatePracticeTestQuestion: (payload: {
    testId: string;
    questionId: string;
    questionText: string;
    options: QuestionOption[];
    correctOptionId: string;
    domain?: string;
  }) => callAction<{ success: true }>('content-admin', 'updatePracticeTestQuestion', { ...payload }),

  // --- Products & Pricing ---
  createBatchedSeries: (payload: CreateBatchedSeriesPayload) =>
    callAction<{
      seriesId: string;
      practiceTestIds: string[];
      mockQuizIds: string[];
      totalQuestions: number;
      parseErrors: ParseErrorEntry[];
      parseWarnings: string[];
    }>('content-admin', 'createBatchedSeries', { ...payload }),
  createCertification: (payload: CreateCertificationPayload) =>
    callAction<{ certificationId: string }>('content-admin', 'createCertification', { ...payload }),
  updateCertification: (payload: { certificationId: string } & Partial<CreateCertificationPayload>) =>
    callAction<{ success: true }>('content-admin', 'updateCertification', { ...payload }),
  deleteCertification: (certificationId: string, force?: boolean) =>
    callAction<{ success: true; deletedPackages: number }>('content-admin', 'deleteCertification', { certificationId, force }),
  publishCertification: (certificationId: string, scheduledFor?: string | null) =>
    callAction<{ success: true; status: string }>('content-admin', 'publishCertification', { certificationId, scheduledFor }),
  unpublishCertification: (certificationId: string) =>
    callAction<{ success: true }>('content-admin', 'unpublishCertification', { certificationId }),
  archiveCertification: (certificationId: string) =>
    callAction<{ success: true }>('content-admin', 'archiveCertification', { certificationId }),
  restoreCertification: (certificationId: string) =>
    callAction<{ success: true }>('content-admin', 'restoreCertification', { certificationId }),
  duplicateCertification: (certificationId: string) =>
    callAction<{ certificationId: string }>('content-admin', 'duplicateCertification', { certificationId }),
  listCertificationsAdmin: () => callAction<{ certifications: CertificationAdminRow[] }>('content-admin', 'listCertificationsAdmin'),

  saveContentVersion: (
    certificationId: string,
    version: Omit<ContentVersionDoc, 'id' | 'effectiveFrom' | 'effectiveTo'> & { id?: string; effectiveFrom: string; effectiveTo: string | null }
  ) => callAction<{ versionId: string }>('content-admin', 'saveContentVersion', { certificationId, version }),
  deleteContentVersion: (certificationId: string, versionId: string) =>
    callAction<{ success: true }>('content-admin', 'deleteContentVersion', { certificationId, versionId }),
  getBankDomainCounts: (bankType: 'quiz' | 'practiceTest', bankId: string) =>
    callAction<{ totalQuestions: number; byDomain: Record<string, number> }>('content-admin', 'getBankDomainCounts', { bankType, bankId }),
  saveMockBlueprint: (certificationId: string, blueprint: Omit<MockBlueprintDoc, 'id'> & { id?: string }) =>
    callAction<{ blueprintId: string }>('content-admin', 'saveMockBlueprint', { certificationId, blueprint }),
  deleteMockBlueprint: (certificationId: string, blueprintId: string) =>
    callAction<{ success: true }>('content-admin', 'deleteMockBlueprint', { certificationId, blueprintId }),

  createPackage: (payload: CreatePackagePayload) => callAction<{ packageId: string }>('content-admin', 'createPackage', { ...payload }),
  updatePackage: (payload: { packageId: string } & Partial<CreatePackagePayload>) =>
    callAction<{ success: true }>('content-admin', 'updatePackage', { ...payload }),
  deletePackage: (packageId: string) => callAction<{ success: true }>('content-admin', 'deletePackage', { packageId }),
  archivePackage: (packageId: string) => callAction<{ success: true }>('content-admin', 'archivePackage', { packageId }),
  restorePackage: (packageId: string) => callAction<{ success: true }>('content-admin', 'restorePackage', { packageId }),
  publishPackage: (packageId: string) => callAction<{ success: true }>('content-admin', 'publishPackage', { packageId }),
  unpublishPackage: (packageId: string) => callAction<{ success: true }>('content-admin', 'unpublishPackage', { packageId }),
  duplicatePackage: (packageId: string) => callAction<{ packageId: string }>('content-admin', 'duplicatePackage', { packageId }),
  cancelOffer: (packageId: string, reason?: string) => callAction<{ success: true }>('content-admin', 'cancelOffer', { packageId, reason }),
  listPackagesAdmin: (certificationId?: string) =>
    callAction<{ packages: PackageAdminRow[] }>('content-admin', 'listPackagesAdmin', certificationId ? { certificationId } : {}),

  getAuditHistoryForCertification: (certificationId: string) =>
    callAction<{ entries: AuditLogEntry[] }>('content-admin', 'getAuditHistoryForCertification', { certificationId }),
};
