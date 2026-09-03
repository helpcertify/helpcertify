// Duplicate / near-duplicate detection for submitted content (PRD 9B
// "Duplicate and near-duplicate detection against the existing bank").
// Pure + deterministic; the api handler re-implements the hashing inline.
// Real web-plagiarism checking is out of MVP scope - modelled as a manual
// compliance case a reviewer raises.

/** Normalise a question stem / item text for comparison: lowercase, strip
 * punctuation, collapse whitespace. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A stable content fingerprint - the normalised text with spaces removed.
 * Two items with the same fingerprint are exact duplicates. */
export function fingerprint(text: string): string {
  return normaliseText(text).replace(/\s/g, '');
}

/** Character trigrams of the normalised text, for near-duplicate scoring. */
export function trigrams(text: string): Set<string> {
  const s = normaliseText(text);
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Jaccard similarity of two texts' trigram sets, 0..1. */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface DedupInput {
  /** The new items being submitted; `id` is a local index/ref. */
  items: { id: string; text: string }[];
  /** Existing bank items to compare against. */
  existing: { ref: string; text: string }[];
  /** Near-duplicate threshold, default 0.82. */
  threshold?: number;
}

export interface DedupHit {
  itemId: string;
  matchRef: string;
  score: number;
  kind: 'exact' | 'near';
}

/** Flags each new item that exactly matches or is highly similar to an
 * existing bank item, or to another item in the same submission. */
export function findDuplicates(input: DedupInput): DedupHit[] {
  const threshold = input.threshold ?? 0.82;
  const hits: DedupHit[] = [];

  const existingFp = new Map<string, string>(); // fingerprint -> ref
  for (const e of input.existing) existingFp.set(fingerprint(e.text), e.ref);

  const seenInBatch = new Map<string, string>(); // fingerprint -> itemId

  for (const item of input.items) {
    const fp = fingerprint(item.text);

    const exactExisting = existingFp.get(fp);
    if (exactExisting) {
      hits.push({ itemId: item.id, matchRef: exactExisting, score: 1, kind: 'exact' });
      continue;
    }
    const exactBatch = seenInBatch.get(fp);
    if (exactBatch) {
      hits.push({ itemId: item.id, matchRef: `submission:${exactBatch}`, score: 1, kind: 'exact' });
      continue;
    }
    seenInBatch.set(fp, item.id);

    let best = { ref: '', score: 0 };
    for (const e of input.existing) {
      const s = similarity(item.text, e.text);
      if (s > best.score) best = { ref: e.ref, score: s };
    }
    if (best.score >= threshold) {
      hits.push({ itemId: item.id, matchRef: best.ref, score: Number(best.score.toFixed(3)), kind: 'near' });
    }
  }
  return hits;
}

/** Admin-maintained phrases that signal a leaked / memorised live-exam
 * question. A hit blocks publication pending review (PRD 9B). */
export function scanLeakedExamPhrases(text: string, blocklist: string[]): string[] {
  const n = normaliseText(text);
  return blocklist.map((p) => normaliseText(p)).filter((p) => p.length > 0 && n.includes(p));
}
