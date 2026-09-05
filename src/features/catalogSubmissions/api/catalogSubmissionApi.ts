import { callAction } from '@/lib/vercelApi';

// Catalog Submissions - shared by both the Trainer Workspace and the
// Creator Workspace, since either an active Trainer or an approved
// Creator may author a full question bank and submit it for admin review
// (api/content-admin.ts's requireCatalogAuthor checks both identities the
// same way). Once an admin approves and publishes it, it becomes a real
// quizzes/{id} or practiceTests/{id} doc - see that file's comment block
// above requireCatalogAuthor for the full design.

export interface MyCatalogSubmission {
  id: string;
  itemType: 'quiz' | 'practiceTest';
  title: string;
  category: string;
  skillLevel: string;
  suggestedPrice: number;
  currency: 'INR' | 'USD';
  totalQuestions: number;
  parseWarnings: string[];
  status: 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
  reviewNote: string | null;
  publishedItemId: string | null;
  createdAt: unknown;
}

export const catalogSubmissionApi = {
  create: (payload: {
    itemType: 'quiz' | 'practiceTest';
    title: string;
    category?: string;
    skillLevel?: 'Foundation' | 'Associate' | 'Expert';
    description?: string;
    suggestedPrice?: number;
    currency?: 'INR' | 'USD';
    fileUrl: string;
  }) =>
    callAction<{ submissionId: string; totalQuestions: number; parseErrors: unknown[]; parseWarnings: string[] }>(
      'content-admin',
      'createCatalogSubmission',
      payload
    ),
  listMine: () => callAction<{ submissions: MyCatalogSubmission[] }>('content-admin', 'listMyCatalogSubmissions'),
  withdraw: (submissionId: string) =>
    callAction<{ success: true }>('content-admin', 'withdrawCatalogSubmission', { submissionId }),
};

export interface AdminCatalogSubmission extends MyCatalogSubmission {
  authorUid: string;
  authorType: 'trainer' | 'creator';
  description: string;
}

export const catalogSubmissionAdminApi = {
  list: (status?: string) =>
    callAction<{ submissions: AdminCatalogSubmission[] }>(
      'content-admin',
      'listCatalogSubmissionsAdmin',
      status ? { status } : {}
    ),
  decide: (payload: { submissionId: string; decision: 'approve' | 'changes' | 'reject'; note?: string }) =>
    callAction<{ status: string }>('content-admin', 'decideCatalogSubmission', payload),
  publish: (payload: {
    submissionId: string;
    price: number;
    originalPrice?: number | null;
    accessPeriodDays?: number;
    passMarkPercent?: number;
    durationMinutes?: number;
  }) =>
    callAction<{ publishedItemId: string; itemType: 'quiz' | 'practiceTest' }>(
      'content-admin',
      'publishCatalogSubmission',
      payload
    ),
};
