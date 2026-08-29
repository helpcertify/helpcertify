import { describe, it, expect } from 'vitest';
import {
  isQuizAttemptCertificateEligible,
  isPracticeTestCertificateEligible,
  computeCompletionPercent,
  buildSourceAttemptKey,
  canAccessCertificate,
} from './certificateEligibility';

describe('isQuizAttemptCertificateEligible', () => {
  it('is not eligible while the attempt is still in progress', () => {
    expect(isQuizAttemptCertificateEligible({ status: 'in_progress', correctCount: 90, totalQuestions: 100, passMarkPercent: 60 })).toBe(false);
  });

  it('is not eligible for an expired (abandoned) attempt', () => {
    expect(isQuizAttemptCertificateEligible({ status: 'expired', correctCount: 90, totalQuestions: 100, passMarkPercent: 60 })).toBe(false);
  });

  it('is not eligible when submitted but below the pass mark', () => {
    expect(isQuizAttemptCertificateEligible({ status: 'submitted', correctCount: 50, totalQuestions: 100, passMarkPercent: 60 })).toBe(false);
  });

  it('is eligible once submitted at or above the pass mark', () => {
    expect(isQuizAttemptCertificateEligible({ status: 'submitted', correctCount: 60, totalQuestions: 100, passMarkPercent: 60 })).toBe(true);
    expect(isQuizAttemptCertificateEligible({ status: 'auto_submitted', correctCount: 75, totalQuestions: 100, passMarkPercent: 60 })).toBe(true);
  });

  it('is not eligible for a zero-question quiz (avoids a divide-by-zero false pass)', () => {
    expect(isQuizAttemptCertificateEligible({ status: 'submitted', correctCount: 0, totalQuestions: 0, passMarkPercent: 60 })).toBe(false);
  });
});

describe('isPracticeTestCertificateEligible', () => {
  it('is not eligible until every question has been answered', () => {
    expect(isPracticeTestCertificateEligible({ answeredCount: 900, totalQuestions: 1500 })).toBe(false);
  });

  it('is eligible once every question has been answered at least once', () => {
    expect(isPracticeTestCertificateEligible({ answeredCount: 1500, totalQuestions: 1500 })).toBe(true);
  });

  it('is not eligible for a bank with zero questions', () => {
    expect(isPracticeTestCertificateEligible({ answeredCount: 0, totalQuestions: 0 })).toBe(false);
  });
});

describe('computeCompletionPercent', () => {
  it('rounds to the nearest whole percent', () => {
    expect(computeCompletionPercent(1, 3)).toBe(33);
    expect(computeCompletionPercent(2, 3)).toBe(67);
  });
  it('is zero for a zero-question total', () => expect(computeCompletionPercent(5, 0)).toBe(0));
  it('is 100 for a fully completed item', () => expect(computeCompletionPercent(150, 150)).toBe(100));
});

describe('buildSourceAttemptKey', () => {
  it('is the same key for the same learner/source/attempt (idempotent issuance)', () => {
    const a = buildSourceAttemptKey('uid1', 'quiz', 'quiz1', 'attempt1');
    const b = buildSourceAttemptKey('uid1', 'quiz', 'quiz1', 'attempt1');
    expect(a).toBe(b);
  });

  it('is a different key for a different attempt (a new completed attempt earns a new certificate)', () => {
    const a = buildSourceAttemptKey('uid1', 'quiz', 'quiz1', 'attempt1');
    const b = buildSourceAttemptKey('uid1', 'quiz', 'quiz1', 'attempt2');
    expect(a).not.toBe(b);
  });

  it('is a different key for a different learner on the same attempt id', () => {
    const a = buildSourceAttemptKey('uid1', 'quiz', 'quiz1', 'attempt1');
    const b = buildSourceAttemptKey('uid2', 'quiz', 'quiz1', 'attempt1');
    expect(a).not.toBe(b);
  });
});

describe('canAccessCertificate', () => {
  it('allows the certificate owner', () => expect(canAccessCertificate('uid1', 'uid1')).toBe(true));
  it('rejects any other learner (one learner cannot download another learner\'s certificate)', () => {
    expect(canAccessCertificate('uid1', 'uid2')).toBe(false);
  });
});
