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
  country?: string;
  panMasked?: string | null;
  panLast4?: string | null;
  panStatus?: string | null;
  gstinMasked?: string | null;
  duplicatePanFlag?: boolean;
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
  country: string;
  panMasked: string | null;
  panLast4: string | null;
  payoutStatus: 'OK' | 'KYC_ACTION_REQUIRED' | 'PAYOUT_BLOCKED';
  createdAt: unknown;
}

export interface PartnerDetail {
  partnerId: string;
  header: {
    legalName: string;
    displayName: string;
    status: string;
    payoutStatus: string;
    partnerType: string;
    createdAt: unknown;
    applicationDate: unknown;
  };
  contact: {
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    address: string | null;
    emailVerified: boolean;
  };
  tax: {
    country: string;
    panMasked: string | null;
    panStatus: string | null;
    panName: string | null;
    gstinMasked: string | null;
    duplicatePanFlag: boolean;
    verifiedAt: unknown;
    verificationRef: string | null;
  };
  payout: {
    method: string;
    accountName: string;
    bankAccountLast4: string | null;
    bankIfsc: string | null;
    upiVpa: string | null;
  } | null;
  agreements: { version: string; acceptedAt: unknown }[];
  codes: { code: string; active: boolean }[];
  creatorRoles: { role: string; status: string }[];
  creatorEarnings: {
    count: number;
    pendingMinor: number;
    payableMinor: number;
    paidMinor: number;
    reversedMinor: number;
  };
  performance: {
    referralEventCount: number;
    commissionCount: number;
    pendingMinor: number;
    payableMinor: number;
    paidMinor: number;
    reversedMinor: number;
  };
  payouts: {
    id: string;
    periodLabel: string;
    netMinor: number;
    currency: string;
    status: string;
    externalReference: string | null;
  }[];
  audit: { action: string; actorId: string; reason: string | null; createdAt: unknown }[];
}

export interface PartnerKycMasked {
  partnerId: string;
  country: string;
  payoutStatus: string;
  panMasked: string | null;
  panStatus: string | null;
  panName: string | null;
  gstinMasked: string | null;
  address: string | null;
  verifiedAt: unknown;
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
    country: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    pan?: string;
    panName?: string;
    gstin?: string;
    acceptAgreement: true;
    panConsent?: boolean;
  }) => callAction<{ applicationId: string; status: 'SUBMITTED' }>('auth', 'submitPartnerApplication', payload),

  getMyApplication: () =>
    callAction<{ application: MyPartnerApplication | null }>('auth', 'getMyPartnerApplication'),

  // --- approved partner ---
  createReferralCode: () => callAction<{ code: string }>('auth', 'createPartnerReferralCode'),
  listMyReferralCodes: () =>
    callAction<{ codes: PartnerReferralCode[] }>('auth', 'listMyPartnerReferralCodes'),
  listMyCommissions: () =>
    callAction<{ commissions: PartnerCommissionRow[]; totals: PartnerCommissionTotals }>(
      'auth',
      'listMyPartnerCommissions',
    ),
  savePayoutDetails: (payload: {
    method: 'BANK' | 'UPI';
    accountName: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    upiVpa?: string;
    pan?: string;
  }) => callAction<{ ok: true }>('auth', 'savePartnerPayoutDetails', payload),
  getMyPayoutDetails: () => callAction<{ payout: MyPayoutDetails | null }>('auth', 'getMyPartnerPayoutDetails'),
  listMyPayouts: () => callAction<{ payouts: PartnerPayoutRow[] }>('auth', 'listMyPartnerPayouts'),
};

export interface MyPayoutDetails {
  method: string;
  accountName: string;
  bankAccountLast4: string | null;
  bankIfsc: string | null;
  upiVpa: string | null;
  panLast4: string | null;
}

export interface PartnerPayoutRow {
  id: string;
  periodLabel: string;
  currency: string;
  grossMinor: number;
  netMinor: number;
  commissionCount: number;
  status: string;
  externalReference: string | null;
  paidAt: string | null;
}

export interface PayableGroup {
  partnerId: string;
  displayName: string;
  currency: string;
  commissionIds: string[];
  earningIds: string[];
  commissionMinor: number;
  earningMinor: number;
  grossMinor: number;
  meetsMinimum: boolean;
  hasPayoutDetails: boolean;
  payoutStatus: string;
  payoutEligible: boolean;
}

export interface PayoutBatchRow {
  id: string;
  periodLabel: string;
  status: string;
  commissionCount: number;
  grossMinor: number;
  currency: string;
  createdBy: string;
  approvedBy: string | null;
  externalReference: string | null;
  createdAt: unknown;
}

export interface PayoutBatchLine {
  id: string;
  partnerId: string;
  partnerName: string;
  grossMinor: number;
  netMinor: number;
  currency: string;
  status: string;
  payoutMethod: string | null;
  payoutTo: string | null;
  commissionIds: string[];
}

