import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BankQuestion } from '../lib/practiceDomainStats';

export type { BankQuestion } from '../lib/practiceDomainStats';
export { groupByDomain, type DomainStat } from '../lib/practiceDomainStats';

// Lazily reads the public question docs for a set of practice banks so the
// per-certification detail page can build Topic Performance / Question
// History without a dedicated endpoint. firestore.rules lets any signed-in
// user read practiceTests/{id}/questions (the answer key is separately
// gated). Gated by `enabled` so the reads only fire when the learner opens
// one of those tabs; cached 30 min.
export function usePracticeQuestionBank(bankIds: string[], enabled: boolean) {
  const key = [...bankIds].sort();
  return useQuery({
    queryKey: ['student', 'practiceBankQuestions', key.join(',')],
    enabled: enabled && key.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Map<string, BankQuestion>> => {
      const perBank = await Promise.all(
        key.map(async (bankId) => {
          const snap = await getDocs(collection(db, 'practiceTests', bankId, 'questions'));
          return snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              bankId,
              questionText: String(data.questionText ?? ''),
              domain: (data.domain as string | undefined)?.trim() || undefined,
            } satisfies BankQuestion;
          });
        }),
      );
      const map = new Map<string, BankQuestion>();
      for (const list of perBank) for (const q of list) map.set(q.id, q);
      return map;
    },
  });
}
