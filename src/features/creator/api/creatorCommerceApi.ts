import { callAction } from '@/lib/vercelApi';
import type { CreatorEntitlement, CreatorPlanKey } from '@/types/models';

// The Creator commercial model - purchasable Creator products/bundles,
// entitlements and the HelpCertify AI Credits economy. Backend lives in
// api/content-admin.ts's creator-commerce section.

export interface CreatorPlanPriceView {
  regularPrice: number;
  sellingPrice: number;
  offerPrice: number | null;
  offerStart: unknown;
  offerEnd: unknown;
  offerCancelledAt: unknown;
}

export interface CreatorProductView {
  id: string;
  kind: 'product' | 'bundle';
  name: string;
  description: string;
  entitlements: CreatorEntitlement[];
  bundledProductIds: string[];
  plans: Record<CreatorPlanKey, CreatorPlanPriceView>;
  aiCreditsIncluded: Record<CreatorPlanKey, number>;
  trial: { enabled: boolean; days: number };
  taxTreatment: 'inclusive' | 'exclusive' | 'exempt';
  promoEligible: boolean;
  badgeText: string | null;
  currency: 'INR' | 'USD';
  active: boolean;
  visible: boolean;
  displayOrder: number;
  status: 'draft' | 'published' | 'archived';
}

export interface CreditConfigView {
  enabled: boolean;
  operationCosts: Record<string, number>;
  resetRule: 'monthly_on_grant' | 'calendar_month' | 'none';
  rolloverCap: number;
  providerEnabled: { gemini: boolean; openai: boolean; anthropic: boolean };
  creditPacks: { id: string; name: string; credits: number; priceMinor: number; currency: 'INR' | 'USD'; active: boolean }[];
}

export interface MyEntitlement {
  entitlement: CreatorEntitlement;
  plan: CreatorPlanKey;
  expiresAt: string;
  grantedByProductId: string;
}

export const creatorCommerceApi = {
  // Storefront + creator-facing
  listProducts: () =>
    callAction<{ products: CreatorProductView[]; enabled: boolean }>('content-admin', 'listCreatorProducts'),
  getMyEntitlements: () =>
    callAction<{ entitlements: MyEntitlement[]; aiCourseBuilderFlag: boolean; commerceEnabled: boolean }>(
      'content-admin',
      'getMyCreatorEntitlements',
    ),
  getMyCredits: () =>
    callAction<{
      balance: number;
      operationCosts: Record<string, number>;
      resetRule: string;
      creditPacks: CreditConfigView['creditPacks'];
    }>('content-admin', 'getMyCreatorCredits'),

  // Admin
  seed: () => callAction<{ created: number; total: number }>('content-admin', 'seedCreatorProducts'),
  listAdmin: () =>
    callAction<{ products: CreatorProductView[]; creditConfig: CreditConfigView }>('content-admin', 'listCreatorProductsAdmin'),
  upsert: (payload: {
    productId: string;
    name?: string;
    description?: string;
    badgeText?: string | null;
    active?: boolean;
    visible?: boolean;
    promoEligible?: boolean;
    taxTreatment?: 'inclusive' | 'exclusive' | 'exempt';
    displayOrder?: number;
    trial?: { enabled: boolean; days: number };
    aiCreditsIncluded?: { monthly: number; annual: number };
    bundledProductIds?: string[];
    plans?: Partial<
      Record<
        CreatorPlanKey,
        Partial<{
          regularPrice: number;
          sellingPrice: number;
          offerPrice: number | null;
          offerStart: string | null;
          offerEnd: string | null;
        }>
      >
    >;
  }) => callAction<{ success: true }>('content-admin', 'upsertCreatorProduct', payload),
  setCreditConfig: (payload: Partial<CreditConfigView>) =>
    callAction<{ success: true }>('content-admin', 'setCreditConfig', payload),
  adjustCredits: (payload: { uid: string; delta: number; note?: string }) =>
    callAction<{ balance: number }>('content-admin', 'adminAdjustCredits', payload),
};
