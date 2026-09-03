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
};

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
};
