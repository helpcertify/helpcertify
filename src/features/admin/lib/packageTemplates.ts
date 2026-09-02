// The three ready-made package shapes the simplified Packages & Pricing
// step offers - Practice Questions, Mock Exams, Complete Preparation. Each
// template fixes the entitlement flags a learner would expect for that
// shape so the admin only ever fills in prices and a few numbers; the raw
// per-entitlement switches stay available under the step's "Advanced" /
// custom-package escape hatch.
//
// Pure and framework-agnostic (unit-tested in packageTemplates.test.ts).
// Prices are handled in MINOR units (paise/cents) throughout, matching
// CreatePackagePayload - the form converts with majorToMinor before
// calling in.

import type { CreatePackagePayload } from '../api/contentAdminApi';

export type TemplateId = 'practice' | 'mock' | 'complete';

export interface TemplateDef {
  id: TemplateId;
  name: string;
  blurb: string;
  /** Which numeric inputs this template shows the admin. */
  fields: {
    numberOfQuestions: boolean;
    mockAttempts: boolean;
    questionsPerMock: boolean;
    durationMinutes: boolean;
    recommendedToggle: boolean;
  };
}

export const PACKAGE_TEMPLATES: Record<TemplateId, TemplateDef> = {
  practice: {
    id: 'practice',
    name: 'Practice Questions',
    blurb: 'Full practice-question bank with explanations, study plan and analytics.',
    fields: { numberOfQuestions: true, mockAttempts: false, questionsPerMock: false, durationMinutes: false, recommendedToggle: false },
  },
  mock: {
    id: 'mock',
    name: 'Mock Exams',
    blurb: 'Timed, full-length mock attempts with domain-level result analysis.',
    fields: { numberOfQuestions: false, mockAttempts: true, questionsPerMock: true, durationMinutes: true, recommendedToggle: false },
  },
  complete: {
    id: 'complete',
    name: 'Complete Preparation',
    blurb: 'Everything in Practice Questions and Mock Exams in one package.',
    fields: { numberOfQuestions: true, mockAttempts: true, questionsPerMock: true, durationMinutes: true, recommendedToggle: true },
  },
};

const hasPractice = (id: TemplateId) => id === 'practice' || id === 'complete';
const hasMock = (id: TemplateId) => id === 'mock' || id === 'complete';

/** Everything the admin can type for one enabled template card. All prices
 *  in minor units; blank optional numbers come in as `null`. */
export interface TemplateValues {
  sellingPrice: number;
  regularPrice: number | null;
  offerPrice: number | null;
  offerStart: string | null;
  offerEnd: string | null;
  renewalPrice: number | null;
  numberOfQuestions: number;
  mockAttempts: number;
  questionsPerMock: number;
  durationMinutes: number;
  validityDays: number;
  isRecommended: boolean;
  /** null = use the generated benefit list. */
  benefitsOverride: string[] | null;
  badgeText: string | null;
  /** Complete-only: the combo saving off (Practice + Mock). null = none. */
  comboDiscount: ComboDiscount | null;
}

export interface ComboDiscount {
  mode: 'percent' | 'amount';
  /** percent 1-95, or amount in minor units. */
  value: number;
}

/** The Complete selling price = (Practice + Mock) minus the combo saving,
 *  floored at 100 minor units so Razorpay always has a positive amount. */
export function applyComboDiscount(partsSelling: number, discount: ComboDiscount | null): number {
  if (!discount || discount.value <= 0) return partsSelling;
  const off =
    discount.mode === 'percent'
      ? Math.round((partsSelling * Math.min(discount.value, 95)) / 100)
      : Math.min(discount.value, partsSelling);
  return Math.max(100, partsSelling - off);
}

export function emptyTemplateValues(defaultValidityDays: number): TemplateValues {
  return {
    sellingPrice: 0,
    regularPrice: null,
    offerPrice: null,
    offerStart: null,
    offerEnd: null,
    renewalPrice: null,
    numberOfQuestions: 0,
    mockAttempts: 5,
    questionsPerMock: 150,
    durationMinutes: 240,
    validityDays: defaultValidityDays,
    isRecommended: false,
    benefitsOverride: null,
    badgeText: null,
    comboDiscount: null,
  };
}

export interface TemplateContext {
  certificationId: string;
  /** Every practice-batch bank id (one entry for a single linked bank). */
  practiceBankIds: string[];
  /** Every mock-batch bank id (one entry for a single linked bank). */
  mockBankIds: string[];
  /** Published questions across the practice bank(s) - the hard cap on any promised count. */
  eligiblePracticeQuestions: number;
  defaultValidityDays: number;
  currency: 'INR' | 'USD';
  displayOrder: number;
}

/** The learner-visible benefit bullets for a template, built from the
 *  admin's numbers. A promised question count is never allowed to exceed
 *  `eligiblePracticeQuestions`. */
