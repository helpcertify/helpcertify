// Pure validation rules for a Mock Rules blueprint (Products & Pricing
// step 3) - no Firestore/network calls, unit-tested directly. A blueprint
// never carries its own bank reference: it always inherits the bank from
// its contentVersionId (see MockBlueprintDoc's own comment in
// src/types/models.ts), which is what actually prevents questions from
// silently mixing across content versions - there's no separate "which
// bank" field a blueprint could disagree with its version about.

import type { DomainAllocation } from '@/types/models';

// Rounding in a percent-based UI means an exact 100 is unrealistic to
// demand - a small tolerance avoids rejecting 99.9%/100.1% from float
// arithmetic while still catching a genuinely wrong configuration.
const PERCENT_TOLERANCE = 0.5;

export function domainPercentSumValid(domains: DomainAllocation[]): boolean {
  if (domains.length === 0) return false;
  const sum = domains.reduce((s, d) => s + d.percent, 0);
  return Math.abs(sum - 100) <= PERCENT_TOLERANCE;
}

export function domainQuestionCountSumValid(domains: DomainAllocation[], totalQuestions: number): boolean {
  if (domains.length === 0) return false;
  const sum = domains.reduce((s, d) => s + d.questionCount, 0);
  return sum === totalQuestions;
}

export function difficultyDistributionValid(dist: { easy: number; medium: number; hard: number } | null): boolean {
  if (dist === null) return true; // not enforced for this blueprint
  const sum = dist.easy + dist.medium + dist.hard;
  return Math.abs(sum - 100) <= PERCENT_TOLERANCE;
}

// Every domain must have enough published, mock-eligible questions in the
// bank to actually satisfy its configured allocation.
export function domainsHaveEnoughQuestions(domains: DomainAllocation[], eligibleCountByDomain: Record<string, number>): string[] {
  return domains.filter((d) => (eligibleCountByDomain[d.domain] ?? 0) < d.questionCount).map((d) => d.domain);
}

export function isDurationValid(durationMinutes: number): boolean {
  return durationMinutes > 0;
}

export function isTotalQuestionsValid(totalQuestions: number): boolean {
  return totalQuestions > 0;
}

export interface MockBlueprintValidationResult {
  valid: boolean;
  errors: string[];
}

// The combined check the publish step (and the "clear validation errors
// before publishing" requirement) runs - one place with one wording per
// failure, rather than each caller re-deriving its own error strings.
export function validateMockBlueprint(args: {
  domains: DomainAllocation[];
  totalQuestions: number;
  durationMinutes: number;
  difficultyDistribution: { easy: number; medium: number; hard: number } | null;
  eligibleCountByDomain: Record<string, number>;
}): MockBlueprintValidationResult {
  const errors: string[] = [];
  if (!isTotalQuestionsValid(args.totalQuestions)) errors.push('Total questions per mock must be greater than zero.');
  if (!isDurationValid(args.durationMinutes)) errors.push('Duration must be greater than zero.');
  if (!domainPercentSumValid(args.domains)) errors.push('Domain percentages must add up to 100%.');
  if (!domainQuestionCountSumValid(args.domains, args.totalQuestions)) {
    errors.push('Domain question counts must add up to the total questions per mock.');
  }
  if (!difficultyDistributionValid(args.difficultyDistribution)) errors.push('Difficulty percentages must add up to 100%.');
  const shortDomains = domainsHaveEnoughQuestions(args.domains, args.eligibleCountByDomain);
  if (shortDomains.length > 0) {
    errors.push(`Not enough eligible published questions for: ${shortDomains.join(', ')}.`);
  }
  return { valid: errors.length === 0, errors };
}
