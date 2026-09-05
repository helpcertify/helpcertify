import { useQuery } from '@tanstack/react-query';
import { callAction } from '@/lib/vercelApi';
import type { CertificationIconKey, CertificationCategory } from '@/types/models';

// The learner home page's "Choose Your Exam Preparation" section - see
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
  // Published questions in the included practice bank(s) - the real count
  // from the uploaded question docs, not the admin-typed figure. Use this
  // for the learner-facing "N questions" line.
  practiceQuestionCount: number;
  // Access period in days for this bundle (see PackageDoc.accessValidityDays).
  accessValidityDays: number;
  includedItems: IncludedCatalogItem[];
  // Entitlement summary - api/cart.ts's getLearnerCatalog spreads the whole
  // PackageDoc into the response, so these ride along already; declared here
  // so the certification card can show "N questions · M mock exams" without
  // parsing the admin's free-text description.
  practiceAccessEnabled: boolean;
  mockAccessEnabled: boolean;
  accessibleQuestionCount: number;
  fullMockAttempts: number;
  questionsPerMock: number;
  includedFeatures: string[];
}

export interface CatalogCertification {
  id: string;
  name: string;
  provider: CertificationCategory;
  description: string;
  // The independent-preparation disclaimer for this certification -
  // getLearnerCatalog spreads the whole cert doc, so it rides along.
  independentPrepDisclaimer: string;
  iconKey: CertificationIconKey;
  isPublished: boolean;
  displayOrder: number;
  // Auto-matched topic-relevant cover photo (Pexels), cached on the cert doc
  // - getLearnerCatalog spreads the whole doc so these ride along. null/absent
  // = fall back to a category gradient + icon on the card.
  coverImageUrl?: string | null;
  coverImageCredit?: string | null;
  coverImageSourceUrl?: string | null;
  packages: CatalogPackage[];
}

// The card-level summary across all of a certification's purchasable
// packages: the biggest question bank, the most mock exams, the longest
// access window, and the lowest "from" price. Used by the "Prepare for Your
// Certification" cards, which show one figure per certification, not per
// package.
export interface CertificationPrepSummary {
  practiceQuestions: number;
  mockExams: number;
  accessDays: number;
  fromPrice: number | null;
  currency: 'INR' | 'USD';
}

export function summarizeCertificationPrep(cert: CatalogCertification): CertificationPrepSummary {
  const pkgs = cert.packages;
  let practiceQuestions = 0;
  let mockExams = 0;
  let accessDays = 0;
  let fromPrice: number | null = null;
  let currency: 'INR' | 'USD' = 'INR';
  for (const p of pkgs) {
    const q = p.practiceQuestionCount || p.aggregateTotalQuestions;
    if (p.practiceAccessEnabled && q > practiceQuestions) practiceQuestions = q;
    if (p.mockAccessEnabled && p.fullMockAttempts > mockExams) mockExams = p.fullMockAttempts;
    if (p.accessValidityDays > accessDays) accessDays = p.accessValidityDays;
    if (p.price > 0 && (fromPrice === null || p.price < fromPrice)) {
      fromPrice = p.price;
      currency = p.currency;
    }
  }
  return { practiceQuestions, mockExams, accessDays, fromPrice, currency };
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
