import { callAction } from '@/lib/vercelApi';
import type { CreatorRole } from '../lib/creatorRole';

// Creator / Content Partnership (Phase 4b). Creator-facing actions live in
// api/auth.ts, staff actions in api/content-admin.ts.

export interface MyCreatorRole {
  role: string;
  status: string;
  reviewNote: string | null;
  subjectExpertise: string[];
}

export interface MyCreatorAssignment {
  id: string;
  contractId: string;
  title: string;
  targetType: string;
  status: string;
  acceptedItemCount: number;
  dueAt: string | null;
}

export interface CreatorAssignmentDetail {
  assignment: {
    id: string;
    title: string;
    targetType: string;
    status: string;
    acceptedItemCount: number;
    dueAt: string | null;
  };
  contract: {
    compensationModel: string;
    rateMinor: number;
    deliverables: string;
    acceptanceCriteria: string;
    ipAssignment: string;
    originalityDeclarationRequired: boolean;
    aiDisclosureRequired: boolean;
  } | null;
}

export const creatorApi = {
  applyRole: (payload: {
    role: CreatorRole;
    subjectExpertise: string[];
    qualifications?: string;
    sampleUrl?: string;
    acceptCreatorAgreement: true;
  }) => callAction<{ role: string; status: 'APPLIED' }>('auth', 'applyCreatorRole', payload),
  getMyRoles: () => callAction<{ roles: MyCreatorRole[] }>('auth', 'getMyCreatorRoles'),
  listMyAssignments: () => callAction<{ assignments: MyCreatorAssignment[] }>('auth', 'listMyCreatorAssignments'),
  getMyAssignment: (payload: { assignmentId: string }) =>
    callAction<CreatorAssignmentDetail>('auth', 'getMyCreatorAssignment', payload),
  saveSubmission: (payload: {
    submissionId?: string;
    assignmentId: string;
    title: string;
    items: SubmissionItem[];
    declarations: { originality: boolean; aiAssisted: boolean; aiVerifiedBy?: string; noLeakedExam: boolean };
  }) => callAction<{ submissionId: string }>('auth', 'saveContentSubmission', payload),
  submitSubmission: (payload: { submissionId: string }) =>
    callAction<{ status: string; duplicateHits: number; leakedPhraseHits: number }>('auth', 'submitContentSubmission', payload),
  withdrawSubmission: (payload: { submissionId: string }) =>
    callAction<{ status: string }>('auth', 'withdrawContentSubmission', payload),
  listMySubmissions: () => callAction<{ submissions: MyContentSubmission[] }>('auth', 'listMyContentSubmissions'),
  listMyEarnings: () =>
    callAction<{ earnings: CreatorEarningRow[]; totals: CreatorEarningTotals }>('auth', 'listMyCreatorEarnings'),
};

export interface CreatorEarningRow {
  id: string;
  type: string;
  qty: number;
  grossMinor: number;
  netMinor: number;
  status: string;
  holdUntil: string | null;
  createdAt: string | null;
}

export interface CreatorEarningTotals {
  pendingMinor: number;
  payableMinor: number;
  paidMinor: number;
  reversedMinor: number;
}

export interface SubmissionItem {
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface MyContentSubmission {
  id: string;
  assignmentId: string;
  title: string;
  version: number;
  itemCount: number;
  status: string;
  reviewNote: string | null;
  duplicateHits: number;
  leakedPhraseHits: number;
  acceptedItemCount: number;
  updatedAt: string | null;
}

export interface AdminContentSubmissionRow {
  id: string;
  assignmentId: string;
  partnerId: string;
  partnerName: string;
  title: string;
  version: number;
  itemCount: number;
  status: string;
  duplicateHits: number;
  leakedPhraseHits: number;
  reviewerUid: string | null;
  submittedAt: unknown;
}

export interface CreatorApplicationRow {
  id: string;
  partnerId: string;
  partnerName: string;
  role: string;
  status: string;
  subjectExpertise: string[];
  qualifications: string | null;
  sampleUrl: string | null;
  reviewNote: string | null;
  appliedAt: unknown;
}

export const creatorAdminApi = {
  listApplications: (status?: string) =>
    callAction<{ applications: CreatorApplicationRow[] }>('content-admin', 'listCreatorApplications', status ? { status } : {}),
  reviewRole: (payload: { roleDocId: string; decision: 'approve' | 'reject' | 'suspend' | 'reinstate'; note?: string }) =>
    callAction<{ status: string }>('content-admin', 'reviewCreatorRole', payload),
  saveContract: (payload: {
    contractId?: string;
    partnerId: string;
    role: CreatorRole;
    scopeType: 'certification' | 'domain' | 'series';
    scopeRef?: string;
    compensationModel: 'FIXED' | 'PER_ITEM' | 'REVIEW';
    rateMinor: number;
    deliverables: string;
    acceptanceCriteria: string;
    dueAt?: string;
    ipAssignment?: 'ASSIGN' | 'LICENCE';
    originalityDeclarationRequired?: boolean;
    aiDisclosureRequired?: boolean;
  }) => callAction<{ contractId: string }>('content-admin', 'saveCreatorContract', payload),
  createAssignment: (payload: {
    contractId: string;
    title: string;
    targetType: 'quiz' | 'practiceTest' | 'questionBank' | 'mockTest';
    dueAt?: string;
  }) => callAction<{ assignmentId: string }>('content-admin', 'createCreatorAssignment', payload),
  listContracts: (partnerId?: string) =>
    callAction<{ contracts: Record<string, unknown>[] }>('content-admin', 'listCreatorContractsAdmin', partnerId ? { partnerId } : {}),
  listAssignments: (partnerId?: string) =>
    callAction<{ assignments: Record<string, unknown>[] }>('content-admin', 'listCreatorAssignmentsAdmin', partnerId ? { partnerId } : {}),
  listSubmissions: (status?: string) =>
    callAction<{ submissions: AdminContentSubmissionRow[] }>('content-admin', 'listContentSubmissionsAdmin', status ? { status } : {}),
  getSubmission: (submissionId: string) =>
    callAction<{ submission: Record<string, unknown>; reviews: Record<string, unknown>[] }>('content-admin', 'getContentSubmissionAdmin', { submissionId }),
  decideReview: (payload: {
    submissionId: string;
    decision: 'approve' | 'changes' | 'reject' | 'flag_cleared' | 'flag_upheld';
    note?: string;
    acceptedItemCount?: number;
  }) => callAction<{ status: string }>('content-admin', 'decideContentReview', payload),
  publishSubmission: (payload: { submissionId: string; changeNote?: string }) =>
    callAction<{ status: string; itemsPublished: number }>('content-admin', 'publishContentSubmission', payload),
  listComplianceCases: (status?: string) =>
    callAction<{ cases: Record<string, unknown>[] }>('content-admin', 'listComplianceCases', status ? { status } : {}),
  resolveComplianceCase: (payload: { caseId: string; decision: 'uphold' | 'dismiss'; quarantine?: boolean }) =>
    callAction<{ status: string }>('content-admin', 'resolveComplianceCase', payload),
};
