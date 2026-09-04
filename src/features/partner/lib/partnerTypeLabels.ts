import type { PartnerType } from '@/types/models';

// Single source of truth for how a PartnerType enum value is shown to a
// human, on both the application form and the admin review screens - so the
// two never drift out of sync. The enum value itself (sent to the API,
// stored in Firestore) never changes; only this label does.
export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  referral: 'Referral Partner',
  sales: 'Sales Partner',
  implementation: 'Training Partner',
  agency: 'Agency Partner',
};

// Accepts `string` (not just `PartnerType`) because several API response
// types in partnerApi.ts loosely type this field as `string` rather than
// the enum - falls back to the raw value for anything unrecognised.
export function partnerTypeLabel(type: string): string {
  return PARTNER_TYPE_LABELS[type as PartnerType] ?? type;
}
