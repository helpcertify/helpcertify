// Configurable content for the homepage's animated "I want to ___"
// certification-goal selector (CertificationGoalSelector.tsx). Add a new
// certification program by appending one entry here - no component code
// changes needed.
//
// `route` currently points every goal at the existing public sign-up flow:
// there is no unauthenticated per-category browsing route in this app yet
// (all catalogue/practice pages sit behind the student auth gate under
// /home/*), and the brief is explicit not to invent one. Once a public
// category route exists (e.g. an /exam-prep/:slug landing page), swap the
// relevant entries' `route` here - the component needs no other change.
export interface LearningGoal {
  /** Stable key - also used as the React list key. */
  id: string;
  /** Short label shown on the category pill. */
  category: string;
  /** Completes the sentence "I want to ___". */
  text: string;
  /** Where the arrow button navigates for this goal. */
  route: string;
}

export const LEARNING_GOALS: LearningGoal[] = [
  { id: 'cisa', category: 'CISA', text: 'prepare for the CISA exam', route: '/register' },
  { id: 'cism', category: 'CISM', text: 'prepare for the CISM exam', route: '/register' },
  { id: 'aws-cloud', category: 'AWS & Cloud', text: 'master AWS cloud concepts', route: '/register' },
  { id: 'cybersecurity', category: 'Cybersecurity', text: 'practice cybersecurity questions', route: '/register' },
  { id: 'ai-ml', category: 'AI & ML', text: 'prepare for AI security certifications', route: '/register' },
  { id: 'mock-score', category: 'Mock Score', text: 'improve my mock exam score', route: '/register' },
  { id: 'weak-domains', category: 'Weak Domains', text: 'identify my weak domains', route: '/register' },
  { id: 'study-plan', category: 'Study Plan', text: 'build a daily study plan', route: '/register' },
  { id: 'exam-ready', category: 'Exam Ready', text: 'know if I am exam-ready', route: '/register' },
  // Assumption: the brief's pill row includes "Project Management", which
  // has no matching phrase in the given rotating-phrase list - added one
  // extra goal here, in the same style as the others, so that pill has
  // something real to select. Remove or edit freely.
  { id: 'project-management', category: 'Project Management', text: 'prepare for the PMP exam', route: '/register' },
];

// The quick-select pills shown under the typing field - a curated subset of
// LEARNING_GOALS (by id), matching the brief's example pill row. Every id
// here must exist in LEARNING_GOALS above.
export const GOAL_PILL_IDS = ['cisa', 'cism', 'cybersecurity', 'aws-cloud', 'ai-ml', 'project-management'] as const;