export function buildPackageBenefits(id: TemplateId, v: TemplateValues, eligiblePracticeQuestions: number): string[] {
  // The count shown to learners is always the real published total from the
  // uploaded question docs, not the admin-typed number.
  const questions = eligiblePracticeQuestions > 0 ? eligiblePracticeQuestions : Math.max(0, v.numberOfQuestions || 0);
  const days = `${v.validityDays} days of access`;
  if (id === 'practice') {
    return [
      `${questions.toLocaleString()} practice questions`,
      'Personalized study plan',
      'Domain-level performance analytics',
      days,
      'Downloadable completion certificate',
    ];
  }
  if (id === 'mock') {
    return [
      `${v.mockAttempts} full-length mock attempts`,
      `${v.questionsPerMock} questions per mock`,
      `${v.durationMinutes}-minute timed examination`,
      'Domain-level result analysis',
      'Exam-readiness score',
      'Downloadable certificate after completion',
      days,
    ];
  }
  return [
    `All ${questions.toLocaleString()} practice questions`,
    `${v.mockAttempts} full-length mock attempts`,
    'Personalized study plan',
    'Performance analytics',
    'Completion certificates',
    days,
  ];
}

// Drop the "detailed explanation" benefit line wherever it appears -
// existing packages have it baked into includedFeatures, so filter it at
// display time as well as no longer generating it above.
export function visibleBenefits(features: string[]): string[] {
  return features.filter((f) => !/^detailed\s+(answer\s+)?explanations?$/i.test(f.trim()));
}

/** Turn one enabled template card into a full CreatePackagePayload - every
 *  entitlement flag fixed by the template, safe platform defaults applied
 *  for the rest. */
export function templateToCreatePayload(id: TemplateId, v: TemplateValues, ctx: TemplateContext): CreatePackagePayload {
  const practice = hasPractice(id);
  const mock = hasMock(id);
  const regularPrice = v.regularPrice != null && v.regularPrice > v.sellingPrice ? v.regularPrice : v.sellingPrice;
  const questions = practice ? Math.max(0, Math.min(v.numberOfQuestions || 0, ctx.eligiblePracticeQuestions)) : 0;

  return {
    certificationId: ctx.certificationId,
    name: PACKAGE_TEMPLATES[id].name,
    packageType: id,
    badgeText: v.badgeText,
    isRecommended: id === 'complete' ? v.isRecommended : false,
    description: '',
    shortDescription: PACKAGE_TEMPLATES[id].blurb,
    includedFeatures: v.benefitsOverride ?? buildPackageBenefits(id, v, ctx.eligiblePracticeQuestions),
    includedQuizIds: mock ? ctx.mockBankIds.filter(Boolean) : [],
    includedPracticeTestIds: practice ? ctx.practiceBankIds.filter(Boolean) : [],
    comboDiscount: id === 'complete' ? v.comboDiscount : null,
    displayOrder: ctx.displayOrder,

    practiceAccessEnabled: practice,
    accessibleQuestionCount: questions,
    explanationAccessEnabled: practice,
    mockAccessEnabled: mock,
    fullMockAttempts: mock ? v.mockAttempts : 0,
    miniMockAttempts: 0,
    questionsPerMock: mock ? v.questionsPerMock : 0,
    mockDurationMinutes: mock ? v.durationMinutes : 0,
    studyPlanAccessEnabled: practice,
    analyticsAccessEnabled: true,
    trialAvailable: false,
    accessValidityDays: v.validityDays || ctx.defaultValidityDays,
    renewalAvailable: v.renewalPrice != null,
    upgradeAvailable: false,
    promoEligible: true,
    referralEligible: true,
    refundEligible: true,

    currency: ctx.currency,
    regularPrice,
    sellingPrice: v.sellingPrice,
    offerPrice: v.offerPrice,
    offerStart: v.offerStart,
    offerEnd: v.offerEnd,
    renewalPrice: v.renewalPrice,
    taxTreatment: 'inclusive',
    isFree: false,
  };
}

/** Best-guess which template an existing package came from, for the
 *  edit view. Anything that doesn't match cleanly is treated as `custom`
 *  and edited through the raw package form. */
export function detectTemplate(pkg: {
  packageType: string;
  practiceAccessEnabled: boolean;
  mockAccessEnabled: boolean;
}): TemplateId | 'custom' {
  if (pkg.packageType === 'practice' || pkg.packageType === 'mock' || pkg.packageType === 'complete') {
    return pkg.packageType;
  }
  if (pkg.practiceAccessEnabled && pkg.mockAccessEnabled) return 'complete';
  if (pkg.mockAccessEnabled) return 'mock';
  if (pkg.practiceAccessEnabled) return 'practice';
  return 'custom';
}
