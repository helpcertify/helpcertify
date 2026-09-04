// Configurable content for the homepage's animated "I want to ___"
// certification-goal selector (CertificationGoalSelector.tsx). Add a new
// goal by appending one entry here - no component code changes needed.
//
// Kept deliberately brand-neutral (no individual certification names like
// "CISA"/"CISM") per the homepage repositioning brief - phrases name broad
// categories (IT, cybersecurity, cloud, software development) or a product
// area (build an exam, create a course), never a specific exam.
//
// `route` points most goals at the existing public sign-up flow: there is
// no unauthenticated per-category browsing route in this app yet (all
// catalogue/practice pages sit behind the student auth gate under /home/*),
// and the brief is explicit not to invent one. "build-exam" is the one
// exception - it points at the real, already-public
// /build-your-own-exam marketing page. Once more public category routes
// exist, swap the relevant entries' `route` here - the component needs no
// other change.
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
  { id: 'it-certification', category: 'IT Certification', text: 'prepare for an IT certification', route: '/register' },
  {
    id: 'cybersecurity-certification',
    category: 'Cybersecurity',
    text: 'prepare for a cybersecurity certification',
    route: '/register',
  },
  { id: 'cloud-skills', category: 'Cloud', text: 'learn cloud skills', route: '/register' },
  { id: 'software-development', category: 'Software Development', text: 'learn software development', route: '/register' },
  { id: 'build-exam', category: 'Build an Exam', text: 'build my own practice exam', route: '/build-your-own-exam' },
  { id: 'create-course', category: 'Create a Course', text: 'create and sell a course', route: '/register' },
];

// The quick-select pills shown under the typing field - one per goal above,
// in the same order.
export const GOAL_PILL_IDS = [
  'it-certification',
  'cybersecurity-certification',
  'cloud-skills',
  'software-development',
  'build-exam',
  'create-course',
] as const;
