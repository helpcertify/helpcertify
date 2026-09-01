import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug, nextDisplayOrder, iconForProvider, buildDisclaimer } from './certificationDefaults';

describe('slugify', () => {
  it('lowercases and hyphenates', () => expect(slugify('CISM Exam Preparation')).toBe('cism-exam-preparation'));
  it('collapses runs and trims edges', () => expect(slugify('  AWS  --  Solutions!! ')).toBe('aws-solutions'));
  it('strips diacritics', () => expect(slugify('Résumé Prep')).toBe('resume-prep'));
  it('handles punctuation and compatibility chars', () => expect(slugify('(ISC)² CISSP')).toBe('isc-2-cissp'));
});

describe('uniqueSlug', () => {
  it('returns the base when free', () => expect(uniqueSlug('cism', ['aws', 'pmp'])).toBe('cism'));
  it('suffixes -2, -3 on collision (case-insensitive)', () => {
    expect(uniqueSlug('cism', ['CISM'])).toBe('cism-2');
    expect(uniqueSlug('cism', ['cism', 'cism-2'])).toBe('cism-3');
  });
});

describe('nextDisplayOrder', () => {
  it('is 0 for an empty catalog', () => expect(nextDisplayOrder([])).toBe(0));
  it('is one past the current max', () => expect(nextDisplayOrder([{ displayOrder: 0 }, { displayOrder: 4 }, { displayOrder: 2 }])).toBe(5));
});

describe('iconForProvider', () => {
  it('maps cloud vendors', () => {
    expect(iconForProvider('AWS')).toBe('cloud');
    expect(iconForProvider('Microsoft Azure')).toBe('cloud');
  });
  it('maps networking', () => expect(iconForProvider('Cisco')).toBe('network'));
  it('maps data/AI', () => expect(iconForProvider('Google Cloud – Machine Learning')).toBe('cloud')); // cloud rule wins first
  it('falls back to the shield', () => {
    expect(iconForProvider('ISACA')).toBe('shield');
    expect(iconForProvider('PMI')).toBe('shield');
    expect(iconForProvider('')).toBe('shield');
  });
});

describe('buildDisclaimer', () => {
  it('substitutes exam name and provider', () => {
    const d = buildDisclaimer('CISM', 'ISACA');
    expect(d).toContain('CISM is a trademark of ISACA.');
    expect(d).toContain('operated by INDYABEES');
    expect(d).toContain('does not grant the official CISM certification');
    expect(d).not.toContain('undefined');
  });
});