export interface PartnerCommissionRow {
  id: string;
  orderId: string;
  status: string;
  currency: string;
  eligibleBaseMinor: number;
  grossCommissionMinor: number;
  netPayableMinor: number;
  holdUntil: string | null;
  createdAt: string | null;
}

export interface PartnerCommissionTotals {
  pendingMinor: number;
  payableMinor: number;
  paidMinor: number;
  reversedMinor: number;
}

export interface AdminCommissionRow extends PartnerCommissionRow {
  partnerId: string;
  onHoldReason: string | null;
}

export interface PartnerApplicationDetail {
  id: string;
  legalName: string;
  displayName: string;
  dateOfBirth: string;
  phone: string;
  partnerType: string;
  country: string;
  address: string | null;
  panMasked: string | null;
  panName: string | null;
  gstinMasked: string | null;
  duplicatePanFlag: boolean;
  agreementVersion: string | null;
  status: string;
  submittedAt: unknown;
}

export const partnerAdminApi = {
  listApplications: (status?: string) =>
    callAction<{ applications: PartnerApplicationRow[] }>('admin', 'listPartnerApplications', status ? { status } : {}),
  getApplicationDetail: (applicationId: string) =>
    callAction<PartnerApplicationDetail>('admin', 'getPartnerApplicationDetail', { applicationId }),
  reviewApplication: (payload: { applicationId: string; decision: 'approve' | 'reject'; note?: string }) =>
    callAction<{ status: string; partnerId?: string; referralCode?: string }>('admin', 'reviewPartnerApplication', payload),
  suspendPartner: (payload: { partnerId: string; reason?: string }) =>
    callAction<{ status: string; codesAffected: number }>('admin', 'suspendPartner', payload),
  reactivatePartner: (payload: { partnerId: string; reason?: string }) =>
    callAction<{ status: string; codesAffected: number }>('admin', 'reactivatePartner', payload),
  getPartnerKyc: (payload: { partnerId: string }) =>
    callAction<PartnerKycMasked>('admin', 'getPartnerKycMasked', payload),
  getPartnerDetail: (payload: { partnerId: string }) =>
    callAction<PartnerDetail>('admin', 'getPartnerDetail', payload),
  revealPartnerPan: (payload: { partnerId: string; reason: string }) =>
    callAction<{ pan: string }>('admin', 'revealPartnerPan', payload),
  setPartnerPayoutStatus: (payload: {
    partnerId: string;
    payoutStatus: 'OK' | 'KYC_ACTION_REQUIRED' | 'PAYOUT_BLOCKED';
    reason?: string;
  }) => callAction<{ payoutStatus: string }>('admin', 'setPartnerPayoutStatus', payload),
  listPartners: () => callAction<{ partners: PartnerRow[] }>('admin', 'listPartnersAdmin'),
  getFrameworkSettings: () =>
    callAction<{ enabled: boolean; applicationsOpen: boolean }>('admin', 'getPartnerFrameworkSettings'),
  saveFrameworkFlags: (payload: { enabled: boolean; applicationsOpen: boolean }) =>
    callAction<{ enabled: boolean; applicationsOpen: boolean }>('admin', 'savePartnerFrameworkFlags', payload),
  listCommissions: (params?: { status?: string; partnerId?: string }) =>
    callAction<{ commissions: AdminCommissionRow[] }>('admin', 'listPartnerCommissions', params ?? {}),
  holdCommission: (payload: { commissionId: string; reason?: string }) =>
    callAction<{ status: string }>('admin', 'holdPartnerCommission', payload),
  releaseCommission: (payload: { commissionId: string; reason?: string }) =>
    callAction<{ status: string }>('admin', 'releasePartnerCommission', payload),
  releaseHoldsNow: () => callAction<{ released: number }>('admin', 'releaseCommissionHoldsNow'),
  listPayableCommissions: () =>
    callAction<{ groups: PayableGroup[]; minPayoutMinor: number }>('admin', 'listPayableCommissions'),
  createPayoutBatch: (payload: { periodLabel: string; partnerIds?: string[] }) =>
    callAction<{ batchId: string; grossMinor: number; commissionCount: number; partnerCount: number }>(
      'admin',
      'createPayoutBatch',
      payload,
    ),
  approvePayoutBatch: (payload: { batchId: string }) =>
    callAction<{ status: string }>('admin', 'approvePayoutBatch', payload),
  recordPayoutBatchPaid: (payload: { batchId: string; externalReference: string; note?: string }) =>
    callAction<{ status: string; payoutCount: number }>('admin', 'recordPayoutBatchPaid', payload),
  cancelPayoutBatch: (payload: { batchId: string }) =>
    callAction<{ status: string }>('admin', 'cancelPayoutBatch', payload),
  listPayoutBatches: () => callAction<{ batches: PayoutBatchRow[] }>('admin', 'listPayoutBatches'),
  getPayoutBatch: (payload: { batchId: string }) =>
    callAction<{ batch: PayoutBatchRow; payouts: PayoutBatchLine[] }>('admin', 'getPayoutBatch', payload),
};
