import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';
import { toDate } from '@/utils/formatDate';

// Custom Exam Builder - a student's own uploaded question bank. Create,
// delete, and submit-attempt need server logic (parsing, the entitlement
// check, and reading the private answer key respectively) and go through
// api/content-admin.ts's student-reachable actions below. Listing a
// student's own sets and reading one for taking are plain, direct Firestore
// reads instead - firestore.rules already gates customExamSets on
// ownerId == the caller, so there is no server action to write just for
// those two reads, matching how other student pages (e.g.
// PracticeTestsPage.tsx) read Firestore directly.

export interface CustomExamSetSummary {
  id: string;
  title: string;
  sourceFormat: 'standard' | 'cisa_qa';
  totalQuestions: number;
  status: 'ready' | 'failed';
  parseWarnings: string[];
  createdAt: Date | null;
}

export interface CustomExamQuestion {
  id: string;
  order: number;
  questionText: string;
  options: { id: string; text: string }[];
}

export interface CustomExamSetForTaking {
  id: string;
  title: string;
  totalQuestions: number;
  questions: CustomExamQuestion[];
}

export async function listMyCustomExamSets(uid: string): Promise<CustomExamSetSummary[]> {
  const snap = await getDocs(
    query(collection(db, 'customExamSets'), where('ownerId', '==', uid), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      title: v.title as string,
      sourceFormat: v.sourceFormat as 'standard' | 'cisa_qa',
      totalQuestions: (v.totalQuestions as number) ?? 0,
      status: (v.status as 'ready' | 'failed') ?? 'ready',
      parseWarnings: (v.parseWarnings as string[]) ?? [],
      createdAt: v.createdAt ? toDate(v.createdAt) : null,
    };
  });
}

export async function getCustomExamSetForTaking(setId: string): Promise<CustomExamSetForTaking> {
  const setRef = doc(db, 'customExamSets', setId);
  const setSnap = await getDoc(setRef);
  if (!setSnap.exists()) throw new Error('Custom exam set not found');
  const data = setSnap.data();
  const qSnap = await getDocs(query(collection(setRef, 'questions'), orderBy('order')));
  return {
    id: setSnap.id,
    title: data.title as string,
    totalQuestions: (data.totalQuestions as number) ?? qSnap.size,
    questions: qSnap.docs.map((q) => ({
      id: q.id,
      order: q.data().order as number,
      questionText: q.data().questionText as string,
      options: q.data().options as { id: string; text: string }[],
    })),
  };
}

export const customExamApi = {
  create: (payload: { title: string; fileUrl: string }) =>
    callAction<{ setId: string; totalQuestions: number; parseErrors: unknown[]; parseWarnings: string[] }>(
      'content-admin',
      'createCustomExamSet',
      payload
    ),
  delete: (setId: string) =>
    callAction<{ success: true }>('content-admin', 'deleteMyCustomExamSet', { setId }),
  submitAttempt: (payload: { setId: string; mode: 'practice' | 'mock'; answers: Record<string, string> }) =>
    callAction<{ attemptId: string; correctCount: number; totalQuestions: number; scorePercent: number }>(
      'content-admin',
      'submitCustomExamAttempt',
      payload
    ),
};
