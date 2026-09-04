import { describe, it, expect } from 'vitest';
import { parseQaText } from './parseQa';

describe('parseQaText', () => {
  it('parses a clean two-question block with letter answers', () => {
    const { items, errors } = parseQaText(`
1. What does the CIA triad stand for?
A. Confidentiality, Integrity, Availability
B. Control, Isolation, Access
Answer: A
Explanation: It is the core information-security model.

2. Which is a preventive control?
A. Audit log
B. Door lock
Answer: B
`);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0].stem).toBe('What does the CIA triad stand for?');
    expect(items[0].answer).toBe('Confidentiality, Integrity, Availability');
    expect(items[0].explanation).toContain('core information-security model');
    expect(items[1].answer).toBe('Door lock');
  });

  it('accepts an answer given as full option text', () => {
    const { items, errors } = parseQaText(`Define least privilege.
A. Minimum access needed
B. Maximum access
Answer: Minimum access needed`);
    expect(errors).toEqual([]);
    expect(items[0].answer).toBe('Minimum access needed');
  });

  it('reports blocks that are missing pieces', () => {
    const { items, errors } = parseQaText(`1. A question with no options
Answer: A

2. Only a stem here`);
    expect(items).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toMatch(/two options/);
  });

  it('flags an answer letter with no matching option', () => {
    const { errors } = parseQaText(`Stem?
A. one
B. two
Answer: D`);
    expect(errors[0].message).toMatch(/no matching option/);
  });

  it('multi-line explanation is joined', () => {
    const { items } = parseQaText(`Stem?
A. x
B. y
Answer: A
Explanation: first line
second line`);
    expect(items[0].explanation).toBe('first line second line');
  });
});
