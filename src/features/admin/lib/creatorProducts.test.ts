import { describe, expect, it } from 'vitest';
import {
  CREATOR_PRODUCT_SEEDS,
  activeEntitlementSet,
  expandBundleEntitlements,
  isEntitlementActive,
  seedEntitlements,
} from './creatorProducts';

describe('creatorProducts seed catalogue', () => {
  it('has the 4 products and 4 bundles', () => {
    expect(CREATOR_PRODUCT_SEEDS.filter((s) => s.kind === 'product')).toHaveLength(4);
    expect(CREATOR_PRODUCT_SEEDS.filter((s) => s.kind === 'bundle')).toHaveLength(4);
  });

  it('gives every product one entitlement and every plan a selling price', () => {
    for (const s of CREATOR_PRODUCT_SEEDS.filter((s) => s.kind === 'product')) {
      expect(s.entitlement).toBeTruthy();
      expect(s.price.monthly.selling).toBeGreaterThan(0);
      expect(s.price.annual.selling).toBeGreaterThan(0);
    }
  });

  it('marks only the Creator Complete Suite as Best Value', () => {
    const badged = CREATOR_PRODUCT_SEEDS.filter((s) => s.badgeText === 'Best Value');
    expect(badged.map((s) => s.id)).toEqual(['creator_complete_suite']);
  });

  it('never labels the suite "All 4 Products"', () => {
    const suite = CREATOR_PRODUCT_SEEDS.find((s) => s.id === 'creator_complete_suite')!;
    expect(suite.name).toBe('Creator Complete Suite');
    expect(`${suite.name} ${suite.description}`).not.toMatch(/all 4 products/i);
  });
});

describe('expandBundleEntitlements', () => {
  it('resolves a bundle to the union of its members entitlements, deduped', () => {
    expect(expandBundleEntitlements(['course_creator_manual', 'course_creator_ai'])).toEqual([
      'course_creator_manual',
      'course_creator_ai',
    ]);
    expect(expandBundleEntitlements(['course_creator_manual', 'course_creator_manual'])).toEqual(['course_creator_manual']);
  });

  it('gives the suite all four entitlements', () => {
    const suite = CREATOR_PRODUCT_SEEDS.find((s) => s.id === 'creator_complete_suite')!;
    expect(seedEntitlements(suite).sort()).toEqual(
      ['course_creator_ai', 'course_creator_manual', 'exam_creator_ai', 'exam_creator_manual'].sort(),
    );
  });

  it('ignores unknown ids', () => {
    expect(expandBundleEntitlements(['nope', 'exam_creator_ai'])).toEqual(['exam_creator_ai']);
  });
});

describe('isEntitlementActive / activeEntitlementSet', () => {
  const now = 1_000_000_000_000;

  it('active only when not cancelled and expiresAt is in the future', () => {
    expect(isEntitlementActive({ status: 'active', expiresAt: now + 1000 }, now)).toBe(true);
    expect(isEntitlementActive({ status: 'active', expiresAt: now - 1000 }, now)).toBe(false);
    expect(isEntitlementActive({ status: 'cancelled', expiresAt: now + 1000 }, now)).toBe(false);
    expect(isEntitlementActive({ status: 'active', expiresAt: null }, now)).toBe(false);
    expect(isEntitlementActive(null, now)).toBe(false);
  });

  it('accepts a Firestore-style Timestamp with toMillis()', () => {
    expect(isEntitlementActive({ status: 'active', expiresAt: { toMillis: () => now + 5 } }, now)).toBe(true);
  });

  it('collapses docs to the currently-held set', () => {
    const set = activeEntitlementSet(
      [
        { entitlement: 'course_creator_manual', status: 'active', expiresAt: now + 1000 },
        { entitlement: 'course_creator_ai', status: 'active', expiresAt: now - 1000 },
        { entitlement: 'exam_creator_manual', status: 'cancelled', expiresAt: now + 1000 },
      ],
      now,
    );
    expect([...set]).toEqual(['course_creator_manual']);
  });
});
