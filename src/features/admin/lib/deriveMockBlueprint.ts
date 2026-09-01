// Turns a question bank's domain breakdown into a ready-to-save mock
// blueprint so the admin never has to fill in a domain-allocation table by
// hand. Pure and unit-tested (deriveMockBlueprint.test.ts); the simplified
// Packages step calls this from the mock bank's getBankDomainCounts result
// and the Mock/Complete card's questions-per-mock + duration.

import type { DomainAllocation } from '@/types/models';
import { validateMockBlueprint } from './mockBlueprintValidation';

export interface DerivedBlueprint {
  totalQuestions: number;
  durationMinutes: number;
  domains: DomainAllocation[];
}

/** Proportional split of `totalQuestions` across the bank's tagged domains,
 *  using largest-remainder rounding so the per-domain counts sum to exactly
 *  `totalQuestions` and the percents sum to exactly 100. Domains are ordered
 *  by descending question share for a stable, readable table. Returns an
 *  empty `domains` array when the bank has no domain tags at all. */
export function deriveMockBlueprint(args: {
  byDomain: Record<string, number>;
  totalQuestions: number;
  durationMinutes: number;
}): DerivedBlueprint {
  const { byDomain, totalQuestions, durationMinutes } = args;
  const entries = Object.entries(byDomain).filter(([, n]) => n > 0);
  if (entries.length === 0 || totalQuestions <= 0) {
    return { totalQuestions, durationMinutes, domains: [] };
  }
  const tagged = entries.reduce((s, [, n]) => s + n, 0);
  entries.sort((a, b) => b[1] - a[1]);

  const counts = largestRemainder(
    entries.map(([, n]) => (n / tagged) * totalQuestions),
    totalQuestions,
  );
  const percents = largestRemainder(
    entries.map(([, n]) => (n / tagged) * 100),
    100,
  );

  return {
    totalQuestions,
    durationMinutes,
    domains: entries.map(([domain], i) => ({ domain, percent: percents[i], questionCount: counts[i] })),
  };
}

/** Round a list of fractional shares to integers that sum to exactly `target`. */
function largestRemainder(shares: number[], target: number): number[] {
  const floors = shares.map((s) => Math.floor(s));
  let remainder = target - floors.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) out[order[k].i] += 1;
  return out;
}

export type MockConfigStatus = 'ready' | 'needs_attention';

/** `ready` when the derived blueprint would pass the same validation the
 *  save action runs; `needs_attention` when the bank has no domain tags or
 *  some domain can't supply enough eligible questions. */
export function mockConfigStatus(
  derived: DerivedBlueprint,
  eligibleByDomain: Record<string, number>,
): MockConfigStatus {
  if (derived.domains.length === 0) return 'needs_attention';
  const result = validateMockBlueprint({
    domains: derived.domains,
    totalQuestions: derived.totalQuestions,
    durationMinutes: derived.durationMinutes,
    difficultyDistribution: null,
    eligibleCountByDomain: eligibleByDomain,
  });
  return result.valid ? 'ready' : 'needs_attention';
}
