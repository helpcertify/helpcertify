import { describe, it, expect } from 'vitest';
import {
  buildPackageBenefits,
  templateToCreatePayload,
  emptyTemplateValues,
  detectTemplate,
  type TemplateContext,
  type TemplateValues,
} from './packageTemplates';

const ctx: TemplateContext = {
  certificationId: 'cert1',
  practiceBankId: 'ptBank',
  mockBankId: 'quizBank',
  eligiblePracticeQuestions: 1482,
  defaultValidityDays: 180,
  currency: 'INR',
  displayOrder: 0,
};

const values = (over: Partial<TemplateValues> = {}): TemplateValues => ({
  ...emptyTemplateValues(180),
  sellingPrice: 199900,
  numberOfQuestions: 1482,
  mockAttempts: 5,
  questionsPerMock: 150,
  durationMinutes: 240,
  validityDays: 180,
  ...over,
});

describe('buildPackageBenefits', () => {
  it('builds the practice list and clamps the question count', () => {
    const b = buildPackageBenefits('practice', values({ numberOfQuestions: 99999 }), 1482);
    expect(b[0]).toBe('1,482 practice questions');
    expect(b).toContain('180 days of access');
    expect(b).toContain('Downloadable completion certificate');
  });
  it('builds the mock list from attempts/duration', () => {
    const b = buildPackageBenefits('mock', values(), 1482);
    expect(b[0]).toBe('5 full-length mock attempts');
    expect(b).toContain('240-minute timed examination');
  });
  it('builds the complete list', () => {
    const b = buildPackageBenefits('complete', values(), 1482);
    expect(b[0]).toBe('All 1,482 practice questions');
  });
});

describe('templateToCreatePayload', () => {
  it('practice: fixes practice entitlements, no mock, references the practice bank', () => {
    const p = templateToCreatePayload('practice', values(), ctx);
    expect(p).toMatchObject({
      packageType: 'practice',
      practiceAccessEnabled: true,
      explanationAccessEnabled: true,
      studyPlanAccessEnabled: true,
      analyticsAccessEnabled: true,
      mockAccessEnabled: false,
      fullMockAttempts: 0,
      includedPracticeTestIds: ['ptBank'],
      includedQuizIds: [],
      promoEligible: true,
      referralEligible: true,
      refundEligible: true,
      taxTreatment: 'inclusive',
      isFree: false,
    });
  });
  it('mock: references the quiz bank only, carries attempt config', () => {
    const p = templateToCreatePayload('mock', values(), ctx);
    expect(p.mockAccessEnabled).toBe(true);
    expect(p.practiceAccessEnabled).toBe(false);
    expect(p.includedQuizIds).toEqual(['quizBank']);
    expect(p.includedPracticeTestIds).toEqual([]);
    expect(p.fullMockAttempts).toBe(5);
    expect(p.questionsPerMock).toBe(150);
    expect(p.mockDurationMinutes).toBe(240);
  });
  it('complete: both banks, recommended flag honored', () => {
    const p = templateToCreatePayload('complete', values({ isRecommended: true }), ctx);
    expect(p.includedQuizIds).toEqual(['quizBank']);
    expect(p.includedPracticeTestIds).toEqual(['ptBank']);
    expect(p.isRecommended).toBe(true);
  });
  it('defaults regular price to selling price when blank or lower', () => {
    expect(templateToCreatePayload('practice', values({ regularPrice: null }), ctx).regularPrice).toBe(199900);
    expect(templateToCreatePayload('practice', values({ regularPrice: 100000 }), ctx).regularPrice).toBe(199900);
    expect(templateToCreatePayload('practice', values({ regularPrice: 299900 }), ctx).regularPrice).toBe(299900);
  });
  it('clamps accessibleQuestionCount to the eligible bank total', () => {
    expect(templateToCreatePayload('practice', values({ numberOfQuestions: 99999 }), ctx).accessibleQuestionCount).toBe(1482);
  });
  it('falls back to default validity when the field is blank', () => {
    expect(templateToCreatePayload('practice', values({ validityDays: 0 }), ctx).accessValidityDays).toBe(180);
  });
  it('uses a benefits override when provided', () => {
    const p = templateToCreatePayload('practice', values({ benefitsOverride: ['Custom line'] }), ctx);
    expect(p.includedFeatures).toEqual(['Custom line']);
  });
});

describe('detectTemplate', () => {
  it('reads packageType first', () => {
    expect(detectTemplate({ packageType: 'complete', practiceAccessEnabled: false, mockAccessEnabled: false })).toBe('complete');
  });
  it('infers from entitlements when packageType is custom', () => {
    expect(detectTemplate({ packageType: 'x', practiceAccessEnabled: true, mockAccessEnabled: true })).toBe('complete');
    expect(detectTemplate({ packageType: 'x', practiceAccessEnabled: true, mockAccessEnabled: false })).toBe('practice');
    expect(detectTemplate({ packageType: 'x', practiceAccessEnabled: false, mockAccessEnabled: true })).toBe('mock');
    expect(detectTemplate({ packageType: 'x', practiceAccessEnabled: false, mockAccessEnabled: false })).toBe('custom');
  });
});
