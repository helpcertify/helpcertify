import type { Timestamp } from 'firebase/firestore';

// Shared frontend-side types for the Quiz + Practice Test platform (v2).
// Safe to import from anywhere under src/ — the "no shared code" constraint
// only applies to frontend/api/*.ts (each bundled in isolation by Vercel).
// See functions/src/_migrated-v1-reference/README.md for what this replaced.

export type Role = 'student' | 'admin';

/** users/{uid} — doc id is the Firebase Auth uid. */
export interface UserDoc {
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type QuestionSourceFormat = 'standard' | 'cisa_qa';

export interface QuestionOption {
  id: string;
  text: string;
}

/** {quizzes|practiceTests}/{id}/questions/{questionId} — never contains the answer. */
export interface QuestionDoc {
  order: number;
  questionText: string;
  options: QuestionOption[];
}

/** .../questions/{questionId}/private/answerKey — split from the public doc because
 * Firestore has no field-level security, only document-level. */
export interface AnswerKeyDoc {
  correctOptionId: string;
  explanation?: string;
}

export type DurationType = 'overall' | 'per_question';

/** quizzes/{quizId} — a timed, strict, single-attempt exam quiz ("Exam Quiz Studio"). */
export interface QuizDoc {
  title: string;
  code: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  enforceSequentialNav: boolean;
  showImmediateResult: boolean;
  showFinalScore: boolean;
  durationType: DurationType;
  durationMinutes: number;
  scheduledStart: Timestamp | null;
  isPublished: boolean;
  antiCheat: { blockAltTab: boolean };
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** practiceTests/{testId} — a large, batched, resumable question bank ("Practice Manager"). */
export interface PracticeTestDoc {
  title: string;
  // Always set — the create form requires both bounds (unlike QuizDoc's
  // optional scheduledStart).
  availableFrom: Timestamp;
  availableUntil: Timestamp;
  durationPerSessionMinutes: number;
  defaultInitialBatchSize: number;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'expired';

/** quizAttempts/{attemptId} — one student's attempt at one quiz. */
export interface QuizAttemptDoc {
  userId: string;
  userName: string;
  quizId: string;
  quizTitle: string;
  status: AttemptStatus;
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
  expiresAt: Timestamp;
  totalQuestions: number;
  answeredCount: number;
  notAnsweredCount: number;
  incorrectCount: number;
  correctCount: number;
  marks: number;
  durationSeconds: number;
  exitCount: number;
}

/** quizAttempts/{attemptId}/answers/{questionId} */
export interface QuizAnswerDoc {
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  answeredAt: Timestamp;
}

/** practiceSessions/{sessionId} — one batch within a practice test. */
export interface PracticeSessionDoc {
  userId: string;
  testId: string;
  batchQuestionIds: string[];
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
  expiresAt: Timestamp;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  isReattempt: boolean;
}

/** practiceSessions/{sessionId}/answers/{questionId} — immediate feedback, so isCorrect is known right away. */
export interface PracticeAnswerDoc {
  selectedOptionId: string;
  isCorrect: boolean;
  answeredAt: Timestamp;
}

/** practiceProgress/{uid_testId} — denormalized so "resume, only unanswered" doesn't scan every past session. */
export interface PracticeProgressDoc {
  userId: string;
  testId: string;
  answeredQuestionIds: string[];
  lastBatchQuestionIds: string[];
  updatedAt: Timestamp;
}

/** adminLogs/{logId} */
export interface AdminLogDoc {
  performedBy: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: Timestamp;
}
