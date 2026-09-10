import { describe, it, expect } from 'vitest';
import { groupByDomain, type BankQuestion } from './practiceDomainStats';

const bank = new Map<string, BankQuestion>([
  ['a', { id: 'a', bankId: 'b1', questionText: 'Qa', domain: 'Governance' }],
  ['b', { id: 'b', bankId: 'b1', questionText: 'Qb', domain: 'Governance' }],
  ['c', { id: 'c', bankId: 'b1', questionText: 'Qc', domain: 'Risk' }],
  ['d', { id: 'd', bankId: 'b1', questionText: 'Qd' }], // untagged
]);

describe('groupByDomain', () => {
  it('aggregates accuracy per domain, sorted by volume', () => {
    const stats = {
      a: { attempts: 2, correct: 2 },
      b: { attempts: 2, correct: 1 },
      c: { attempts: 1, correct: 0 },
      d: { attempts: 3, correct: 1 },
    };
    const { domains, untagged, anyTagged } = groupByDomain(stats, bank);
    expect(anyTagged).toBe(true);
    expect(domains).toEqual([
      { domain: 'Governance', attempted: 4, correct: 3, accuracyPct: 75 },
      { domain: 'Risk', attempted: 1, correct: 0, accuracyPct: 0 },
    ]);
    expect(untagged).toBe(1);
  });

  it('reports anyTagged false when no question carries a domain', () => {
    const noDomains = new Map<string, BankQuestion>([['x', { id: 'x', bankId: 'b', questionText: 'Qx' }]]);
    const { domains, anyTagged } = groupByDomain({ x: { attempts: 1, correct: 1 } }, noDomains);
    expect(anyTagged).toBe(false);
    expect(domains).toEqual([]);
  });
});
