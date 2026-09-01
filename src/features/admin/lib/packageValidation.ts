// Pure, framework-agnostic validation rules for a Products & Pricing
// package - no Firestore/network calls, so these are directly unit-
// testable (see packageValidation.test.ts), the same way
// referralRules.ts/studyPlan.ts's calculations are. api/content-admin.ts
// re-implements the same short checks inline (no cross-file imports across
// api/*.ts, per this repo's existing convention) - this file is the
// tested, canonical spec for what that inline logic must do.

export interface PriceFields {
  regularPrice: number;
  sellingPrice: number;
  offerPrice: number | null;
  offerStart: Date | null;
  offerEnd: Date | null;
}

export function isPriceNonNegative(price: number): boolean {
  return price >= 0;
}

export function isOfferPriceValid(offerPrice: number | null, regularPrice: number): boolean {
  if (offerPrice === null) return true;
  return offerPrice >= 0 && offerPrice <= regularPrice;
}

export function isOfferWindowValid(offerStart: Date | null, offerEnd: Date | null): boolean {
  if (!offerStart || !offerEnd) return true; // no window configured is valid (no offer)
  return offerEnd.getTime() > offerStart.getTime();
}

export function isValidityDaysValid(validityDays: number): boolean {
  return validityDays > 0;
}

export function isCountNonNegative(count: number): boolean {
  return count >= 0;
}

// A package can publish without a real price only when explicitly marked
// Free - otherwise it needs a positive selling price.
export function hasPublishablePrice(sellingPrice: number, isFree: boolean): boolean {
  return isFree || sellingPrice > 0;
}

// "Package cannot publish without a valid entitlement" - must actually
// grant access to at least one existing quiz or practice test.
export function hasEntitlement(includedQuizIds: string[], includedPracticeTestIds: string[]): boolean {
  return includedQuizIds.length > 0 || includedPracticeTestIds.length > 0;
}

// Accessible question count can't promise more than the bank actually has.
export function isAccessibleCountWithinBank(accessibleQuestionCount: number, eligiblePublishedQuestionCount: number): boolean {
  return accessibleQuestionCount <= eligiblePublishedQuestionCount;
}

// Case-insensitive - "Complete" and "complete" read as the same name to a
// learner, so both count as a duplicate within one certification.
export function isDuplicatePackageName(candidateName: string, existingNames: string[], excludePackageId?: string, existingIds?: string[]): boolean {
  const normalized = candidateName.trim().toLowerCase();
  return existingNames.some((name, i) => {
    if (excludePackageId && existingIds && existingIds[i] === excludePackageId) return false;
    return name.trim().toLowerCase() === normalized;
  });
}

export function isDisplayOrderValid(displayOrder: number): boolean {
  return Number.isInteger(displayOrder) && displayOrder >= 0;
}

export interface PackagePublishCheck {
  certificationPublished: boolean;
  hasEntitlement: boolean;
  hasPublishablePrice: boolean;
}

// "Unpublished certification cannot expose a published package" plus the
// entitlement/price gates above, combined into the one check the publish
// action runs before flipping a package's status.
export function canPublishPackage(check: PackagePublishCheck): boolean {
  return check.certificationPublished && check.hasEntitlement && check.hasPublishablePrice;
}
