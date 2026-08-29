import { describe, it, expect } from 'vitest';
import { buildPublishedReadModel, type ReadModelCertificationInput, type ReadModelPackageInput } from './publishedProductReadModel';

const now = new Date('2026-06-15T00:00:00Z');

function makeCert(overrides: Partial<ReadModelCertificationInput> = {}): ReadModelCertificationInput {
  return { id: 'cert1', name: 'CISM Preparation', provider: 'ISACA', status: 'published', displayOrder: 0, featured: false, ...overrides };
}

function makePkg(overrides: Partial<ReadModelPackageInput> = {}): ReadModelPackageInput {
  return {
    id: 'pkg1',
    certificationId: 'cert1',
    name: 'Complete Preparation',
    status: 'published',
    isRecommended: true,
    badgeText: 'Best Value',
    regularPrice: 1499900,
    sellingPrice: 999900,
    offerPrice: null,
    offerStart: null,
    offerEnd: null,
    offerCancelledAt: null,
    currency: 'INR',
    accessValidityDays: 180,
    accessibleQuestionCount: 1500,
    fullMockAttempts: 10,
    displayOrder: 0,
    ...overrides,
  };
}

describe('buildPublishedReadModel', () => {
  it('excludes a draft certification entirely', () => {
    const result = buildPublishedReadModel([makeCert({ status: 'draft' })], [makePkg()], now);
    expect(result).toEqual([]);
  });

  it('excludes an archived certification entirely', () => {
    const result = buildPublishedReadModel([makeCert({ status: 'archived' })], [makePkg()], now);
    expect(result).toEqual([]);
  });

  it('excludes an unpublished package even under a published certification', () => {
    const result = buildPublishedReadModel([makeCert()], [makePkg({ status: 'unpublished' })], now);
    expect(result).toEqual([]);
  });

  it('excludes a published certification with zero published packages (shows as nothing, not an empty shell)', () => {
    const result = buildPublishedReadModel([makeCert()], [makePkg({ status: 'draft' })], now);
    expect(result).toEqual([]);
  });

  it('includes a published certification with at least one published package', () => {
    const result = buildPublishedReadModel([makeCert()], [makePkg()], now);
    expect(result).toHaveLength(1);
    expect(result[0].packages).toHaveLength(1);
    expect(result[0].packages[0].name).toBe('Complete Preparation');
  });

  it('computes currentPrice from an active offer, not the static selling price', () => {
    const pkg = makePkg({ sellingPrice: 999900, offerPrice: 799900, offerStart: new Date('2026-06-01'), offerEnd: new Date('2026-06-30') });
    const result = buildPublishedReadModel([makeCert()], [pkg], now);
    expect(result[0].packages[0].currentPrice).toBe(799900);
    expect(result[0].packages[0].offerActive).toBe(true);
  });

  it('falls back to the selling price once an offer has expired', () => {
    const pkg = makePkg({ sellingPrice: 999900, offerPrice: 799900, offerStart: new Date('2026-01-01'), offerEnd: new Date('2026-01-31') });
    const result = buildPublishedReadModel([makeCert()], [pkg], now);
    expect(result[0].packages[0].currentPrice).toBe(999900);
    expect(result[0].packages[0].offerActive).toBe(false);
  });

  it('only returns packages belonging to their own certification', () => {
    const certs = [makeCert({ id: 'cert1' }), makeCert({ id: 'cert2', name: 'CISA Preparation' })];
    const pkgs = [makePkg({ id: 'p1', certificationId: 'cert1' }), makePkg({ id: 'p2', certificationId: 'cert2', name: 'CISA Complete' })];
    const result = buildPublishedReadModel(certs, pkgs, now);
    expect(result).toHaveLength(2);
    const cert1 = result.find((c) => c.id === 'cert1')!;
    expect(cert1.packages.map((p) => p.id)).toEqual(['p1']);
  });
});
