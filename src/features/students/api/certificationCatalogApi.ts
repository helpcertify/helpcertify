import { useQuery } from '@tanstack/react-query';
import { callAction } from '@/lib/vercelApi';
import type { CertificationIconKey, CertificationCategory } from '@/types/models';

// The learner home page's "Choose Your Exam Preparation" section — see
// api/cart.ts's getLearnerCatalog for how state is resolved server-side
// (never trusted from the client). A package is never its own entitlement
// type; ACTIVE means every included quiz/practiceTest is already owned,
// whether that happened by buying this bundle or by buying each item
// individually (see PackageDoc's own comment in src/types/models.ts).
export type PackageState = 'AVAILABLE' | 'IN_CART' | 'ACTIVE' | 'COMING_SOON' | 'UNAVAILABLE';

export interface IncludedCatalogItem {
  itemType: 'quiz' | 'practiceTest';
  itemId: string;
  title: string;
}

export interface CatalogPackage {
  id: string;
  certificationId: string;
  name: string;
  badgeText: string | null;
  isRecommended: boolean;
  description: string;
  includedQuizIds: string[];
  includedPracticeTestIds: string[];
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  isPublished: boolean;
  displayOrder: number;
  state: PackageState;
  aggregateTotalQuestions: number;
  // Access period in days for this bundle (see PackageDoc.accessValidityDays).
  accessValidityDays: number;
  includedItems: IncludedCatalogItem[];
}

export interface CatalogCertification {
  id: string;
  name: string;
  provider: CertificationCategory;
  description: string;
  iconKey: CertificationIconKey;
  isPublished: boolean;
  displayOrder: number;
  packages: CatalogPackage[];
}

export const certificationCatalogApi = {
  getLearnerCatalog: () => callAction<{ certifications: CatalogCertification[] }>('cart', 'getLearnerCatalog'),
};

export function useCertificationCatalog() {
  return useQuery({
    queryKey: ['student', 'certificationCatalog'],
    queryFn: certificationCatalogApi.getLearnerCatalog,
  });
}
