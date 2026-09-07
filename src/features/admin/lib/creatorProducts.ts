// The seed catalogue for the Creator commercial model - the 4 products and
// 4 bundles, with their INITIAL prices. These are written to
// creatorProducts/{id} once (idempotently) by the seedCreatorProducts admin
// action; after that Global Admin edits every field through Products &
// Pricing with no deploy. Nothing here is read at runtime for pricing - it
// is purely the one-time seed source.
//
// Pure and framework-agnostic (unit-tested in creatorProducts.test.ts).
// Prices below are in whole rupees for readability; the seed action converts
// to minor units (paise) before writing, matching the rest of the codebase.

import type { CreatorEntitlement, CreatorPlanKey } from '@/types/models';

export interface CreatorProductSeed {
  id: string;
  kind: 'product' | 'bundle';
  name: string;
  description: string;
  /** A product's own entitlement (single). Empty for a bundle - resolved
   *  from `bundledProductIds`. */
  entitlement: CreatorEntitlement | null;
  bundledProductIds: string[];
  /** Whole rupees, per plan. `regular` defaults to `selling` when omitted. */
  price: Record<CreatorPlanKey, { regular?: number; selling: number }>;
  /** HelpCertify AI Credits granted on purchase, per plan. */
  aiCredits: Record<CreatorPlanKey, number>;
  badgeText: string | null;
}

// Individual products first (bundles reference them by id).
export const CREATOR_PRODUCT_SEEDS: CreatorProductSeed[] = [
  {
    id: 'course_creator_manual',
    kind: 'product',
    name: 'Course Creator - Manual',
    description: 'Build courses by hand - structure, lessons and content authored yourself.',
    entitlement: 'course_creator_manual',
    bundledProductIds: [],
    price: { monthly: { selling: 499 }, annual: { selling: 4999 } },
    aiCredits: { monthly: 0, annual: 0 },
    badgeText: null,
  },
  {
    id: 'course_creator_ai',
    kind: 'product',
    name: 'Course Creator - AI',
    description: 'Generate a full course structure and lesson content with HelpCertify AI, then refine.',
    entitlement: 'course_creator_ai',
    bundledProductIds: [],
    price: { monthly: { selling: 1299 }, annual: { selling: 12999 } },
    aiCredits: { monthly: 100, annual: 1200 },
    badgeText: null,
  },
  {
    id: 'exam_creator_manual',
    kind: 'product',
    name: 'Exam Creator - Manual',
    description: 'Author practice exams and mock exams by hand or from your own question document.',
    entitlement: 'exam_creator_manual',
    bundledProductIds: [],
    price: { monthly: { selling: 399 }, annual: { selling: 3999 } },
    aiCredits: { monthly: 0, annual: 0 },
    badgeText: null,
  },
  {
    id: 'exam_creator_ai',
    kind: 'product',
    name: 'Exam Creator - AI',
    description: 'Generate practice and mock exam questions on any topic with HelpCertify AI.',
    entitlement: 'exam_creator_ai',
    bundledProductIds: [],
    price: { monthly: { selling: 999 }, annual: { selling: 9999 } },
    aiCredits: { monthly: 60, annual: 720 },
    badgeText: null,
  },
  // Bundles.
  {
    id: 'manual_creator_pack',
    kind: 'bundle',
    name: 'Manual Creator Pack',
    description: 'Build both courses and exams by hand.',
    entitlement: null,
    bundledProductIds: ['course_creator_manual', 'exam_creator_manual'],
    price: { monthly: { selling: 749 }, annual: { selling: 7499 } },
    aiCredits: { monthly: 0, annual: 0 },
    badgeText: null,
  },
  {
    id: 'course_creator_complete',
    kind: 'bundle',
    name: 'Course Creator Complete',
    description: 'Everything for courses - build by hand or generate with AI, your choice every time.',
    entitlement: null,
    bundledProductIds: ['course_creator_manual', 'course_creator_ai'],
    price: { monthly: { selling: 1499 }, annual: { selling: 14999 } },
    aiCredits: { monthly: 100, annual: 1200 },
    badgeText: null,
  },
  {
    id: 'exam_creator_complete',
    kind: 'bundle',
    name: 'Exam Creator Complete',
    description: 'Everything for exams - author by hand or generate with AI, your choice every time.',
    entitlement: null,
    bundledProductIds: ['exam_creator_manual', 'exam_creator_ai'],
    price: { monthly: { selling: 1199 }, annual: { selling: 11999 } },
    aiCredits: { monthly: 60, annual: 720 },
    badgeText: null,
  },
  {
    id: 'creator_complete_suite',
    kind: 'bundle',
    name: 'Creator Complete Suite',
    description: 'The complete Creator toolkit - build courses and exams, by hand or with AI.',
    entitlement: null,
    bundledProductIds: ['course_creator_manual', 'course_creator_ai', 'exam_creator_manual', 'exam_creator_ai'],
    price: { monthly: { selling: 2499 }, annual: { selling: 24999 } },
    aiCredits: { monthly: 160, annual: 1920 },
    badgeText: 'Best Value',
  },
];

const SEED_BY_ID = new Map(CREATOR_PRODUCT_SEEDS.map((s) => [s.id, s]));

/** The entitlements a bundle grants = the union of its members' own
 *  entitlements. Order-stable, deduped. */
export function expandBundleEntitlements(bundledProductIds: string[]): CreatorEntitlement[] {
  const out: CreatorEntitlement[] = [];
  for (const id of bundledProductIds) {
    const member = SEED_BY_ID.get(id);
    if (member?.entitlement && !out.includes(member.entitlement)) out.push(member.entitlement);
  }
  return out;
}

/** The entitlements a seed grants (its own, or its bundle's members'). */
export function seedEntitlements(seed: CreatorProductSeed): CreatorEntitlement[] {
  return seed.kind === 'bundle' ? expandBundleEntitlements(seed.bundledProductIds) : seed.entitlement ? [seed.entitlement] : [];
}

/** A creatorEntitlements doc is "active" when it hasn't been cancelled and
 *  its expiresAt is still in the future - identical convention to
 *  purchases/{uid}_{itemType}_{itemId}. */
export function isEntitlementActive(
  doc: { status?: string; expiresAt?: { toMillis?: () => number } | number | null } | null | undefined,
  nowMs: number,
): boolean {
  if (!doc || doc.status === 'cancelled') return false;
  const exp = doc.expiresAt;
  const expMs = typeof exp === 'number' ? exp : exp && typeof exp.toMillis === 'function' ? exp.toMillis() : null;
  return expMs !== null && expMs > nowMs;
}

/** Collapse a creator's entitlement docs into the set they currently hold. */
export function activeEntitlementSet(
  docs: { entitlement: CreatorEntitlement; status?: string; expiresAt?: { toMillis?: () => number } | number | null }[],
  nowMs: number,
): Set<CreatorEntitlement> {
  const set = new Set<CreatorEntitlement>();
  for (const d of docs) if (isEntitlementActive(d, nowMs)) set.add(d.entitlement);
  return set;
}

/** The DEFAULT credit-operation costs seeded into appSettings/aiCredits.
 *  Admin edits these afterwards. */
export const DEFAULT_CREDIT_OPERATION_COSTS: Record<string, number> = {
  course_blueprint: 10,
  lesson_content: 5,
  lesson_quiz: 3,
  visual_lesson: 8,
  exam_generation: 10,
};
