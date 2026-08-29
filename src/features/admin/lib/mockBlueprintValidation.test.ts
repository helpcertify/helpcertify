import { describe, it, expect } from 'vitest';
import {
  domainPercentSumValid,
  domainQuestionCountSumValid,
  difficultyDistributionValid,
  domainsHaveEnoughQuestions,
  isDurationValid,
  isTotalQuestionsValid,
  validateMockBlueprint,
} from './mockBlueprintValidation';
import type { DomainAllocation } from '@/types/models';

// The initial CISM domain configuration from the spec.
const cismDomains: DomainAllocation[] = [
  { domain: 'Domain 1', percent: 17, questionCount: 26 },
  { domain: 'Domain 2', percent: 20, questionCount: 30 },
  { domain: 'Domain 3', percent: 33, questionCount: 49 },
  { domain: 'Domain 4', percent: 30, questionCount: 45 },
];

describe('domainPercentSumValid', () => {
  it('accepts the CISM domain split (sums to 100%)', () => expect(domainPercentSumValid(cismDomains)).toBe(true));
  it('rejects a split that does not add up to 100%', () => {
    expect(domainPercentSumValid([{ domain: 'A', percent: 40, questionCount: 10 }])).toBe(false);
  });
  it('rejects an empty domain list', () => expect(domainPercentSumValid([])).toBe(false));
});

describe('domainQuestionCountSumValid', () => {
  it('accepts counts that sum to the total (26+30+49+45=150)', () => {
    expect(domainQuestionCountSumValid(cismDomains, 150)).toBe(true);
  });
  it('rejects counts that do not sum to the configured total', () => {
    expect(domainQuestionCountSumValid(cismDomains, 140)).toBe(false);
  });
});

describe('difficultyDistributionValid', () => {
  it('allows a blueprint with no difficulty distribution enforced', () => {
    expect(difficultyDistributionValid(null)).toBe(true);
  });
  it('accepts a distribution that sums to 100%', () => {
    expect(difficultyDistributionValid({ easy: 30, medium: 50, hard: 20 })).toBe(true);
  });
  it('rejects a distribution that does not sum to 100%', () => {
    expect(difficultyDistributionValid({ easy: 30, medium: 30, hard: 30 })).toBe(false);
  });
});

describe('domainsHaveEnoughQuestions', () => {
  it('returns no shortfalls when every domain has enough eligible questions', () => {
    const counts = { 'Domain 1': 200, 'Domain 2': 200, 'Domain 3': 200, 'Domain 4': 200 };
    expect(domainsHaveEnoughQuestions(cismDomains, counts)).toEqual([]);
  });
  it('flags a domain whose bank does not have enough questions yet', () => {
    const counts = { 'Domain 1': 10, 'Domain 2': 200, 'Domain 3': 200, 'Domain 4': 200 };
    expect(domainsHaveEnoughQuestions(cismDomains, counts)).toEqual(['Domain 1']);
  });
  it('treats a domain missing from the bank entirely as zero eligible questions', () => {
    const counts = { 'Domain 2': 200, 'Domain 3': 200, 'Domain 4': 200 };
    expect(domainsHaveEnoughQuestions(cismDomains, counts)).toEqual(['Domain 1']);
  });
});

describe('isDurationValid / isTotalQuestionsValid', () => {
  it('rejects zero or negative values', () => {
    expect(isDurationValid(0)).toBe(false);
    expect(isTotalQuestionsValid(-1)).toBe(false);
  });
  it('accepts the CISM values (240 minutes, 150 questions)', () => {
    expect(isDurationValid(240)).toBe(true);
    expect(isTotalQuestionsValid(150)).toBe(true);
  });
});

describe('validateMockBlueprint', () => {
  it('passes for a fully valid CISM blueprint with enough eligible questions', () => {
    const result = validateMockBlueprint({
      domains: cismDomains,
      totalQuestions: 150,
      durationMinutes: 240,
      difficultyDistribution: null,
      eligibleCountByDomain: { 'Domain 1': 200, 'Domain 2': 200, 'Domain 3': 200, 'Domain 4': 200 },
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('collects every failing rule at once, not just the first', () => {
    const result = validateMockBlueprint({
      domains: [{ domain: 'A', percent: 50, questionCount: 999 }],
      totalQuestions: 0,
      durationMinutes: 0,
      difficultyDistribution: { easy: 10, medium: 10, hard: 10 },
      eligibleCountByDomain: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
