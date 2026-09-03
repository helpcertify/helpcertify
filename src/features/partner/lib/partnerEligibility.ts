// Pure eligibility rules for a partner application. Used both client-side
// (BecomePartnerPage form validation) and re-implemented server-side in
// api/auth.ts's submitPartnerApplication. See partnerEligibility.test.ts.

import { isSelfReferral, isSameSignupIp } from '@/features/students/lib/referralRules';

// Whole years between two dates, calendar-correct (accounts for the
// birthday not yet having happened this year).
export function ageInYears(dateOfBirth: string, now: Date): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return NaN;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function isAdult(dateOfBirth: string, now: Date): boolean {
  const age = ageInYears(dateOfBirth, now);
  return Number.isFinite(age) && age >= 18;
}

export interface SelfReferralSignals {
  partnerUserId: string;
  customerUserId: string;
  partnerEmail?: string | null;
  customerEmail?: string | null;
  partnerPhone?: string | null;
  customerPhone?: string | null;
  partnerSignupIp?: string | null;
  customerSignupIp?: string | null;
}

// 'block'  - a hard identity match (same account / email / phone): reject.
// 'review' - only a shared network signal: queue for manual review, don't
//            auto-reject (families and colleges share IPs - PRD 8.3).
// 'ok'     - no signal.
export function classifySelfReferral(s: SelfReferralSignals): 'block' | 'review' | 'ok' {
  const email = (v?: string | null) => (v ?? '').trim().toLowerCase();
  // Compare the last 10 digits so "+91 90000 11111" matches "9000011111".
  const phone = (v?: string | null) => (v ?? '').replace(/\D/g, '').slice(-10);
  if (isSelfReferral(s.partnerUserId, s.customerUserId)) return 'block';
  if (s.partnerEmail && email(s.partnerEmail) === email(s.customerEmail)) return 'block';
  if (phone(s.partnerPhone).length === 10 && phone(s.partnerPhone) === phone(s.customerPhone)) return 'block';
  if (isSameSignupIp(s.partnerSignupIp, s.customerSignupIp)) return 'review';
  return 'ok';
}
