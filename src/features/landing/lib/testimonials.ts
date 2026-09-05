// Compile-time testimonials rendered directly in the prerendered landing
// HTML (so they are crawlable and need no client fetch). Admin-editable
// testimonials are deliberately deferred - see the redesign plan. Keep
// these generic and honest: role + outcome, no fabricated names of real
// people, no invented company logos.

export interface Testimonial {
  quote: string;
  attribution: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'The batched practice sessions meant I could revise on my commute and pick up exactly where I stopped. The per-question breakdown showed me which two domains to focus my last week on.',
    attribution: 'Security analyst preparing for CISM',
  },
  {
    quote:
      'I sat three full timed mock exams before the real one. By the third, the pacing felt automatic and the score lined up almost exactly with my actual result.',
    attribution: 'Cloud engineer, AWS certification track',
  },
  {
    quote:
      'As a trainer I published my own question bank and had a private mock exam running for my cohort the same afternoon, without building any of the exam software myself.',
    attribution: 'Independent IT trainer',
  },
];
