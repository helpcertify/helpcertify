// Pure, framework-agnostic helpers for the "Choose Your Exam Preparation"
// certification/package catalog - no Firestore/network calls, so these are
// directly unit-testable (see certificationCatalog.test.ts), the same way
// referralRules.ts/studyPlan.ts's calculations are. The heavier per-learner
// state resolution (owned/in-cart/etc.) happens server-side in
// api/cart.ts's getLearnerCatalog; these helpers just work with whatever
// that already returned.

import type { CatalogCertification, CatalogPackage } from '../api/certificationCatalogApi';

// Which package a certification card should show selected when it first
// loads: an already-ACTIVE (owned) package first - a learner who owns
// Mock Exams shouldn't default-land on a "Buy Complete" prompt just
// because Complete happens to be admin-recommended - else, when the caller
// knows which arrival catalog brought the learner here (the Practice
// Exams or Mock Exams browse page - see `preferredKind`), the
// admin-recommended package that actually grants that access, else the
// admin-flagged recommended one regardless of kind, else the first by
// displayOrder. null only when there are no published packages at all (a
// COMING_SOON certification).
//
// `preferredKind` fixes a case where a learner who tapped in from Mock
// Exams could land on a default-selected package that doesn't even
// include mock access (e.g. a Practice-only plan happened to be
// recommended) - the plan pre-selected on arrival should always be one
// that unlocks what they came here for.
export function pickDefaultPackage(packages: CatalogPackage[], preferredKind?: 'practice' | 'mock'): CatalogPackage | null {
  if (packages.length === 0) return null;
  const active = packages.find((p) => p.state === 'ACTIVE');
  if (active) return active;
  if (preferredKind) {
    const matchesKind = (p: CatalogPackage) => (preferredKind === 'practice' ? p.practiceAccessEnabled : p.mockAccessEnabled);
    const recommendedForKind = packages.find((p) => p.isRecommended && matchesKind(p));
    if (recommendedForKind) return recommendedForKind;
    const firstForKind = [...packages].filter(matchesKind).sort((a, b) => a.displayOrder - b.displayOrder)[0];
    if (firstForKind) return firstForKind;
  }
  const recommended = packages.find((p) => p.isRecommended);
  if (recommended) return recommended;
  return [...packages].sort((a, b) => a.displayOrder - b.displayOrder)[0];
}

// A certification with zero published packages has nothing to sell yet -
// the card shows "Coming Soon" instead of a package selector.
export function isCertificationComingSoon(certification: Pick<CatalogCertification, 'packages'>): boolean {
  return certification.packages.length === 0;
}

// Drives the home page's "My Active Certifications" section - true the
// moment any one package resolves to ACTIVE, regardless of which package
// (or none) was ever actually bought as a bundle.
export function hasActivePackage(certification: Pick<CatalogCertification, 'packages'>): boolean {
  return certification.packages.some((p) => p.state === 'ACTIVE');
}

// Sums a certification's included questions across every published
// package's own aggregate (server-computed) - used where the card wants a
// certification-level total rather than a per-package one.
export function totalQuestionsAcrossPackages(packages: CatalogPackage[]): number {
  return packages.reduce((sum, p) => sum + p.aggregateTotalQuestions, 0);
}
