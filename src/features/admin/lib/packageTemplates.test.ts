import { describe, it, expect } from 'vitest';
import {
  buildPackageBenefits,
  templateToCreatePayload,
  emptyTemplateValues,
  detectTemplate,
  visibleBenefits,
  applyComboDiscount,
  type TemplateContext,
  type TemplateValues,
} from './packageTemplates';

describe('applyComboDiscount', () => {
  it('returns the parts total when there is no discount', () => {
    expect(applyComboDiscount(150000, null)).toBe(150000);
    expect(applyComboDiscount(150000, { mode: 'percent', value: 0 })).toBe(150000);
  });
  it('takes a percent off, capped at 95%', () => {
    expect(applyComboDiscount(200000, { mode: 'percent', value: 25 })).toBe(150000);
    expect(applyComboDiscount(200000, { mode: 'percent', value: 99 })).toBe(10000);
  });
  it('takes a fixed amount off, never below 100 minor units', () => {
    expect(applyComboDiscount(200000, { mode: 'amount', value: 50000 })).toBe(150000);
    expect(applyComboDiscount(200000, { mode: 'amount', value: 999999 })).toBe(100);
  });
});

const ctx: TemplateContext = {
  certificationId: 'cert1',
  practiceBankIds: ['ptBank'],
  mockBankIds: ['quizBank'],
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

describe('visibleBenefits', () => {
  it('drops the detailed-explanation line, keeps everything else', () => {
    expect(
      visibleBenefits(['1,482 practice questions', 'Detailed answer explanations', 'Detailed explanations', '180 days of access']),
    ).toEqual(['1,482 practice questions', '180 days of access']);
  });
  it('does not touch a line that merely mentions explanations', () => {
    expect(visibleBenefits(['Explanations released after submission'])).toEqual(['Explanations released after submission']);
  });
});

describe('buildPackageBenefits', () => {
  it('no longer includes a standalone explanation bullet', () => {
    for (const id of ['practice', 'mock', 'complete'] as const) {
      expect(buildPackageBenefits(id, values(), 1482).map((b) => b.toLowerCase())).not.toContain('detailed answer explanations');
      expect(buildPackageBenefits(id, values(), 1482).map((b) => b.toLowerCase())).not.toContain('detailed explanations');
    }
  });
  it('uses the real bank total for the question count, ignoring the typed number', () => {
    expect(buildPackageBenefits('practice', values({ numberOfQuestions: 50 }), 1482)[0]).toBe('1,482 practice questions');
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
