// Pure aggregation over practice-bank question metadata - kept out of the
// hook file so it has no firebase import and stays unit-testable.

export interface BankQuestion {
  id: string;
  bankId: string;
  questionText: string;
  domain?: string;
}

export interface DomainStat {
  domain: string;
  attempted: number;
  correct: number;
  accuracyPct: number;
}

// Group a learner's questionStats by the joined question domain. Questions
// with no domain tag collect under `untagged` (attempted count only).
export function groupByDomain(
  questionStats: Record<string, { attempts: number; correct: number }>,
  questions: Map<string, { domain?: string }>,
): { domains: DomainStat[]; untagged: number; anyTagged: boolean } {
  const acc = new Map<string, { attempted: number; correct: number }>();
  let untagged = 0;
  let anyTagged = false;
  for (const q of questions.values()) if (q.domain) anyTagged = true;

  for (const [qid, s] of Object.entries(questionStats)) {
    const domain = questions.get(qid)?.domain;
    if (!domain) {
      untagged += s.attempts > 0 ? 1 : 0;
      continue;
    }
    const cur = acc.get(domain) ?? { attempted: 0, correct: 0 };
    cur.attempted += s.attempts;
    cur.correct += s.correct;
    acc.set(domain, cur);
  }

  const domains: DomainStat[] = [...acc.entries()]
    .map(([domain, v]) => ({
      domain,
      attempted: v.attempted,
      correct: v.correct,
      accuracyPct: v.attempted > 0 ? Math.round((v.correct / v.attempted) * 100) : 0,
    }))
    .sort((a, b) => b.attempted - a.attempted || a.domain.localeCompare(b.domain));

  return { domains, untagged, anyTagged };
}
