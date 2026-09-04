// Configurable content for the homepage's animated "I want to ___"
// intent selector (CertificationGoalSelector.tsx). Add a new goal by
// appending one entry here - no component code changes needed.
//
// Kept deliberately brand-neutral (no individual certification names like
// "CISA"/"CISM") and framed around the visitor's goal rather than a
// technology category, per the "professionals + career starters" homepage
// positioning brief: HelpCertify must read as a learning, certification,
// and assessment platform for every career stage, not a fresher-only
// training site or a certification-question-bank-only site.
//
// `route` points most goals at the existing public sign-up flow: there is
// no unauthenticated per-category browsing route in this app yet (all
// catalogue/practice pages sit behind the student auth gate under /home/*),
// and the brief is explicit not to invent one. "build-assessment" is the
// one exception - it points at the real, already-public
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
  {
    id: 'professional-certification',
    category: 'Professional Certification',
    text: 'prepare for a professional certification',
    route: '/register',
  },
  {
    id: 'advance-cybersecurity-skills',
    category: 'Advance My Skills',
    text: 'advance my cybersecurity skills',
    route: '/register',
  },
  { id: 'cloud-engineering', category: 'Cloud Engineering', text: 'move into cloud engineering', route: '/register' },
  { id: 'devops', category: 'DevOps', text: 'learn DevOps', route: '/register' },
  {
    id: 'start-switch-career',
    category: 'Start / Switch Career',
    text: 'start or switch my IT career',
    route: '/register',
  },
  { id: 'assess-skills', category: 'Assess My Skills', text: 'assess my technical skills', route: '/register' },
  { id: 'create-course', category: 'Create a Course', text: 'create and sell a course', route: '/register' },
  {
    id: 'build-assessment',
    category: 'Build an Assessment',
    text: 'build my own assessment',
    route: '/build-your-own-exam',
  },
];

// The quick-select pills shown under the typing field - a curated subset of
// LEARNING_GOALS (by id), framed as user goals rather than technology
// categories (technology/domain filters still exist elsewhere on the
// homepage - see DOMAINS and LEARNING_DOMAINS in LandingPage.tsx). Every id
// here must exist in LEARNING_GOALS above.
export const GOAL_PILL_IDS = [
  'professional-certification',
  'advance-cybersecurity-skills',
  'start-switch-career',
  'create-course',
  'build-assessment',
] as const;
