// Pure helpers that generate the "technical" certification fields a
// non-technical admin should never have to type - slug, display order,
// card icon, independent-preparation disclaimer. Framework-agnostic and
// unit-tested (see certificationDefaults.test.ts); the simplified product
// form (CertificationEditorPage.tsx) calls these when building its
// create/update payload, and every generated value stays overridable in
// the form's Advanced Settings.

import type { CertificationIconKey } from '@/types/models';

/** Lowercase, hyphen-separated, ASCII-only - matches api/content-admin.ts's
 *  createCertificationSchema slug regex (`^[a-z0-9-]+$`). */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** `base`, or `base-2`, `base-3`… - the first form not already in `taken`.
 *  Comparison is case-insensitive since slugs are always lowercased. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const s of taken) used.add(s.trim().toLowerCase());
  const root = base || 'certification';
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** The next free ordering slot: one past the current maximum (0 when empty). */
export function nextDisplayOrder(existing: ReadonlyArray<{ displayOrder: number }>): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((c) => c.displayOrder ?? 0)) + 1;
}

const ICON_RULES: ReadonlyArray<[RegExp, CertificationIconKey]> = [
  [/\b(aws|amazon|azure|microsoft|google|gcp|oracle cloud|cloud|kubernetes|terraform)\b/i, 'cloud'],
  [/\b(cisco|juniper|comptia network|network|ccna|ccnp|ccie)\b/i, 'network'],
  [/\b(data|analytics|databricks|snowflake|tableau|ai|ml|machine learning|tensorflow)\b/i, 'chart'],
];

/** A sensible card icon for a provider/track name. Everything else - ISACA,
 *  (ISC)², CompTIA (Security+), PMI, EC-Council, etc. - falls back to the
 *  HelpCertify shield. */
export function iconForProvider(provider: string): CertificationIconKey {
  for (const [pattern, icon] of ICON_RULES) if (pattern.test(provider)) return icon;
  return 'shield';
}

/** The standard independent-preparation disclaimer, with the exam short name
 *  and provider substituted in. Kept as one string so it drops straight into
 *  `independentPrepDisclaimer`. */
export function buildDisclaimer(shortName: string, provider: string): string {
  const exam = shortName.trim() || 'This certification';
  const body = provider.trim() || 'the certification body';
  return (
    `${exam} is a trademark of ${body}. HelpCertify is an independent exam-preparation ` +
    `platform operated by INDYABEES and is not affiliated with, endorsed by or sponsored by ` +
    `${body}. Completion of this preparation material does not grant the official ${exam} ` +
    `certification or guarantee examination success.`
  );
}
