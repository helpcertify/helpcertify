import { describe, it, expect } from 'vitest';
import { pickDefaultPackage, isCertificationComingSoon, hasActivePackage, totalQuestionsAcrossPackages } from './certificationCatalog';
import type { CatalogPackage } from '../api/certificationCatalogApi';

function makePackage(overrides: Partial<CatalogPackage> = {}): CatalogPackage {
  return {
    id: 'pkg1',
    certificationId: 'cert1',
    name: 'Mock Exams',
    badgeText: null,
    isRecommended: false,
    description: '',
    includedQuizIds: [],
    includedPracticeTestIds: [],
    price: 1999,
    originalPrice: null,
    currency: 'INR',
    isPublished: true,
    displayOrder: 0,
    state: 'AVAILABLE',
    aggregateTotalQuestions: 0,
    practiceQuestionCount: 0,
    accessValidityDays: 180,
    includedItems: [],
    practiceAccessEnabled: false,
    mockAccessEnabled: false,
    accessibleQuestionCount: 0,
    fullMockAttempts: 0,
    questionsPerMock: 0,
    includedFeatures: [],
    ...overrides,
  };
}

describe('pickDefaultPackage', () => {
  it('prefers an already-owned (ACTIVE) package over the recommended one', () => {
    const packages = [
      makePackage({ id: 'a', displayOrder: 0, isRecommended: true, state: 'AVAILABLE' }),
      makePackage({ id: 'b', displayOrder: 1, isRecommended: false, state: 'ACTIVE' }),
    ];
    expect(pickDefaultPackage(packages)?.id).toBe('b');
  });

  it('picks the admin-flagged recommended package regardless of displayOrder', () => {
    const packages = [
      makePackage({ id: 'a', displayOrder: 0, isRecommended: false }),
      makePackage({ id: 'b', displayOrder: 2, isRecommended: true }),
      makePackage({ id: 'c', displayOrder: 1, isRecommended: false }),
    ];
    expect(pickDefaultPackage(packages)?.id).toBe('b');
  });

  it('falls back to the first package by displayOrder when none is recommended', () => {
    const packages = [
      makePackage({ id: 'a', displayOrder: 2 }),
      makePackage({ id: 'b', displayOrder: 0 }),
      makePackage({ id: 'c', displayOrder: 1 }),
    ];
    expect(pickDefaultPackage(packages)?.id).toBe('b');
  });

  it('returns null when there are no published packages', () => {
    expect(pickDefaultPackage([])).toBeNull();
  });
});

describe('isCertificationComingSoon', () => {
  it('is true when a certification has zero published packages', () => {
    expect(isCertificationComingSoon({ packages: [] })).toBe(true);
  });

  it('is false once at least one package exists', () => {
    expect(isCertificationComingSoon({ packages: [makePackage()] })).toBe(false);
  });
});

describe('hasActivePackage', () => {
  it('is true when any package resolves to ACTIVE, regardless of position', () => {
    const packages = [makePackage({ id: 'a', state: 'AVAILABLE' }), makePackage({ id: 'b', state: 'ACTIVE' })];
    expect(hasActivePackage({ packages })).toBe(true);
  });

  it('is false when no package is ACTIVE', () => {
    const packages = [makePackage({ state: 'AVAILABLE' }), makePackage({ state: 'IN_CART' })];
    expect(hasActivePackage({ packages })).toBe(false);
  });

  it('is false for a certification with no packages at all', () => {
    expect(hasActivePackage({ packages: [] })).toBe(false);
  });
});

describe('totalQuestionsAcrossPackages', () => {
  it('sums each package\'s own aggregate total', () => {
    const packages = [makePackage({ aggregateTotalQuestions: 500 }), makePackage({ aggregateTotalQuestions: 1000 })];
    expect(totalQuestionsAcrossPackages(packages)).toBe(1500);
  });

  it('is zero for an empty package list', () => {
    expect(totalQuestionsAcrossPackages([])).toBe(0);
  });
});
