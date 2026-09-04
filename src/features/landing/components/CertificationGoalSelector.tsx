import { Link } from 'react-router-dom';
import { useTypewriter } from '../hooks/useTypewriter';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { GOAL_PILL_IDS, LEARNING_GOALS } from '../lib/learningGoals';

const PHRASES = LEARNING_GOALS.map((g) => g.text);
const PILL_GOALS = GOAL_PILL_IDS.map((id) => LEARNING_GOALS.find((g) => g.id === id)).filter(
  (g): g is (typeof LEARNING_GOALS)[number] => g != null,
);

// Animated "I want to ___" certification-goal picker for the homepage hero.
// Recreates the general interaction pattern of Educative.io's homepage
// (typed rotating intent + quick-pick category pills), rebuilt from scratch
// with HelpCertify's own blue/white visual language - no shared code or
// assets. See src/features/landing/lib/learningGoals.ts to add phrases.
export function CertificationGoalSelector() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { displayedText, activeIndex, setActiveIndex, isAnimating } = useTypewriter(PHRASES, {
    enabled: !prefersReducedMotion,
  });

  const activeGoal = LEARNING_GOALS[activeIndex] ?? LEARNING_GOALS[0];

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-surface-border bg-surface-raised text-left shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4 sm:px-6">
        {/* The full sentence is announced once to assistive tech via this
            visually-hidden node; the animated text beside it is aria-hidden
            so a screen reader isn't read the phrase character-by-character
            as it types. */}
        <p className="sr-only" aria-live="polite">
          I want to {activeGoal.text}
        </p>
        <div
          className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden text-base sm:text-lg"
          aria-hidden="true"
        >
          <span className="shrink-0 font-semibold text-ink">I want to</span>
          <span className="min-w-0 truncate whitespace-nowrap font-semibold text-brand-ink">
            {displayedText}
            {isAnimating && (
              <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-brand-ink align-baseline" style={{ height: '1em' }} />
            )}
          </span>
        </div>

        <Link
          to={activeGoal.route}
          aria-label={`Get started: ${activeGoal.text}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#155EEF] text-white transition hover:bg-[#004EEB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155EEF]"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-surface-border px-5 py-3 sm:px-6" role="group" aria-label="Jump to a certification goal">
        {PILL_GOALS.map((goal) => {
          const goalIndex = LEARNING_GOALS.indexOf(goal);
          const isActive = goalIndex === activeIndex;
          return (
            <button
              key={goal.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveIndex(goalIndex)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                isActive
                  ? 'border-brand-500 bg-brand-500/10 text-brand-ink'
                  : 'border-surface-border text-ink-muted hover:border-brand-400 hover:text-brand-ink'
              }`}
            >
              {goal.category}
            </button>
          );
        })}
      </div>
    </div>
  );
}
