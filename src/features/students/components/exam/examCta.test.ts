import { describe, it, expect } from 'vitest';
import { examCta, rollUpStatus } from './examCta';

describe('examCta', () => {
  it('locked always routes to the plans modal', () => {
    expect(examCta('locked', 'practice', '/x')).toMatchObject({ label: 'View Plans', action: 'plans' });
    expect(examCta('locked', 'mock', '/x')).toMatchObject({ label: 'View Plans', action: 'plans' });
  });

  it('uses kind-specific start and review labels', () => {
    expect(examCta('not_started', 'practice', '/x')).toMatchObject({ label: 'Start Practice', action: 'link', href: '/x' });
    expect(examCta('not_started', 'mock', '/x')).toMatchObject({ label: 'Start Mock Exam' });
    expect(examCta('completed', 'practice', '/x')).toMatchObject({ label: 'Review' });
    expect(examCta('completed', 'mock', '/x')).toMatchObject({ label: 'View Results' });
  });

  it('in progress is always Continue', () => {
    expect(examCta('in_progress', 'practice', '/x').label).toBe('Continue');
    expect(examCta('in_progress', 'mock', '/x').label).toBe('Continue');
  });
});

describe('rollUpStatus', () => {
  it('is locked when nothing is owned', () => {
    expect(rollUpStatus([{ status: 'locked' }, { status: 'locked' }])).toBe('locked');
    expect(rollUpStatus([])).toBe('locked');
  });

  it('is completed only when every unlocked set is done', () => {
    expect(rollUpStatus([{ status: 'completed' }, { status: 'completed' }, { status: 'locked' }])).toBe('completed');
    expect(rollUpStatus([{ status: 'completed' }, { status: 'not_started' }])).toBe('in_progress');
  });

  it('is in_progress on any activity, else not_started', () => {
    expect(rollUpStatus([{ status: 'in_progress' }, { status: 'not_started' }])).toBe('in_progress');
    expect(rollUpStatus([{ status: 'not_started' }, { status: 'locked' }])).toBe('not_started');
  });
});
