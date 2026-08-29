// The read model a future learner-integration phase would consume — built
// now so the admin's Preview & Publish step can render exactly what a
// learner would eventually see, and so item 16's requirement ("prove
// unpublished products are excluded") is testable without wiring this into
// the actual learner home page yet (see this file's own callers: it is
// NOT imported by api/cart.ts's getLearnerCatalog or any learner-facing
// page — that wiring is explicitly a later phase).
//
// Pure and framework-agnostic: takes plain data, no Firestore calls.

import { computeOfferStatus } from './offerStatus';

export interface ReadModelCertificationInput {
  id: string;
  name: string;
  provider: string;
  status: 'draft' | 'scheduled' | 'published' | 'unpublished' | 'archived';
  displayOrder: number;
  featured: boolean;
}

export interface ReadModelPackageInput {
  id: string;
  certificationId: string;
  name: string;
  status: 'draft' | 'published' | 'unpublished' | 'archived';
  isRecommended: boolean;
  badgeText: string | null;
  regularPrice: number;
  sellingPrice: number;
  offerPrice: number | null;
  offerStart: Date | null;
  offerEnd: Date | null;
  offerCancelledAt: Date | null;
  currency: 'INR' | 'USD';
  accessValidityDays: number;
  accessibleQuestionCount: number;
  fullMockAttempts: number;
  displayOrder: number;
}

export interface PublishedPackageReadModel {
  id: string;
  name: string;
  isRecommended: boolean;
  badgeText: string | null;
  currency: 'INR' | 'USD';
  regularPrice: number;
  currentPrice: number;
  offerActive: boolean;
  accessValidityDays: number;
  accessibleQuestionCount: number;
  fullMockAttempts: number;
  displayOrder: number;
}

export interface PublishedCertificationReadModel {
  id: string;
  name: string;
  provider: string;
  featured: boolean;
  displayOrder: number;
  packages: PublishedPackageReadModel[];
}

// Only a `published` certification with at least one `published` package
// appears — a draft/scheduled/unpublished/archived certification, or a
// published certification whose every package is unpublished/archived/
// draft, is excluded entirely rather than shown as an empty shell.
export function buildPublishedReadModel(
  certifications: ReadModelCertificationInput[],
  packages: ReadModelPackageInput[],
  now: Date
): PublishedCertificationReadModel[] {
  const packagesByCert = new Map<string, ReadModelPackageInput[]>();
  for (const pkg of packages) {
    if (pkg.status !== 'published') continue;
    const list = packagesByCert.get(pkg.certificationId) ?? [];
    list.push(pkg);
    packagesByCert.set(pkg.certificationId, list);
  }

  return certifications
    .filter((c) => c.status === 'published')
    .map((c) => {
      const pkgs = (packagesByCert.get(c.id) ?? [])
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((pkg) => {
          const offerStatus = computeOfferStatus(pkg, now);
          const offerActive = offerStatus === 'active';
          return {
            id: pkg.id,
            name: pkg.name,
            isRecommended: pkg.isRecommended,
            badgeText: pkg.badgeText,
            currency: pkg.currency,
            regularPrice: pkg.regularPrice,
            currentPrice: offerActive ? pkg.offerPrice! : pkg.sellingPrice,
            offerActive,
            accessValidityDays: pkg.accessValidityDays,
            accessibleQuestionCount: pkg.accessibleQuestionCount,
            fullMockAttempts: pkg.fullMockAttempts,
            displayOrder: pkg.displayOrder,
          };
        });
      return {
        id: c.id,
        name: c.name,
        provider: c.provider,
        featured: c.featured,
        displayOrder: c.displayOrder,
        packages: pkgs,
      };
    })
    .filter((c) => c.packages.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
