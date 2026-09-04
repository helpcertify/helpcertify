import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';

// Trainer / Mentored Learning - Phase 1A. Every action here goes through
// api/content-admin.ts's trainer-gated actions (each does its own
// requireActiveTrainer + ownership check server-side) - see the comment
// block above requireActiveTrainer in that file for the full design.

export interface TrainingProgramSummary {
  id: string;
  title: string;
  description: string;
  assignedContent: { itemType: 'quiz' | 'practiceTest'; itemId: string; title: string }[];
  status: 'ACTIVE' | 'ARCHIVED';
  learnerCount: number;
  createdAt: unknown;
}

export interface ProgramLearnerRow {
  id: string;
  learnerUid: string;
  learnerName: string;
  learnerEmail: string;
  status: 'INVITED' | 'ACTIVE' | 'REMOVED';
}

// Direct client Firestore read, not a server action - firestore.rules
// already lets the owning trainer read a program's learners subcollection
// (same reasoning as PracticeTestsPage.tsx reading quizzes/practiceTests
// directly: no denormalization or cross-collection join is needed here).
export async function listProgramLearners(programId: string): Promise<ProgramLearnerRow[]> {
  const snap = await getDocs(
    query(collection(db, 'trainingPrograms', programId, 'learners'), orderBy('invitedAt', 'desc'))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ProgramLearnerRow, 'id'>) }))
    .filter((l) => l.status !== 'REMOVED');
}

export const trainerApi = {
  createProgram: (payload: { title: string; description?: string }) =>
    callAction<{ programId: string }>('content-admin', 'createTrainingProgram', payload),
  updateProgram: (payload: { programId: string; title?: string; description?: string }) =>
    callAction<{ success: true }>('content-admin', 'updateTrainingProgram', payload),
  archiveProgram: (programId: string) =>
    callAction<{ success: true }>('content-admin', 'archiveTrainingProgram', { programId }),
  listMyPrograms: () => callAction<{ programs: TrainingProgramSummary[] }>('content-admin', 'listMyTrainingPrograms'),
  addLearner: (payload: { programId: string; email: string }) =>
    callAction<{ success: true }>('content-admin', 'addLearnerToProgram', payload),
  removeLearner: (payload: { programId: string; learnerUid: string }) =>
    callAction<{ success: true }>('content-admin', 'removeLearnerFromProgram', payload),
  assignContent: (payload: { programId: string; itemType: 'quiz' | 'practiceTest'; itemId: string }) =>
    callAction<{ success: true }>('content-admin', 'assignContentToProgram', payload),
  unassignContent: (payload: { programId: string; itemType: 'quiz' | 'practiceTest'; itemId: string }) =>
    callAction<{ success: true }>('content-admin', 'unassignContentFromProgram', payload),
};

export interface MyTrainingProgramMembership {
  programId: string;
  membershipStatus: 'INVITED' | 'ACTIVE' | 'REMOVED';
  trainerName: string;
  title: string;
  description: string;
  programStatus: 'ACTIVE' | 'ARCHIVED';
  assignedContent: { itemType: 'quiz' | 'practiceTest'; itemId: string; title: string }[];
}

export const myTrainingApi = {
  listMyMemberships: () =>
    callAction<{ programs: MyTrainingProgramMembership[] }>('content-admin', 'listMyTrainingProgramMemberships'),
};
