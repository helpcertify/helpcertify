import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { StudyPlanDoc } from '@/types/models';

// Reads only - the same direct-Firestore-read pattern this app already uses
// for a student's own practiceProgress/quizAttempts (see StudentHomePage.tsx),
// rather than a new backend action just to fetch back what was just saved.
// Writes go through practiceSessionApi.saveStudyPlan instead (see that
// file, and api/practice-session.ts's saveStudyPlan, for why).
export async function getStudyPlan(uid: string, testId: string): Promise<(StudyPlanDoc & { id: string }) | null> {
  try {
    const snap = await getDoc(doc(db, 'studyPlans', `${uid}_${testId}`));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as StudyPlanDoc) };
  } catch (err) {
    // Surface the real Firestore error (e.g. a security-rule gap) instead of
    // letting react-query swallow it into a silent "no plan found" state.
    console.error('getStudyPlan failed', err);
    throw err;
  }
}
