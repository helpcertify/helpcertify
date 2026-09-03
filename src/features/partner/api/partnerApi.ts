import { callAction } from '@/lib/vercelApi';
import type { PartnerType } from '@/types/models';

// Partner Commission Framework - Phase 1 client. The backend actions live in
// api/auth.ts (user/partner/public) and api/admin.ts (staff), folded in
// there because of the 12-function Vercel cap - hence the two endpoints.

export interface MyPartnerApplication {
  id: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  partnerType: string;
  reviewNote: string | null;
  partnerId: string | null;
}

export interface PartnerApplicationRow {
  id: string;
  userId: string;
  legalName: string;
  displayName: string;
  dateOfBirth: string;
  phone: string;
  partnerType: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  partnerId: string | null;
  submittedAt: unknown;
}

export interface PartnerRow {
  partnerId: string;
  linkedUserId: string;
  displayName: string;
  partnerType: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  createdAt: unknown;
}

export interface PartnerReferralCode {
  code: string;
  active: boolean;
  productId: string;
}

export const partnerApi = {
  // --- public / learner ---
  resolveReferral: (payload: { code: string; productId?: string; landingPath?: string }) =>
    callAction<{ valid: boolean; token?: string | null }>('auth', 'resolvePartnerReferral', payload),

  submitApplication: (payload: {
    legalName: string;
    displayName: string;
    dateOfBirth: string;
    phone: string;
    partnerType: PartnerType;
    acceptAgreement: true;
  }) => callAction<{ applicationId: string; status: 'SUBMITTED' }>('auth', 'submitPartnerApplication', payload),

  getMyApplication: () =>
    callAction<{ application: MyPartnerApplication | null }>('auth', 'getMyPartnerApplication'),

  // --- approved partner ---
  createReferralCode: () => callAction<{ code: string }>('auth', 'createPartnerReferralCode'),
  listMyReferralCodes: () =>
    callAction<{ codes: PartnerReferralCode[] }>('auth', 'listMyPartnerReferralCodes'),
};

export const partnerAdminApi = {
  listApplications: (status?: string) =>
    callAction<{ applications: PartnerApplicationRow[] }>('admin', 'listPartnerApplications', status ? { status } : {}),
  reviewApplication: (payload: { applicationId: string; decision: 'approve' | 'reject'; note?: string }) =>
    callAction<{ status: string; partnerId?: string; referralCode?: string }>('admin', 'reviewPartnerApplication', payload),
  suspendPartner: (payload: { partnerId: string; reason?: string }) =>
    callAction<{ status: string; codesAffected: number }>('admin', 'suspendPartner', payload),
  reactivatePartner: (payload: { partnerId: string; reason?: string }) =>
    callAction<{ status: string; codesAffected: number }>('admin', 'reactivatePartner', payload),
  listPartners: () => callAction<{ partners: PartnerRow[] }>('admin', 'listPartnersAdmin'),
  getFrameworkSettings: () =>
    callAction<{ enabled: boolean; applicationsOpen: boolean }>('admin', 'getPartnerFrameworkSettings'),
  saveFrameworkFlags: (payload: { enabled: boolean; applicationsOpen: boolean }) =>
    callAction<{ enabled: boolean; applicationsOpen: boolean }>('admin', 'savePartnerFrameworkFlags', payload),
};
