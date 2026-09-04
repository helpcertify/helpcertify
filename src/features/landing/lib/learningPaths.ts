// Static, homepage-only example content for the "Explore Learning Paths"
// section (see LandingPage.tsx). Purely illustrative - not backed by any
// certification/course database model - so an experienced professional can
// immediately see HelpCertify has Professional/Advanced content, not only
// Foundation material, without HelpCertify reading as a fresher-only
// training site.
//
// Deliberately minimal: an actual prerequisite roadmap (e.g. Cloud
// Engineer: IT Fundamentals -> Networking -> ... -> AWS/Azure -> Cloud
// Engineer) is out of scope for this pass - `prerequisiteId` below is
// reserved so that feature can build on this same array later instead of
// needing a new data model or another homepage rewrite.

export type LearningLevel = 'Foundation' | 'Professional' | 'Advanced';

export interface LearningPathExample {
  id: string;
  domain: string;
  title: string;
  level: LearningLevel;
  /** The id of the path a learner would typically complete first. Not
   *  rendered yet - reserved for a future prerequisite-roadmap feature. */
  prerequisiteId?: string;
}

export const LEARNING_DOMAINS = [
  'Cybersecurity',
  'Cloud',
  'IT & Infrastructure',
  'DevOps',
  'Software Development',
  'Data',
  'AI & Machine Learning',
  'Project Management',
];

export const LEARNING_PATH_EXAMPLES: LearningPathExample[] = [
  {
    id: 'cybersecurity-fundamentals',
    domain: 'Cybersecurity',
    title: 'Cybersecurity Fundamentals',
    level: 'Foundation',
  },
  {
    id: 'cloud-security-engineering',
    domain: 'Cloud',
    title: 'Cloud Security Engineering',
    level: 'Professional',
    prerequisiteId: 'cybersecurity-fundamentals',
  },
  {
    id: 'security-architecture',
    domain: 'Cybersecurity',
    title: 'Security Architecture',
    level: 'Advanced',
    prerequisiteId: 'cloud-security-engineering',
  },
];
