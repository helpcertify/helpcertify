import { describe, it, expect } from 'vitest';
import { normaliseText, fingerprint, similarity, findDuplicates, scanLeakedExamPhrases } from './contentDedup';
import { nextStatus, canTransition, isTerminal, creatorCanEdit } from './submissionState';
import { canReview, canPublish, missingDeclarations } from './reviewGuards';

describe('contentDedup', () => {
  it('normalises text', () => {
    expect(normaliseText('  What is  the CIA "triad"? ')).toBe('what is the cia triad');
  });

  it('gives identical fingerprints to punctuation/case variants', () => {
    expect(fingerprint('What is the CIA triad?')).toBe(fingerprint('what is  the cia   triad'));
  });

  it('scores similar text high and different text low', () => {
    expect(similarity('the quick brown fox', 'the quick brown fox')).toBe(1);
    expect(similarity('the quick brown fox jumps', 'the quick brown fox leaps')).toBeGreaterThan(0.6);
    expect(similarity('confidentiality integrity availability', 'the mitochondria is the powerhouse')).toBeLessThan(0.1);
  });

  it('flags an exact duplicate against the existing bank', () => {
    const hits = findDuplicates({
      items: [{ id: '1', text: 'What is the CIA triad?' }],
      existing: [{ ref: 'q_99', text: 'what is the cia triad' }],
    });
    expect(hits).toEqual([{ itemId: '1', matchRef: 'q_99', score: 1, kind: 'exact' }]);
  });

  it('flags a near-duplicate above threshold', () => {
    const hits = findDuplicates({
      items: [{ id: '1', text: 'Which control ensures data confidentiality in transit over a network link?' }],
      existing: [{ ref: 'q_1', text: 'Which control ensures data confidentiality in transit over the network link?' }],
      threshold: 0.8,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('near');
  });

  it('flags duplicates within the same submission', () => {
    const hits = findDuplicates({
      items: [
        { id: 'a', text: 'Define least privilege.' },
        { id: 'b', text: 'define  least privilege' },
      ],
      existing: [],
    });
    expect(hits).toEqual([{ itemId: 'b', matchRef: 'submission:a', score: 1, kind: 'exact' }]);
  });

  it('passes clean, distinct items', () => {
    const hits = findDuplicates({
      items: [
        { id: '1', text: 'What is a hardware security module?' },
        { id: '2', text: 'Explain separation of duties.' },
      ],
      existing: [{ ref: 'q_1', text: 'Describe the OSI model layers.' }],
    });
    expect(hits).toEqual([]);
  });

  it('scans for leaked-exam phrases', () => {
    expect(scanLeakedExamPhrases('This is verbatim from the real exam bank', ['verbatim from the real exam'])).toHaveLength(1);
    expect(scanLeakedExamPhrases('An original question', ['verbatim from the real exam'])).toHaveLength(0);
  });
});

describe('submissionState', () => {
  it('walks the happy path to PUBLISHED', () => {
    expect(nextStatus('DRAFT', 'submit')).toBe('SUBMITTED');
    expect(nextStatus('SUBMITTED', 'autochecks_pass')).toBe('SME_REVIEW');
    expect(nextStatus('SME_REVIEW', 'review_approve')).toBe('APPROVED');
    expect(nextStatus('APPROVED', 'publish')).toBe('PUBLISHED');
  });

  it('routes a flagged submission to FLAGGED and lets a reviewer clear or uphold it', () => {
    expect(nextStatus('SUBMITTED', 'autochecks_flag')).toBe('FLAGGED');
    expect(nextStatus('FLAGGED', 'flag_cleared')).toBe('SME_REVIEW');
    expect(nextStatus('FLAGGED', 'flag_upheld')).toBe('REJECTED');
  });

  it('loops changes-required back through submission', () => {
    expect(nextStatus('SME_REVIEW', 'review_changes')).toBe('CHANGES_REQUIRED');
    expect(nextStatus('CHANGES_REQUIRED', 'resubmit')).toBe('SUBMITTED');
  });

  it('rejects impossible transitions', () => {
    expect(canTransition('PUBLISHED', 'withdraw')).toBe(false);
    expect(canTransition('DRAFT', 'publish')).toBe(false);
    expect(canTransition('REJECTED', 'resubmit')).toBe(false);
  });

  it('knows terminal + editable states', () => {
    expect(isTerminal('PUBLISHED')).toBe(true);
    expect(isTerminal('SME_REVIEW')).toBe(false);
    expect(creatorCanEdit('CHANGES_REQUIRED')).toBe(true);
    expect(creatorCanEdit('SME_REVIEW')).toBe(false);
  });
});

describe('reviewGuards', () => {
  it('a creator cannot review their own work', () => {
    expect(canReview({ actorUid: 'u1', creatorUid: 'u1' }).ok).toBe(false);
    expect(canReview({ actorUid: 'u2', creatorUid: 'u1' }).ok).toBe(true);
  });
  it('a conflict of interest blocks review', () => {
    expect(canReview({ actorUid: 'u2', creatorUid: 'u1', conflictOfInterest: true }).ok).toBe(false);
  });
  it('publisher must differ from creator and reviewer', () => {
    expect(canPublish({ actorUid: 'u1', creatorUid: 'u1', reviewerUid: 'u2' }).ok).toBe(false);
    expect(canPublish({ actorUid: 'u2', creatorUid: 'u1', reviewerUid: 'u2' }).ok).toBe(false);
    expect(canPublish({ actorUid: 'u3', creatorUid: 'u1', reviewerUid: 'u2' }).ok).toBe(true);
  });
  it('lists missing declarations', () => {
    expect(
      missingDeclarations({ originality: true, noLeakedExam: true, aiAssisted: false }, { originality: true, aiDisclosure: true }),
    ).toEqual([]);
    expect(
      missingDeclarations({ noLeakedExam: true }, { originality: true, aiDisclosure: true }),
    ).toContain('originality declaration');
    expect(
      missingDeclarations({ originality: true, noLeakedExam: true, aiAssisted: true }, { originality: true, aiDisclosure: true }),
    ).toContain('human verifier for AI-assisted content');
  });
});
